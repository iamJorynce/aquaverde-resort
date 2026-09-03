'use client'

import { Fragment, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { todayInManila, nightsBetween } from '@/lib/bookingDates'
import { printReceipt } from './receipt'
import { isPaymentValid, paymentValidationMessage } from './PaymentCalculator'
import PaymentCalculator from './PaymentCalculator'
import { createOrUpdateInvoice } from './invoiceUtils'
import { logActivity } from './activityLog'
import { useResortSettings } from '@/hooks/useResortSettings'

// A "group" is one or more room bookings that were made together (a guest
// booking multiple rooms in one transaction). Ungrouped bookings become a
// group of exactly 1. All UI and actions operate on groups so a guest with
// 3 rooms shows as ONE row / ONE check-in / ONE check-out, not three.
interface BookingGroup {
  key: string
  primary: any
  items: any[]
  roomLabel: string
  extraCottageNames: string[]
  extraEquipment: { name: string; quantity: number; returned: boolean }[]
}

function groupRows(bookings: any[]): BookingGroup[] {
  const map: Record<string, any[]> = {}
  bookings.forEach(b => {
    const key = b.group_number ?? b.id
    if (!map[key]) map[key] = []
    map[key].push(b)
  })
  return Object.values(map).map(items => {
    const primary = items.find((b: any) => b.is_group_primary !== false) ?? items[0]
    const roomLabels = items.map((b: any) => {
      const cottageNames: string[] = b.extraCottageNames ?? (b.cottages ? [(b.cottages as any).name] : [])
      const parts: string[] = []
      if (b.rooms) parts.push(`Room ${b.rooms.room_number}`)
      parts.push(...cottageNames)
      return parts.length > 0 ? parts.join(' + ') : b.booking_number
    })
    // De-duped across every booking in the group, for the "Extras" badges.
    const extraCottageNames = Array.from(new Set(items.flatMap((b: any) => b.extraCottageNames ?? [])))
    const extraEquipment = items.flatMap((b: any) => b.extraEquipment ?? [])
    return {
      key: primary.group_number ?? primary.id,
      primary,
      items,
      roomLabel: roomLabels.join(', '),
      extraCottageNames,
      extraEquipment,
    }
  })
}

function groupBalance(group: BookingGroup) {
  return group.items.reduce((s, b) => s + Math.max(0, Number(b.total_amount) - Number(b.amount_paid)), 0)
}
function groupTotal(group: BookingGroup) {
  return group.items.reduce((s, b) => s + Number(b.total_amount), 0)
}
function groupPaid(group: BookingGroup) {
  return group.items.reduce((s, b) => s + Number(b.amount_paid), 0)
}

// Cottage price for a day-use add-on, priced off whichever pass period
// (day/night) the guest is on — falls back to the other rate if one
// isn't configured for that cottage.
function cottagePriceFor(booking: any, cottage: any) {
  const price = booking.period === 'night'
    ? (cottage.overnight_rate || cottage.day_rate)
    : (cottage.day_rate || cottage.overnight_rate)
  return price || 0
}

// Small chip list showing cottages/equipment attached to a booking group
// (whether from the original booking or added mid-stay) — the Room/Cottage
// column only ever showed one label, so anything added later was invisible
// outside the "View Bill" modal.
function ExtrasBadges({ group }: { group: BookingGroup }) {
  const cottages = group.extraCottageNames ?? []
  const equipment = group.extraEquipment ?? []
  if (cottages.length === 0 && equipment.length === 0) {
    return <span className="text-gray-300">—</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {cottages.map((name, i) => (
        <span key={`c-${i}`} className="text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
          🏠 {name}
        </span>
      ))}
      {equipment.map((e, i) => (
        <span key={`e-${i}`}
          className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${e.returned ? 'bg-gray-100 text-gray-400' : 'bg-amber-50 text-amber-700'}`}>
          🏄 {e.name} × {e.quantity}{e.returned ? ' (returned)' : ''}
        </span>
      ))}
    </div>
  )
}

export default function CheckInOutPage() {
  const supabase = createClient()
  const { settings: resortSettings } = useResortSettings()

  const [tab, setTab] = useState<'in' | 'active' | 'out' | 'dayuse_day' | 'dayuse_night'>('in')
  // Which "Due for Check-Out" groups are expanded to show each booking
  // individually so front desk can check guests out one room at a time
  // instead of only "Check Out All" for the whole group.
  const [expandedCheckoutGroups, setExpandedCheckoutGroups] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [pendingCheckins, setPendingCheckins]   = useState<any[]>([])
  const [activeStays, setActiveStays]           = useState<any[]>([])
  const [pendingCheckouts, setPendingCheckouts] = useState<any[]>([])
  const [activeDayUse, setActiveDayUse]         = useState<any[]>([])
  const [loading, setLoading]                   = useState(true)
  const [toast, setToast]                       = useState('')

  // Check-in balance payment modal (works on a GROUP)
  const [checkinPaymentModal, setCheckinPaymentModal] = useState<BookingGroup | null>(null)
  const [checkinAmount, setCheckinAmount] = useState(0)
  const [checkinMethod, setCheckinMethod] = useState('cash')
  const [processingCheckin, setProcessingCheckin] = useState(false)

  // Bill detail modal (view-only, works on a GROUP)
  const [billDetail, setBillDetail] = useState<{ group: BookingGroup; addons: any[]; posOrders: any[] } | null>(null)

  // Checkout payment modal (works on a GROUP)
  // mode: 'checkout' ends the stay (status→checked_out, room/cottage→cleaning,
  // housekeeping task, "Check-out Receipt"). mode: 'payment' just records
  // money received mid-stay — nothing else changes. Both reuse this modal
  // since the bill breakdown UI is identical; confirmCheckout() branches on mode.
  const [checkoutModal, setCheckoutModal] = useState<{ group: BookingGroup; addons: any[]; posOrders: any[]; mode: 'checkout' | 'payment' } | null>(null)
  const [checkoutAmount, setCheckoutAmount] = useState(0)
  const [checkoutMethod, setCheckoutMethod] = useState('cash')
  const [processingCheckout, setProcessingCheckout] = useState(false)

  // Equipment damage check modal — equipment/cottage extras always live on
  // the PRIMARY booking of a group, so this stays keyed to primary.id
  const [equipmentCheckModal, setEquipmentCheckModal] = useState<any[]>([])
  const [equipmentConditions, setEquipmentConditions] = useState<Record<string, {
    condition: 'good' | 'damaged'; notes: string; charge: number
  }>>({})
  const [pendingCheckoutGroup, setPendingCheckoutGroup] = useState<BookingGroup | null>(null)

  // Day use damage payment modal
  const [damagePaymentModal, setDamagePaymentModal] = useState<{
    finalBooking: any; damageTotal: number; allCottageIds: string[]
  } | null>(null)
  const [damagePaymentMethod, setDamagePaymentMethod] = useState('cash')
  const [damagePaymentAmount, setDamagePaymentAmount] = useState(0)

  // "Add Extra" modal — lets front desk charge a cottage (or an extra room)
  // to an ALREADY checked-in guest's bill, same "charge to room" idea as
  // Equipment. Cottage add-ons get category: 'cottage_addon' so Remittance
  // and Reports can break them out as their own line instead of everything
  // silently folding into the "room" bucket at checkout.
  const [addExtraModal, setAddExtraModal] = useState<BookingGroup | null>(null)
  const [addExtraType, setAddExtraType] = useState<'cottage' | 'room'>('cottage')
  const [availableCottages, setAvailableCottages] = useState<any[]>([])
  const [availableExtraRooms, setAvailableExtraRooms] = useState<any[]>([])
  const [selectedExtraId, setSelectedExtraId] = useState('')
  const [addingExtra, setAddingExtra] = useState(false)

  // "Add Room" for a day-use guest who decides mid-visit to stay overnight.
  // Creates a real, separate overnight room booking linked to the day-use
  // guest (same guest_id, shared group_number) — the day-use entry itself
  // is untouched and still checks out normally through equipment return.
  const [dayUseAddRoomModal, setDayUseAddRoomModal] = useState<any>(null)
  const [dayUseAvailableRooms, setDayUseAvailableRooms] = useState<any[]>([])
  const [dayUseSelectedRoomId, setDayUseSelectedRoomId] = useState('')
  const [dayUseRoomNights, setDayUseRoomNights] = useState(1)
  const [dayUseRoomPax, setDayUseRoomPax] = useState(1)
  const [addingDayUseRoom, setAddingDayUseRoom] = useState(false)

  // "Add Cottage" for a Day/Night Pass guest who decides mid-visit to rent
  // a cottage — charges it to their existing day-use bill (booking_addons,
  // category 'cottage_addon'), priced off the same day/night period they
  // checked in under. Mirrors the "Add Room" flow above.
  const [dayUseAddCottageModal, setDayUseAddCottageModal] = useState<any>(null)
  const [dayUseAvailableCottages, setDayUseAvailableCottages] = useState<any[]>([])
  const [dayUseSelectedCottageId, setDayUseSelectedCottageId] = useState('')
  const [dayUseCottageMethod, setDayUseCottageMethod] = useState('cash')
  const [dayUseCottageAmount, setDayUseCottageAmount] = useState(0)
  const [addingDayUseCottage, setAddingDayUseCottage] = useState(false)

  // ---- Load ----
  async function load() {
    setLoading(true)
    const today = todayInManila()

    const [{ data: checkins }, { data: active }, { data: checkouts }, { data: dayUse }] = await Promise.all([
      supabase.from('bookings')
        .select('*, guests(full_name, phone), rooms(room_number, id), cottages(name, cottage_code, id), group_number, is_group_primary, cottage_ids')
        // Only 'confirmed' — a 'pending' booking's payment proof hasn't
        // been reviewed/approved yet in BookingsPanel. Letting front desk
        // check those in here would skip that verification step entirely.
        .eq('status', 'confirmed')
        .lte('check_in_date', today)
        .not('accommodation_type', 'eq', 'day_use'),

      supabase.from('bookings')
        .select('*, guests(full_name, phone), rooms(room_number, id), cottages(name, cottage_code, id), cottage_ids, group_number, is_group_primary')
        .eq('status', 'checked_in')
        .not('accommodation_type', 'eq', 'day_use')
        .order('check_out_date'),

      supabase.from('bookings')
        .select('*, guests(full_name, phone), rooms(room_number, id), cottages(name, cottage_code, id), cottage_ids, group_number, is_group_primary')
        .eq('status', 'checked_in')
        .not('accommodation_type', 'eq', 'day_use')
        .lte('check_out_date', today),

      supabase.from('bookings')
        .select('id, booking_number, special_requests, created_at, check_in_date, num_adults, num_children, num_seniors, num_pwd, cottage_id, cottage_ids, guest_id, group_number, is_group_primary, booking_type, wristband_number, period')
        .eq('accommodation_type', 'day_use')
        .eq('status', 'checked_in')
        .order('created_at', { ascending: false }),
    ])

    const dayUseWithEquipment = await Promise.all(
      (dayUse ?? []).map(async (b: any) => {
        const { data: rentals } = await supabase
          .from('equipment_rentals')
          .select('id, equipment_id, quantity, rental_start, equipment(name)')
          .eq('booking_id', b.id)
          .is('rental_end', null)
        return { ...b, rentals: rentals ?? [] }
      })
    )

    // Extras (cottages/equipment added mid-stay) live in booking_addons and
    // equipment_rentals, keyed off booking_id — not on the booking row
    // itself. The guest tables only showed a single room OR cottage label
    // and never showed equipment at all, so any cottage/equipment added
    // after check-in was invisible outside the "View Bill" modal. Pull
    // everything up front here and attach it to each booking row so the
    // Active Stays / Due for Check-out tables can show it directly.
    const overnightIds = [...(active ?? []), ...(checkouts ?? [])].map((b: any) => b.id)
    const [{ data: allCottages }, { data: extraAddons }, { data: extraEquipment }] = await Promise.all([
      supabase.from('cottages').select('id, name'),
      overnightIds.length
        ? supabase.from('booking_addons').select('booking_id, name, category').in('booking_id', overnightIds)
        : Promise.resolve({ data: [] as any[] }),
      overnightIds.length
        ? supabase.from('equipment_rentals').select('booking_id, quantity, rental_end, equipment(name)').in('booking_id', overnightIds)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const cottageNameById: Record<string, string> = Object.fromEntries((allCottages ?? []).map((c: any) => [c.id, c.name]))
    const addonsByBooking: Record<string, any[]> = {}
    ;(extraAddons ?? []).forEach((a: any) => { (addonsByBooking[a.booking_id] ??= []).push(a) })
    const equipmentByBooking: Record<string, any[]> = {}
    ;(extraEquipment ?? []).forEach((e: any) => { (equipmentByBooking[e.booking_id] ??= []).push(e) })

    function withExtras(b: any) {
      // Every cottage on the booking (original + any added later), by
      // name — cottage_ids covers all of them; cottage_id/the joined
      // `cottages` relation only ever reflects one.
      const cottageIds: string[] = b.cottage_ids?.length ? b.cottage_ids : (b.cottage_id ? [b.cottage_id] : [])
      const allCottageNames = cottageIds.map(id => cottageNameById[id]).filter(Boolean)
      const addedCottageNames = (addonsByBooking[b.id] ?? [])
        .filter((a: any) => a.category === 'cottage_addon')
        .map((a: any) => a.name.replace(/^Cottage — /, ''))
      // Union, de-duped — an added cottage is already counted via
      // cottage_ids once the booking row is updated, but keep the addon
      // name as a fallback in case cottage_ids didn't get updated.
      const cottageNames = Array.from(new Set([...allCottageNames, ...addedCottageNames]))
      const equipmentItems = (equipmentByBooking[b.id] ?? []).map((e: any) => ({
        name: (e.equipment as any)?.name ?? 'Equipment',
        quantity: e.quantity,
        returned: !!e.rental_end,
      }))
      return { ...b, extraCottageNames: cottageNames, extraEquipment: equipmentItems }
    }

    setPendingCheckins(checkins ?? [])
    setActiveStays((active ?? []).map(withExtras))
    setPendingCheckouts((checkouts ?? []).map(withExtras))
    // Day/Night Pass guests never got cottage names resolved either — the
    // card only showed a generic "Cottage" badge, not which one, because
    // the day-use query doesn't join `cottages` at all. Reuse the same
    // cottageNameById map built above.
    setActiveDayUse(dayUseWithEquipment.map((b: any) => {
      const cottageIds: string[] = b.cottage_ids?.length ? b.cottage_ids : (b.cottage_id ? [b.cottage_id] : [])
      const cottageNames = cottageIds.map(id => cottageNameById[id]).filter(Boolean)
      return { ...b, extraCottageNames: cottageNames }
    }))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 4000) }

  // ---- Check-in (operates on a whole group) ----
  async function handleCheckIn(group: BookingGroup) {
    const balance = groupBalance(group)
    if (balance > 0) {
      setCheckinPaymentModal(group)
      setCheckinAmount(balance)
      setCheckinMethod('cash')
      return
    }
    await finalizeCheckIn(group, 0, null)
  }

  async function finalizeCheckIn(group: BookingGroup, paidNow: number, method: string | null) {
    setProcessingCheckin(true)
    const wristband = `WB-${Date.now().toString().slice(-6)}`
    const totalGroupBalance = groupBalance(group)

    for (const booking of group.items) {
      const bookingBalance = Math.max(0, Number(booking.total_amount) - Number(booking.amount_paid))
      const share = totalGroupBalance > 0 ? Math.round((bookingBalance / totalGroupBalance) * paidNow) : 0
      const newAmountPaid = Number(booking.amount_paid) + share

      const { error } = await supabase.from('bookings').update({
        status: 'checked_in',
        actual_check_in: new Date().toISOString(),
        wristband_number: wristband,
        amount_paid: newAmountPaid,
        payment_status: newAmountPaid >= Number(booking.total_amount) ? 'paid' : 'partial',
      }).eq('id', booking.id)

      if (error) { showToast('Error: ' + error.message); setProcessingCheckin(false); return }

      if (booking.room_id) await supabase.from('rooms').update({ status: 'occupied' }).eq('id', booking.room_id)
      if (booking.cottage_id) await supabase.from('cottages').update({ status: 'occupied' }).eq('id', booking.cottage_id)
    }

    if (paidNow > 0 && method) {
      await supabase.from('transactions').insert({
        status: 'completed',
        txn_number: `TXN-${Date.now()}`,
        booking_id: group.primary.id,
        guest_id: group.primary.guest_id,
        txn_type: 'room',
        description: `Balance payment at check-in — ${group.roomLabel}`,
        amount: paidNow,
        payment_method: method,
      })
    }

    showToast(`${(group.primary.guests as any)?.full_name} checked in! Wristband: ${wristband}${paidNow > 0 ? ` · ₱${paidNow.toLocaleString()} balance collected` : ''}`)
    setCheckinPaymentModal(null)
    setProcessingCheckin(false)
    load()
  }

  async function confirmCheckInPayment() {
    if (!checkinPaymentModal) return
    await finalizeCheckIn(checkinPaymentModal, checkinAmount, checkinMethod)
  }

  // ---- View bill (operates on a whole group) ----
  async function viewBill(group: BookingGroup) {
    // Fetch addons for ALL bookings in the group (not just primary)
    // so equipment/extras charged to any room in the group are shown
    const allBookingIds = group.items.map((b: any) => b.id)

    const [{ data: addons }, { data: posOrders }] = await Promise.all([
      supabase.from('booking_addons')
        .select('*')
        .in('booking_id', allBookingIds)
        .order('created_at'),
      supabase.from('orders')
        .select('id, order_number, total, created_at, order_items(quantity, unit_price, subtotal, menu_items(name))')
        .in('booking_id', allBookingIds)
        .eq('order_type', 'room_service')
        .order('created_at'),
    ])
    setBillDetail({ group, addons: addons ?? [], posOrders: posOrders ?? [] })
  }

  // ---- Add Extra (cottage or extra room) to an already-checked-in group ----
  async function openAddExtraModal(group: BookingGroup) {
    setAddExtraType('cottage')
    setSelectedExtraId('')
    setAddExtraModal(group)

    const [{ data: cottages }, { data: overlappingRoomBookings }, { data: allRoomsForExtra }] = await Promise.all([
      supabase.from('cottages').select('id, name, cottage_code, day_rate, overnight_rate').eq('status', 'available').order('name'),
      // Rooms already booked/occupied for this group's stay window — same
      // overlap logic as the public booking form, so we never offer a
      // room that's actually taken for those dates.
      supabase.from('vw_room_booking_ranges')
        .select('room_id')
        .not('room_id', 'is', null)
        .lt('check_in_date', group.primary.check_out_date)
        .gt('check_out_date', group.primary.check_in_date),
      // Also filter by the room's own status — belt-and-suspenders with
      // the date-overlap check above: a room out for maintenance has no
      // booking row to overlap against, and if the overlap query above
      // ever comes back empty (RLS, view hiccup, etc.) this still keeps
      // already-occupied/reserved rooms out of the picker instead of
      // silently showing everything.
      supabase.from('rooms').select('id, room_number, room_types_config(name, base_rate)').eq('status', 'available').order('room_number'),
    ])

    const bookedRoomIds = new Set((overlappingRoomBookings ?? []).map((b: any) => b.room_id))
    setAvailableCottages(cottages ?? [])
    setAvailableExtraRooms((allRoomsForExtra ?? []).filter((r: any) => !bookedRoomIds.has(r.id)))
  }

  async function confirmAddExtra() {
    if (!addExtraModal || !selectedExtraId) return
    const group = addExtraModal
    setAddingExtra(true)

    const nights = Math.max(1, nightsBetween(group.primary.check_in_date, group.primary.check_out_date))

    try {
      if (addExtraType === 'cottage') {
        const c = availableCottages.find(x => x.id === selectedExtraId)
        if (!c) throw new Error('Please select a cottage.')
        const unitPrice = c.overnight_rate || c.day_rate
        const total = unitPrice * nights

        const { error: addonError } = await supabase.from('booking_addons').insert({
          booking_id: group.primary.id,
          name: `Cottage — ${c.name}`,
          quantity: nights,
          unit_price: unitPrice,
          category: 'cottage_addon',
        })
        if (addonError) throw new Error(addonError.message)

        await supabase.from('cottages').update({ status: 'occupied' }).eq('id', c.id)

        const existingCottageIds: string[] = group.primary.cottage_ids ?? (group.primary.cottage_id ? [group.primary.cottage_id] : [])
        await supabase.from('bookings').update({
          cottage_id: group.primary.cottage_id ?? c.id,
          cottage_ids: [...existingCottageIds, c.id],
          extras_total: Number(group.primary.extras_total ?? 0) + total,
          total_amount: Number(group.primary.total_amount) + total,
        }).eq('id', group.primary.id)

        showToast(`${c.name} added to ${(group.primary.guests as any)?.full_name}'s bill — ₱${total.toLocaleString()} (collected at check-out).`)
      } else {
        const r = availableExtraRooms.find(x => x.id === selectedExtraId)
        if (!r) throw new Error('Please select a room.')
        const rate = (r.room_types_config as any)?.base_rate ?? 0
        const total = rate * nights

        // An extra room becomes its own booking row (like the original
        // rooms in the group) so availability blocking, housekeeping, and
        // checkout all work exactly the same way — it just rides along in
        // the same group_number as the rest of the stay.
        let groupNumber = group.primary.group_number
        if (!groupNumber) {
          groupNumber = `GRP-${Date.now()}`
          await supabase.from('bookings').update({ group_number: groupNumber, is_group_primary: true }).eq('id', group.primary.id)
        }

        const { error: bookingError } = await supabase.from('bookings').insert({
          guest_id: group.primary.guest_id,
          room_id: r.id,
          accommodation_type: 'room',
          booking_type: group.primary.booking_type,
          num_adults: 0, num_children: 0,
          group_number: groupNumber,
          is_group_primary: false,
          check_in_date: group.primary.check_in_date,
          check_out_date: group.primary.check_out_date,
          subtotal: total,
          extras_total: 0,
          total_amount: total,
          amount_paid: 0,
          payment_status: 'unpaid',
          status: 'checked_in',
          actual_check_in: new Date().toISOString(),
          wristband_number: group.primary.wristband_number,
          special_requests: `Extra room added mid-stay for ${(group.primary.guests as any)?.full_name}`,
        })
        if (bookingError) throw new Error(bookingError.message)

        await supabase.from('rooms').update({ status: 'occupied' }).eq('id', r.id)

        showToast(`Room ${r.room_number} added to ${(group.primary.guests as any)?.full_name}'s stay — ₱${total.toLocaleString()} (collected at check-out).`)
      }

      setAddExtraModal(null)
      setSelectedExtraId('')
      load()
    } catch (err: any) {
      showToast('Error: ' + (err.message || 'Could not add extra.'))
    } finally {
      setAddingExtra(false)
    }
  }

  // ---- Day-use guest decides to add an overnight room mid-visit ----
  async function openDayUseAddRoomModal(b: any) {
    setDayUseSelectedRoomId('')
    setDayUseRoomNights(1)
    // Default to this guest's own day-use headcount — staff can adjust
    // down if only part of the group is the one staying overnight.
    const groupPax = (b.num_adults ?? 0) + (b.num_children ?? 0) + (b.num_seniors ?? 0) + (b.num_pwd ?? 0)
    setDayUseRoomPax(Math.max(1, groupPax))
    setDayUseAddRoomModal(b)

    const today = todayInManila()
    const { data: overlappingRoomBookings } = await supabase
      .from('vw_room_booking_ranges')
      .select('room_id')
      .not('room_id', 'is', null)
      .lt('check_in_date', today)
      .gt('check_out_date', today)
    const bookedRoomIds = new Set((overlappingRoomBookings ?? []).map((x: any) => x.room_id))

    // Filter by room status too (not just the date-overlap check) so a
    // room out for maintenance, or one that's occupied/reserved without
    // a matching row in the overlap view, never shows up as pickable.
    const { data: allRooms } = await supabase.from('rooms').select('id, room_number, room_types_config(name, base_rate, max_capacity)').eq('status', 'available').order('room_number')
    setDayUseAvailableRooms((allRooms ?? []).filter((r: any) => !bookedRoomIds.has(r.id)))
  }

  async function confirmDayUseAddRoom() {
    if (!dayUseAddRoomModal || !dayUseSelectedRoomId) return
    const b = dayUseAddRoomModal
    const r = dayUseAvailableRooms.find(x => x.id === dayUseSelectedRoomId)
    if (!r) return
    const cap = (r.room_types_config as any)?.max_capacity ?? 0
    if (dayUseRoomPax > cap) return // guarded in the UI too — see disabled state below
    setAddingDayUseRoom(true)

    try {
      const nights = Math.max(1, dayUseRoomNights)
      const rate = (r.room_types_config as any)?.base_rate ?? 0
      const total = rate * nights
      const today = todayInManila()
      const checkOut = new Date(new Date(today).getTime() + nights * 86400000).toISOString().slice(0, 10)

      let groupNumber = b.group_number
      if (!groupNumber) {
        groupNumber = `GRP-${Date.now()}`
        await supabase.from('bookings').update({ group_number: groupNumber, is_group_primary: true }).eq('id', b.id)
      }

      const guestName = b.special_requests?.replace('Day Use Guest: ', '').split('\n')[0] || b.booking_number

      const { error } = await supabase.from('bookings').insert({
        guest_id: b.guest_id,
        room_id: r.id,
        accommodation_type: 'room',
        booking_type: b.booking_type ?? 'walk_in',
        num_adults: dayUseRoomPax, num_children: 0,
        group_number: groupNumber,
        is_group_primary: false,
        check_in_date: today,
        check_out_date: checkOut,
        subtotal: total,
        extras_total: 0,
        total_amount: total,
        amount_paid: 0,
        payment_status: 'unpaid',
        status: 'checked_in',
        actual_check_in: new Date().toISOString(),
        wristband_number: b.wristband_number,
        special_requests: `Room added — originally a day-use guest (${guestName})`,
      })
      if (error) throw new Error(error.message)

      await supabase.from('rooms').update({ status: 'occupied' }).eq('id', r.id)

      showToast(`Room ${r.room_number} added for ${guestName} — ₱${total.toLocaleString()} (${nights} night${nights > 1 ? 's' : ''}). Now showing under Active Stays too.`)
      setDayUseAddRoomModal(null)
      setDayUseSelectedRoomId('')
      load()
    } catch (err: any) {
      showToast('Error: ' + (err.message || 'Could not add room.'))
    } finally {
      setAddingDayUseRoom(false)
    }
  }

  // ---- Day-use guest decides to add a cottage mid-visit ----
  // Unlike overnight "Add Extra", day-use checkout never runs the group
  // checkout/payment flow, so there's no later step that would collect
  // cash for this or print a receipt. Payment is collected right here,
  // at add-time, same as the guest paying for it at the counter.
  async function openDayUseAddCottageModal(b: any) {
    setDayUseSelectedCottageId('')
    setDayUseCottageMethod('cash')
    setDayUseCottageAmount(0)
    setDayUseAddCottageModal(b)
    const { data: cottages } = await supabase
      .from('cottages')
      .select('id, name, cottage_code, day_rate, overnight_rate')
      .eq('status', 'available')
      .order('name')
    setDayUseAvailableCottages(cottages ?? [])
  }

  async function confirmDayUseAddCottage() {
    if (!dayUseAddCottageModal || !dayUseSelectedCottageId) return
    const b = dayUseAddCottageModal
    const c = dayUseAvailableCottages.find(x => x.id === dayUseSelectedCottageId)
    if (!c) return
    if (!isPaymentValid(dayUseCottageMethod, cottagePriceFor(b, c), dayUseCottageAmount)) return
    setAddingDayUseCottage(true)

    try {
      // Price off whichever period this guest is on (day pass vs night pass);
      // fall back to the other rate if one isn't configured.
      const total = cottagePriceFor(b, c)

      const { error: addonError } = await supabase.from('booking_addons').insert({
        booking_id: b.id,
        name: `Cottage — ${c.name}`,
        quantity: 1,
        unit_price: total,
        category: 'cottage_addon',
      })
      if (addonError) throw new Error(addonError.message)

      await supabase.from('cottages').update({ status: 'occupied' }).eq('id', c.id)

      const existingCottageIds: string[] = b.cottage_ids ?? (b.cottage_id ? [b.cottage_id] : [])
      const { error } = await supabase.from('bookings').update({
        cottage_id: b.cottage_id ?? c.id,
        cottage_ids: [...existingCottageIds, c.id],
      }).eq('id', b.id)
      if (error) throw new Error(error.message)

      // Collect payment now — day-use checkout never processes payment/
      // receipts on its own, so this is the only point money for this
      // cottage gets logged. txn_type: 'room' so it rolls into the same
      // "Walk-in / Room Bookings" total in Remittance as every other
      // room/cottage charge, instead of only appearing as an annotation.
      await supabase.from('transactions').insert({
        status: 'completed',
        txn_number: `TXN-${Date.now()}`,
        booking_id: b.id,
        guest_id: b.guest_id,
        txn_type: 'room',
        description: `Cottage add-on (Day Use) — ${c.name} — ${b.booking_number}`,
        amount: total,
        payment_method: dayUseCottageMethod,
      })

      const guestName = b.special_requests?.replace('Day Use Guest: ', '').split('\n')[0] || b.booking_number

      printReceipt({
        title: resortSettings.resort_name,
        subtitle: resortSettings.address,
        receiptNumber: b.booking_number,
        receiptType: 'Cottage Add-on Receipt',
        date: new Date().toLocaleDateString('en-PH', { dateStyle: 'medium' }),
        guestName,
        lineItems: [{ label: `Cottage — ${c.name} (${b.period === 'night' ? 'Night' : 'Day'} rate)`, amount: total }],
        total,
        amountPaid: total,
        balance: 0,
        paymentMethod: dayUseCottageMethod,
        checkindate: '',
        checkoutdate: '',
      })

      showToast(`${c.name} added for ${guestName} — ₱${total.toLocaleString()} collected (${dayUseCottageMethod}).`)
      setDayUseAddCottageModal(null)
      setDayUseSelectedCottageId('')
      load()
    } catch (err: any) {
      showToast('Error: ' + (err.message || 'Could not add cottage.'))
    } finally {
      setAddingDayUseCottage(false)
    }
  }

  // ---- Open checkout modal (checks for equipment first, operates on group) ----
  async function openCheckoutModal(group: BookingGroup) {
    const balance = groupBalance(group)
    const allBookingIds = group.items.map((b: any) => b.id)

    const [{ data: addons }, { data: rentals }, { data: posOrders }] = await Promise.all([
      supabase.from('booking_addons')
        .select('*')
        .in('booking_id', allBookingIds)
        .order('created_at'),
      supabase.from('equipment_rentals')
        .select('id, equipment_id, quantity, equipment(name)')
        .in('booking_id', allBookingIds)
        .is('rental_end', null),
      supabase.from('orders')
        .select('id, order_number, total, created_at, order_items(quantity, unit_price, subtotal, menu_items(name))')
        .in('booking_id', allBookingIds)
        .eq('order_type', 'room_service')
        .order('created_at'),
    ])

    if (rentals && rentals.length > 0) {
      setEquipmentCheckModal(rentals)
      setEquipmentConditions(Object.fromEntries(
        rentals.map((r: any) => [r.id, { condition: "good", notes: "", charge: 0 }])
      ))
      setPendingCheckoutGroup(group)
    } else {
      setCheckoutModal({ group, addons: addons ?? [], posOrders: posOrders ?? [], mode: 'checkout' })
      setCheckoutAmount(balance)
      setCheckoutMethod("cash")
    }
  }

  // ---- Record a payment mid-stay (does NOT check the guest out) ----
  // No equipment-return gate here on purpose: the guest is staying, so
  // there's nothing to inspect/return yet. This just logs money received
  // against the bill.
  async function openRecordPaymentModal(group: BookingGroup) {
    const balance = groupBalance(group)
    const allBookingIds = group.items.map((b: any) => b.id)

    const [{ data: addons }, { data: posOrders }] = await Promise.all([
      supabase.from('booking_addons').select('*').in('booking_id', allBookingIds).order('created_at'),
      supabase.from('orders')
        .select('id, order_number, total, created_at, order_items(quantity, unit_price, subtotal, menu_items(name))')
        .in('booking_id', allBookingIds)
        .eq('order_type', 'room_service')
        .order('created_at'),
    ])

    setCheckoutModal({ group, addons: addons ?? [], posOrders: posOrders ?? [], mode: 'payment' })
    setCheckoutAmount(balance)
    setCheckoutMethod('cash')
  }

  // ---- Confirm equipment check (overnight groups only reach here; day use handled separately below) ----
  async function confirmEquipmentCheck() {
    if (!pendingCheckoutGroup) return
    const group = pendingCheckoutGroup
    const returnedAt = new Date().toISOString()

    for (const rental of equipmentCheckModal) {
      const cond = equipmentConditions[rental.id]
      await supabase.from('equipment_rentals').update({
        rental_end: returnedAt,
        returned_at: returnedAt,
        status: cond?.condition === 'damaged' ? 'damaged' : 'returned',
        condition_notes: cond?.notes || null,
        damage_charge: cond?.charge ?? 0,
      }).eq('id', rental.id)

      const { data: eq } = await supabase.from('equipment').select('available_qty, under_repair_qty').eq('id', rental.equipment_id).single()
      if (eq) {
        if (cond?.condition === 'damaged') {
          await supabase.from('equipment').update({ under_repair_qty: (eq.under_repair_qty ?? 0) + rental.quantity }).eq('id', rental.equipment_id)
        } else {
          await supabase.from('equipment').update({ available_qty: eq.available_qty + rental.quantity }).eq('id', rental.equipment_id)
        }
      }

      if (cond?.condition === 'damaged' && cond.charge > 0) {
        await supabase.from('booking_addons').insert({
          booking_id: group.primary.id,
          name: `Damage charge — ${(rental.equipment as any)?.name}`,
          quantity: 1,
          unit_price: cond.charge,
        })
        await supabase.from('bookings').update({
          total_amount: Number(group.primary.total_amount) + cond.charge,
          extras_total: Number(group.primary.extras_total ?? 0) + cond.charge,
        }).eq('id', group.primary.id)
      }
    }

    // Refresh the whole group (primary total_amount may have changed due to damage charges)
    const { data: updatedItems } = await supabase
      .from('bookings')
      .select('*, guests(full_name, phone), rooms(room_number, id), cottages(name, cottage_code, id), cottage_ids, group_number, is_group_primary')
      .in('id', group.items.map(b => b.id))

    const refreshedItems = updatedItems ?? group.items
    const refreshedPrimary = refreshedItems.find((b: any) => b.is_group_primary !== false) ?? refreshedItems[0]
    const refreshedGroup: BookingGroup = {
      key: group.key, primary: refreshedPrimary, items: refreshedItems, roomLabel: group.roomLabel,
      extraCottageNames: group.extraCottageNames, extraEquipment: group.extraEquipment,
    }

    setEquipmentCheckModal([])
    setPendingCheckoutGroup(null)

    if (refreshedPrimary.accommodation_type === 'day_use') {
      const allCottageIds = refreshedPrimary.cottage_ids?.length
        ? refreshedPrimary.cottage_ids
        : (refreshedPrimary.cottage_id ? [refreshedPrimary.cottage_id] : [])
      const damageTotal = Object.values(equipmentConditions).reduce((s, c) => s + (c.charge ?? 0), 0)

      if (damageTotal > 0) {
        setDamagePaymentModal({ finalBooking: refreshedPrimary, damageTotal, allCottageIds })
        setDamagePaymentAmount(damageTotal)
        setDamagePaymentMethod('cash')
        return
      }
      await finalizeDayUseCheckout(refreshedPrimary, allCottageIds, 0, null)
      return
    }

    // Overnight group: proceed to group checkout payment modal
    const allGroupIds = refreshedGroup.items.map((b: any) => b.id)
    const [{ data: updatedAddons }, { data: updatedPosOrders }] = await Promise.all([
      supabase.from('booking_addons').select('*').in('booking_id', allGroupIds).order('created_at'),
      supabase.from('orders')
        .select('id, order_number, total, created_at, order_items(quantity, unit_price, subtotal, menu_items(name))')
        .in('booking_id', allGroupIds)
        .eq('order_type', 'room_service')
        .order('created_at'),
    ])
    setCheckoutModal({ group: refreshedGroup, addons: updatedAddons ?? [], posOrders: updatedPosOrders ?? [], mode: 'checkout' })
    setCheckoutAmount(groupBalance(refreshedGroup))
    setCheckoutMethod('cash')
  }

  async function finalizeDayUseCheckout(finalBooking: any, allCottageIds: string[], damageAmount: number, paymentMethod: string | null) {
    await supabase.from('bookings').update({
      status: 'checked_out',
      actual_check_out: new Date().toISOString(),
    }).eq('id', finalBooking.id)

    for (const cottageId of allCottageIds) {
      await supabase.from('cottages').update({ status: 'cleaning' }).eq('id', cottageId)
      const { data: existingTask } = await supabase
        .from('housekeeping_tasks').select('id')
        .eq('cottage_id', cottageId).in('status', ['pending', 'in_progress']).maybeSingle()
      if (!existingTask) {
        await supabase.from('housekeeping_tasks').insert({
          task_number: `HK-${Date.now()}-${cottageId.slice(0, 4)}`,
          cottage_id: cottageId,
          task_type: 'checkout_cleaning',
          priority: 'high',
          status: 'pending',
          notes: `Day use checkout — ${finalBooking.booking_number}`,
        })
      }
    }

    if (damageAmount > 0 && paymentMethod) {
      await supabase.from('transactions').insert({
        status: 'completed',
        txn_number: `TXN-${Date.now()}`,
        booking_id: finalBooking.id,
        txn_type: 'room',
        description: `Damage charge payment — ${finalBooking.booking_number}`,
        amount: damageAmount,
        payment_method: paymentMethod,
      })
    }

    showToast(`Equipment returned.${damageAmount > 0 ? ` ₱${damageAmount.toLocaleString()} damage payment collected.` : ' All items in good condition.'}${allCottageIds.length > 0 ? ` ${allCottageIds.length} cottage(s) set to cleaning.` : ''}`)
    load()
  }

  async function confirmDamagePayment() {
    if (!damagePaymentModal) return
    const { finalBooking, damageTotal, allCottageIds } = damagePaymentModal
    await finalizeDayUseCheckout(finalBooking, allCottageIds, damageTotal, damagePaymentMethod)
    setDamagePaymentModal(null)
  }

  // ---- Confirm checkout OR record-payment (overnight, operates on a whole group) ----
  async function confirmCheckout() {
    if (!checkoutModal) return
    const { group, addons, posOrders, mode } = checkoutModal
    setProcessingCheckout(true)

    const totalGroupBalance = groupBalance(group)
    const remainingGroupBalance = Math.max(0, totalGroupBalance - checkoutAmount)

    for (const booking of group.items) {
      const bookingBalance = Math.max(0, Number(booking.total_amount) - Number(booking.amount_paid))
      const share = totalGroupBalance > 0 ? Math.round((bookingBalance / totalGroupBalance) * checkoutAmount) : 0
      const newAmountPaid = Number(booking.amount_paid) + share
      const bookingRemaining = Math.max(0, Number(booking.total_amount) - newAmountPaid)

      const { error } = await supabase.from('bookings').update(
        mode === 'checkout'
          ? {
              status: 'checked_out',
              actual_check_out: new Date().toISOString(),
              amount_paid: newAmountPaid,
              payment_status: bookingRemaining > 0 ? 'partial' : 'paid',
            }
          : {
              // Recording a payment mid-stay: money moves, nothing else does.
              amount_paid: newAmountPaid,
              payment_status: bookingRemaining > 0 ? 'partial' : 'paid',
            }
      ).eq('id', booking.id)

      if (error) { showToast('Error: ' + error.message); setProcessingCheckout(false); return }

      if (mode === 'checkout') {
        if (booking.room_id) {
          await supabase.from('rooms').update({ status: 'cleaning' }).eq('id', booking.room_id)
          const { data: existingRoomTask } = await supabase
            .from('housekeeping_tasks').select('id')
            .eq('room_id', booking.room_id).in('status', ['pending', 'in_progress']).maybeSingle()
          if (!existingRoomTask) {
            await supabase.from('housekeeping_tasks').insert({
              task_number: `HK-${Date.now()}-${booking.room_id.slice(0, 4)}`,
              room_id: booking.room_id,
              task_type: 'checkout_cleaning',
              priority: 'high',
              status: 'pending',
              notes: `Checkout cleaning — ${booking.booking_number}`,
            })
          }
        }

        const allCottageIds = booking.cottage_ids?.length ? booking.cottage_ids : (booking.cottage_id ? [booking.cottage_id] : [])
        for (const cottageId of allCottageIds) {
          await supabase.from('cottages').update({ status: 'cleaning' }).eq('id', cottageId)
          const { data: existingTask } = await supabase
            .from('housekeeping_tasks').select('id')
            .eq('cottage_id', cottageId).in('status', ['pending', 'in_progress']).maybeSingle()
          if (!existingTask) {
            await supabase.from('housekeeping_tasks').insert({
              task_number: `HK-${Date.now()}-${cottageId.slice(0, 4)}`,
              cottage_id: cottageId,
              task_type: 'checkout_cleaning',
              priority: 'high',
              status: 'pending',
              notes: `Checkout cleaning — ${booking.booking_number}`,
            })
          }
        }
      }

      try {
        await createOrUpdateInvoice(supabase, {
          booking_id: booking.id,
          guest_id: booking.guest_id,
          subtotal: Number(booking.subtotal),
          total: Number(booking.total_amount),
          amount_paid: newAmountPaid,
          notes: mode === 'checkout'
            ? (bookingRemaining > 0 ? `Partial payment at check-out. Balance: ₱${bookingRemaining.toLocaleString()}` : 'Fully settled at check-out.')
            : `Payment recorded mid-stay. Balance: ₱${bookingRemaining.toLocaleString()}`,
        })
      } catch (_) {}
    }

    if (checkoutAmount > 0) {
      await supabase.from('transactions').insert({
        status: 'completed',
        txn_number: `TXN-${Date.now()}`,
        booking_id: group.primary.id,
        guest_id: group.primary.guest_id,
        txn_type: 'room',
        description: mode === 'checkout' ? `Payment at check-out — ${group.roomLabel}` : `Payment recorded (mid-stay) — ${group.roomLabel}`,
        amount: checkoutAmount,
        payment_method: checkoutMethod,
      })
    }

    const guestName = (group.primary.guests as any)?.full_name ?? 'Guest'
    const roomLines = group.items.map((b: any) => ({
      label: b.rooms ? `Room ${(b.rooms as any).room_number}` : (b.cottages as any)?.name ?? 'Accommodation',
      amount: Number(b.subtotal),
    }))
    const posLines = (posOrders ?? []).flatMap((o: any) =>
      (o.order_items ?? []).map((i: any) => ({
        label: (i.menu_items as any)?.name ?? "Item",
        qty: i.quantity > 1 ? i.quantity : undefined,
        amount: Number(i.subtotal),
      }))
    )
    const addonLines = (addons ?? []).map((a: any) => ({
      label: a.name, qty: a.quantity > 1 ? a.quantity : undefined,
      amount: Number(a.total_price ?? a.unit_price * a.quantity),
    }))

    printReceipt({
      title: resortSettings.resort_name,
      subtitle: resortSettings.address,
      receiptNumber: group.items.length > 1 ? group.primary.group_number ?? group.primary.booking_number : group.primary.booking_number,
      receiptType: mode === 'checkout' ? "Check-out Receipt" : "Payment Receipt",
      date: new Date().toLocaleDateString("en-PH", { dateStyle: "medium" }),
      guestName,
      lineItems: [...roomLines, ...posLines, ...addonLines],
      total: groupTotal(group),
      amountPaid: groupPaid(group) + checkoutAmount,
      balance: remainingGroupBalance,
      paymentMethod: checkoutMethod,
      checkindate: '',
      checkoutdate: ''
    })

    showToast(mode === 'checkout'
      ? (remainingGroupBalance > 0
          ? `${guestName} checked out with ₱${remainingGroupBalance.toLocaleString()} balance remaining.`
          : `${guestName} checked out! Room(s) set to cleaning.`)
      : `₱${checkoutAmount.toLocaleString()} payment recorded for ${guestName}. Balance: ₱${remainingGroupBalance.toLocaleString()}. Guest remains checked in.`)

    setCheckoutModal(null)
    setProcessingCheckout(false)
    load()
  }

  // ---- Day use direct checkout (no equipment, single entry — no grouping needed) ----
  async function checkOutDayUse(b: any) {
    const pax = (b.num_adults ?? 0) + (b.num_children ?? 0) + (b.num_seniors ?? 0) + (b.num_pwd ?? 0)
    await supabase.from('bookings').update({
      status: 'checked_out',
      actual_check_out: new Date().toISOString(),
    }).eq('id', b.id)

    const allCottageIds = b.cottage_ids?.length ? b.cottage_ids : (b.cottage_id ? [b.cottage_id] : [])
    for (const cottageId of allCottageIds) {
      await supabase.from('cottages').update({ status: 'cleaning' }).eq('id', cottageId)
      const { data: existingTask } = await supabase
        .from('housekeeping_tasks').select('id')
        .eq('cottage_id', cottageId).in('status', ['pending', 'in_progress']).maybeSingle()
      if (!existingTask) {
        await supabase.from('housekeeping_tasks').insert({
          task_number: `HK-${Date.now()}-${cottageId.slice(0, 4)}`,
          cottage_id: cottageId, task_type: 'checkout_cleaning',
          priority: 'high', status: 'pending',
          notes: `Day use checkout — ${b.booking_number}`,
        })
      }
    }

    showToast(`Day use guest checked out. ${pax} pax departed.`)
    load()
  }

  async function closeAllBeachOnly(period: 'day' | 'night') {
    // Close all beach/pool-only day use guests (no equipment, no cottage)
    // for the given pass period only, so closing Day Pass visits doesn't
    // accidentally check out Night Pass guests still on the beach/pool.
    const beachOnly = activeDayUse.filter(b => {
      const bPeriod = b.period === 'night' ? 'night' : 'day'
      const hasCottage = b.cottage_id || (b.cottage_ids?.length > 0)
      const hasEquipment = b.rentals.length > 0
      return bPeriod === period && !hasCottage && !hasEquipment
    })
    if (beachOnly.length === 0) return

    const ids = beachOnly.map(b => b.id)
    await supabase.from('bookings').update({
      status: 'checked_out',
      actual_check_out: new Date().toISOString(),
    }).in('id', ids)

    const totalPax = beachOnly.reduce((s, b) =>
      s + (b.num_adults ?? 0) + (b.num_children ?? 0) + (b.num_seniors ?? 0) + (b.num_pwd ?? 0), 0)

    await logActivity(supabase, {
      action: 'DAY_USE_BULK_CLOSEOUT',
      details: `${beachOnly.length} beach/pool-only group(s) closed — ${totalPax} pax total`,
    })

    showToast(`${beachOnly.length} beach/pool-only visit(s) closed. ${totalPax} pax departed.`)
    load()
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700', confirmed: 'bg-blue-100 text-blue-700',
    checked_in: 'bg-green-100 text-green-700', checked_out: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-700',
  }

  const checkinGroups   = groupRows(pendingCheckins)
  const activeGroups    = groupRows(activeStays)
  const checkoutGroups  = groupRows(pendingCheckouts)

  // Search matches booking #/group #, guest name, and room/cottage label.
  const q = search.trim().toLowerCase()
  const matchesGroupSearch = (g: BookingGroup) => {
    if (!q) return true
    return [
      g.primary.booking_number,
      g.primary.group_number,
      (g.primary.guests as any)?.full_name,
      (g.primary.guests as any)?.phone,
      g.roomLabel,
    ].some(v => v && String(v).toLowerCase().includes(q))
  }
  const matchesDayUseSearch = (b: any) => {
    if (!q) return true
    const guestName = b.special_requests?.replace('Day Use Guest: ', '').split('\n')[0] || ''
    return [b.booking_number, guestName].some(v => v && String(v).toLowerCase().includes(q))
  }

  const filteredCheckinGroups  = checkinGroups.filter(matchesGroupSearch)
  const filteredActiveGroups   = activeGroups.filter(matchesGroupSearch)
  const filteredCheckoutGroups = checkoutGroups.filter(matchesGroupSearch)
  // Day Pass vs Night Pass are split into separate tabs — "period" comes
  // from day_use_entries/day_use_rates (see migration 20260829010000).
  // Older rows without an explicit period default to 'day'.
  const dayPassGuests   = activeDayUse.filter(b => b.period !== 'night')
  const nightPassGuests = activeDayUse.filter(b => b.period === 'night')
  const filteredDayUse  = (tab === 'dayuse_night' ? nightPassGuests : dayPassGuests).filter(matchesDayUseSearch)

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50 max-w-sm">
          {toast}
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4 w-fit flex-wrap">
        {([
          { id: 'in',      label: `Check-In (${checkinGroups.length})` },
          { id: 'active',  label: `Active Stays (${activeGroups.length})` },
          { id: 'out',     label: `Due for Check-Out (${checkoutGroups.length})` },
          /*{ id: 'dayuse_day',   label: `Day Pass (${dayPassGuests.length})` },*/
         /* { id: 'dayuse_night', label: `Night Pass (${nightPassGuests.length})` },*/
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative mb-4 max-w-sm">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search booking #, guest, room/cottage..."
          className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
            ✕
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : (
        <>
          {/* ===== CHECK-IN TAB ===== */}
          {tab === 'in' && (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5">Booking #</th>
                    <th className="text-left px-4 py-2.5">Guest</th>
                    <th className="text-left px-4 py-2.5">Room/Cottage</th>
                    <th className="text-left px-4 py-2.5">Check-in</th>
                    <th className="text-left px-4 py-2.5">Check-out</th>
                    <th className="text-left px-4 py-2.5">Status</th>
                    <th className="text-left px-4 py-2.5">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCheckinGroups.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-xs">{q ? 'No pending check-ins match your search.' : 'No pending check-ins.'}</td></tr>
                  ) : filteredCheckinGroups.map(g => (
                    <tr key={g.key} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-blue-700">
                        {g.items.length > 1 ? g.primary.group_number : g.primary.booking_number}
                        {g.items.length > 1 && (
                          <span className="ml-1.5 text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full align-middle">{g.items.length} rooms</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">{(g.primary.guests as any)?.full_name}</td>
                      <td className="px-4 py-2.5 text-gray-500">{g.roomLabel}</td>
                      <td className="px-4 py-2.5 text-gray-500">{g.primary.check_in_date}</td>
                      <td className="px-4 py-2.5 text-gray-500">{g.primary.check_out_date}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[g.primary.status] ?? ''}`}>{g.primary.status}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => handleCheckIn(g)}
                          className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg">
                          Check In{g.items.length > 1 ? ` All (${g.items.length})` : ''}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ===== ACTIVE STAYS TAB ===== */}
          {tab === 'active' && (
            <div className="space-y-3">
              {activeStays.length > 0 && (() => {
                const totalAdults   = activeStays.reduce((s, b) => s + (b.num_adults ?? 0), 0)
                const totalChildren = activeStays.reduce((s, b) => s + (b.num_children ?? 0), 0)
                return (
                  <div className="bg-green-50 border border-green-100 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-green-700">Overnight Guests In Resort</div>
                      <div className="text-xs text-green-500 mt-0.5">
                        {totalAdults > 0 && `${totalAdults} adult${totalAdults > 1 ? 's' : ''}`}
                        {totalChildren > 0 && ` · ${totalChildren} child${totalChildren > 1 ? 'ren' : ''}`}
                        {' · '}{activeGroups.length} booking{activeGroups.length > 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-green-700">{totalAdults + totalChildren} pax</div>
                  </div>
                )
              })()}
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5">Booking #</th>
                      <th className="text-left px-4 py-2.5">Guest</th>
                      <th className="text-left px-4 py-2.5">Pax</th>
                      <th className="text-left px-4 py-2.5">Room/Cottage</th>
                      <th className="text-left px-4 py-2.5">Extras</th>
                      <th className="text-left px-4 py-2.5">Check-in</th>
                      <th className="text-left px-4 py-2.5">Check-out</th>
                      <th className="text-left px-4 py-2.5">Wristband</th>
                      <th className="text-left px-4 py-2.5">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActiveGroups.length === 0 ? (
                      <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-xs">{q ? 'No active stays match your search.' : 'No guests currently checked in.'}</td></tr>
                    ) : filteredActiveGroups.map(g => (
                      <tr key={g.key} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-blue-700">
                          {g.items.length > 1 ? g.primary.group_number : g.primary.booking_number}
                          {g.items.length > 1 && (
                            <span className="ml-1.5 text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full align-middle">{g.items.length} rooms</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">{(g.primary.guests as any)?.full_name}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                            {(g.primary.num_adults ?? 0) + (g.primary.num_children ?? 0)} pax
                          </span>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {g.primary.num_adults > 0 && `${g.primary.num_adults}A`}{g.primary.num_children > 0 && `${g.primary.num_children}C`}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{g.roomLabel}</td>
                        <td className="px-4 py-2.5"><ExtrasBadges group={g} /></td>
                        <td className="px-4 py-2.5 text-gray-500">{g.primary.check_in_date}</td>
                        <td className="px-4 py-2.5 text-gray-500">{g.primary.check_out_date}</td>
                        <td className="px-4 py-2.5 text-gray-500">{g.primary.wristband_number ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => viewBill(g)}
                            className="px-3 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs rounded-lg mr-1">
                            View Bill
                          </button>
                          <button onClick={() => openAddExtraModal(g)}
                            className="px-3 py-1.5 border border-blue-200 text-blue-700 hover:bg-blue-50 text-xs rounded-lg mr-1">
                            + Add Extra
                          </button>
                          <button onClick={() => openCheckoutModal(g)}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg">
                            Check Out{g.items.length > 1 ? ' All' : ''}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== DUE FOR CHECK-OUT TAB ===== */}
          {tab === 'out' && (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5">Booking #</th>
                    <th className="text-left px-4 py-2.5">Guest</th>
                    <th className="text-left px-4 py-2.5">Room/Cottage</th>
                    <th className="text-left px-4 py-2.5">Extras</th>
                    <th className="text-left px-4 py-2.5">Check-out</th>
                    <th className="text-right px-4 py-2.5">Balance</th>
                    <th className="text-left px-4 py-2.5">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCheckoutGroups.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-xs">{q ? 'No check-outs match your search.' : 'No guests due for check-out today.'}</td></tr>
                  ) : filteredCheckoutGroups.map(g => {
                    const balance = groupBalance(g)
                    const isMultiRoom = g.items.length > 1
                    const isExpanded = expandedCheckoutGroups.has(g.key)
                    return (
                      <Fragment key={g.key}>
                        <tr className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-blue-700">
                            {isMultiRoom && (
                              <button
                                onClick={() => setExpandedCheckoutGroups(prev => {
                                  const next = new Set(prev)
                                  next.has(g.key) ? next.delete(g.key) : next.add(g.key)
                                  return next
                                })}
                                className="mr-1.5 text-gray-400 hover:text-gray-600 align-middle"
                                title={isExpanded ? 'Collapse' : 'Show each room to check out individually'}
                              >
                                {isExpanded ? '▾' : '▸'}
                              </button>
                            )}
                            {isMultiRoom ? g.primary.group_number : g.primary.booking_number}
                            {isMultiRoom && (
                              <span className="ml-1.5 text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full align-middle">{g.items.length} rooms</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">{(g.primary.guests as any)?.full_name}</td>
                          <td className="px-4 py-2.5 text-gray-500">{g.roomLabel}</td>
                          <td className="px-4 py-2.5"><ExtrasBadges group={g} /></td>
                          <td className="px-4 py-2.5 text-gray-500">{g.primary.check_out_date}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={balance > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                              ₱{balance.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <button onClick={() => viewBill(g)}
                              className="px-3 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs rounded-lg mr-1">
                              View Bill
                            </button>
                            <button onClick={() => openCheckoutModal(g)}
                              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg">
                              Check Out{isMultiRoom ? ' All' : ''}
                            </button>
                          </td>
                        </tr>
                        {isMultiRoom && isExpanded && g.items.map((booking: any) => {
                          const bookingBalance = Math.max(0, Number(booking.total_amount) - Number(booking.amount_paid))
                          const cottageNames: string[] = booking.extraCottageNames ?? (booking.cottages ? [(booking.cottages as any).name] : [])
                          const labelParts: string[] = []
                          if (booking.rooms) labelParts.push(`Room ${booking.rooms.room_number}`)
                          labelParts.push(...cottageNames)
                          const roomLabel = labelParts.length > 0 ? labelParts.join(' + ') : booking.booking_number
                          // Wrap the single booking as its own one-item group so
                          // the existing checkout logic (payment split, room →
                          // cleaning, housekeeping task, invoice, receipt) runs
                          // for just this booking instead of the whole group.
                          const soloGroup: BookingGroup = {
                            key: booking.id, primary: booking, items: [booking], roomLabel,
                            extraCottageNames: cottageNames, extraEquipment: booking.extraEquipment ?? [],
                          }
                          return (
                            <tr key={booking.id} className="border-b border-gray-50 bg-gray-50/60">
                              <td className="px-4 py-2 pl-10 text-gray-500 text-xs">{booking.booking_number}</td>
                              <td className="px-4 py-2 text-xs text-gray-400">—</td>
                              <td className="px-4 py-2 text-gray-500 text-xs">{roomLabel}</td>
                              <td className="px-4 py-2 text-xs"><ExtrasBadges group={soloGroup} /></td>
                              <td className="px-4 py-2 text-gray-500 text-xs">{booking.check_out_date}</td>
                              <td className="px-4 py-2 text-right text-xs">
                                <span className={bookingBalance > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                                  ₱{bookingBalance.toLocaleString()}
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                <button onClick={() => openCheckoutModal(soloGroup)}
                                  className="px-3 py-1 border border-blue-200 text-blue-700 hover:bg-blue-50 text-xs rounded-lg">
                                  Check Out This Room
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ===== DAY PASS / NIGHT PASS TABS (split by period, same layout) ===== */}
          {(tab === 'dayuse_day' || tab === 'dayuse_night') && (
            <div>
              {filteredDayUse.length > 0 && (() => {
                const tA = filteredDayUse.reduce((s, b) => s + (b.num_adults   ?? 0), 0)
                const tC = filteredDayUse.reduce((s, b) => s + (b.num_children ?? 0), 0)
                const tS = filteredDayUse.reduce((s, b) => s + (b.num_seniors  ?? 0), 0)
                const tP = filteredDayUse.reduce((s, b) => s + (b.num_pwd      ?? 0), 0)
                const total = tA + tC + tS + tP
                return (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="text-sm font-semibold text-blue-700">
                        {tab === 'dayuse_night' ? 'Night Pass' : 'Day Pass'} Guests Currently In Resort
                      </div>
                      <div className="text-xs text-blue-500 mt-0.5">
                        {tA > 0 && `${tA} adult${tA > 1 ? 's' : ''}`}
                        {tC > 0 && ` · ${tC} child${tC > 1 ? 'ren' : ''}`}
                        {tS > 0 && ` · ${tS} senior${tS > 1 ? 's' : ''}`}
                        {tP > 0 && ` · ${tP} PWD`}
                        {' · '}{filteredDayUse.length} group{filteredDayUse.length > 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-blue-700">{total} pax</div>
                  </div>
                )
              })()}

              {filteredDayUse.length === 0 ? (
                <div className="text-center py-12 bg-white border border-gray-100 rounded-xl text-gray-400 text-sm">
                  {q ? 'No day use guests match your search.' : 'No active day use guests right now.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredDayUse.map(b => {
                    const pax = (b.num_adults ?? 0) + (b.num_children ?? 0) + (b.num_seniors ?? 0) + (b.num_pwd ?? 0)
                    const guestName = b.special_requests?.replace('Day Use Guest: ', '').split('\n')[0] || b.booking_number
                    const hasUnreturnedEquipment = b.rentals.length > 0
                    const cottageNames: string[] = b.extraCottageNames ?? []
                    const hasCottage = cottageNames.length > 0
                    const needsCheckout = hasUnreturnedEquipment || hasCottage

                    // Beach/pool only — dili na show sa individual cards
                    if (!needsCheckout) return null

                    return (
                      <div key={b.id} className="bg-white border border-gray-100 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="text-sm font-medium text-gray-700">{guestName}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {b.booking_number} · Entered {new Date(b.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {hasUnreturnedEquipment && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Equipment</span>}
                              {cottageNames.map((name, i) => (
                                <span key={i} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">🏠 {name}</span>
                              ))}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-blue-700">{pax} pax</div>
                            <div className="text-xs text-gray-400">
                              {b.num_adults > 0 && `${b.num_adults}A`}
                              {b.num_children > 0 && ` ${b.num_children}C`}
                              {b.num_seniors > 0 && ` ${b.num_seniors}Sr`}
                              {b.num_pwd > 0 && ` ${b.num_pwd}P`}
                            </div>
                          </div>
                        </div>

                        {hasUnreturnedEquipment && (
                          <div className="space-y-1.5 mb-3">
                            {b.rentals.map((r: any) => (
                              <div key={r.id} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs">
                                <span className="text-amber-700">⚠ {(r.equipment as any)?.name} × {r.quantity} — not yet returned</span>
                                <span className="text-amber-500">
                                  Since {new Date(r.rental_start).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            ))}
                            <button
                              onClick={() => {
                                setEquipmentCheckModal(b.rentals)
                                setEquipmentConditions(Object.fromEntries(
                                  b.rentals.map((r: any) => [r.id, { condition: 'good', notes: '', charge: 0 }])
                                ))
                                setPendingCheckoutGroup({ key: b.id, primary: b, items: [b], roomLabel: b.booking_number, extraCottageNames: [], extraEquipment: b.rentals ?? [] })
                              }}
                              className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg font-medium">
                              Return Equipment First ({b.rentals.length} item{b.rentals.length > 1 ? 's' : ''})
                            </button>
                          </div>
                        )}

                        {!hasUnreturnedEquipment && (
                          <div className="text-xs text-green-600 mb-3">✓ No unreturned equipment</div>
                        )}

                        <div className="flex gap-2 mb-2">
                          <button
                            onClick={() => openDayUseAddRoomModal(b)}
                            className="flex-1 py-2 border border-blue-200 text-blue-700 hover:bg-blue-50 text-xs rounded-lg font-medium">
                            🛏️ Add Room (staying overnight)
                          </button>
                          <button
                            onClick={() => openDayUseAddCottageModal(b)}
                            className="flex-1 py-2 border border-blue-200 text-blue-700 hover:bg-blue-50 text-xs rounded-lg font-medium">
                            🏠 Add Cottage
                          </button>
                        </div>

                        <button
                          disabled={hasUnreturnedEquipment}
                          onClick={() => checkOutDayUse(b)}
                          className="w-full py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm rounded-lg font-medium">
                          {hasUnreturnedEquipment ? 'Return equipment before check-out' : `Check Out (${pax} pax)`}
                        </button>
                      </div>
                    )
                  })}

                  {/* Beach/Pool Only Section */}
                  {(() => {
                    const periodGuests = tab === 'dayuse_night' ? nightPassGuests : dayPassGuests
                    const beachOnly = periodGuests.filter(b => {
                      const hasCottage = b.cottage_id || (b.cottage_ids?.length > 0)
                      return b.rentals.length === 0 && !hasCottage
                    })
                    if (beachOnly.length === 0) return null
                    const totalPax = beachOnly.reduce((s, b) =>
                      s + (b.num_adults ?? 0) + (b.num_children ?? 0) + (b.num_seniors ?? 0) + (b.num_pwd ?? 0), 0)
                    return (
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="text-sm font-medium text-gray-700">🏖️ Beach / Pool Only Visits</div>
                            <div className="text-xs text-gray-400">{beachOnly.length} group(s) · {totalPax} pax · No equipment or cottage</div>
                          </div>
                        </div>
                        <div className="space-y-1 mb-3 max-h-32 overflow-y-auto">
                          {beachOnly.map(b => {
                            const pax = (b.num_adults ?? 0) + (b.num_children ?? 0) + (b.num_seniors ?? 0) + (b.num_pwd ?? 0)
                            const guestName = b.special_requests?.replace('Day Use Guest: ', '').split('\n')[0] || b.booking_number
                            return (
                              <div key={b.id} className="flex items-center justify-between text-xs text-gray-500 py-0.5">
                                <span>{guestName}</span>
                                <div className="flex items-center gap-2">
                                  <span>{pax} pax · {new Date(b.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</span>
                                  <button
                                    onClick={() => openDayUseAddRoomModal(b)}
                                    className="text-blue-600 hover:underline shrink-0">+ Room</button>
                                  <button
                                    onClick={() => openDayUseAddCottageModal(b)}
                                    className="text-blue-600 hover:underline shrink-0">+ Cottage</button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        <button
                          onClick={() => closeAllBeachOnly(tab === 'dayuse_night' ? 'night' : 'day')}
                          className="w-full py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-lg font-medium">
                          Close All Beach/Pool Visits ({totalPax} pax)
                        </button>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ===== DAY-USE "ADD ROOM" MODAL — guest decides to stay overnight ===== */}
      {dayUseAddRoomModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !addingDayUseRoom && setDayUseAddRoomModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-0.5">Add Room</div>
            <div className="text-xs text-gray-400 mb-4">
              {dayUseAddRoomModal.special_requests?.replace('Day Use Guest: ', '').split('\n')[0] || dayUseAddRoomModal.booking_number} · currently on a Day/Night Pass
            </div>

            {dayUseAvailableRooms.length === 0 ? (
              <div className="text-sm text-amber-600 bg-amber-50 rounded-xl p-4 mb-4">No rooms available today.</div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto mb-4">
                {dayUseAvailableRooms.map((r: any) => {
                  const cap = (r.room_types_config as any)?.max_capacity ?? 0
                  const tooSmall = cap < dayUseRoomPax
                  return (
                    <label key={r.id} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer ${dayUseSelectedRoomId === r.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'} ${tooSmall ? 'opacity-40' : ''}`}>
                      <div className="flex items-center gap-2">
                        <input type="radio" name="dayUseRoom" checked={dayUseSelectedRoomId === r.id} onChange={() => setDayUseSelectedRoomId(r.id)} />
                        <span className="text-sm text-gray-700">Room {r.room_number} <span className="text-gray-400">({(r.room_types_config as any)?.name})</span></span>
                        <span className="text-xs text-gray-400">max {cap} pax</span>
                      </div>
                      <span className="text-xs text-gray-500">₱{Number((r.room_types_config as any)?.base_rate ?? 0).toLocaleString()}/night</span>
                    </label>
                  )
                })}
              </div>
            )}

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">Guests for this Room</label>
              <input type="number" min={1} value={dayUseRoomPax}
                onChange={e => setDayUseRoomPax(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              <div className="text-[11px] text-gray-400 mt-1">Defaults to this guest's whole day-use headcount — lower it if only part of the group is staying overnight.</div>
            </div>

            {(() => {
              const r = dayUseAvailableRooms.find((x: any) => x.id === dayUseSelectedRoomId)
              const cap = (r?.room_types_config as any)?.max_capacity ?? 0
              return dayUseSelectedRoomId && dayUseRoomPax > cap ? (
                <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2.5 mb-3">
                  {dayUseRoomPax} guests won't fit — Room {r.room_number} sleeps {cap} max. Pick a bigger room or lower the guest count.
                </div>
              ) : null
            })()}

            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">Number of Nights</label>
              <input type="number" min={1} value={dayUseRoomNights}
                onChange={e => setDayUseRoomNights(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>

            <div className="text-[11px] text-gray-400 mb-3">
              Starts tonight. Creates a separate overnight room stay for this guest — it'll show under Active Stays, billed and paid separately from the day-use visit.
            </div>

            <div className="flex gap-2">
              <button onClick={confirmDayUseAddRoom}
                disabled={
                  !dayUseSelectedRoomId || addingDayUseRoom ||
                  dayUseRoomPax > ((dayUseAvailableRooms.find((x: any) => x.id === dayUseSelectedRoomId)?.room_types_config as any)?.max_capacity ?? 0)
                }
                className="flex-1 py-2 bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50">
                {addingDayUseRoom ? 'Adding...' : 'Add Room'}
              </button>
              <button onClick={() => setDayUseAddRoomModal(null)} disabled={addingDayUseRoom}
                className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DAY-USE "ADD COTTAGE" MODAL — guest rents a cottage mid-visit ===== */}
      {dayUseAddCottageModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !addingDayUseCottage && setDayUseAddCottageModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-0.5">Add Cottage</div>
            <div className="text-xs text-gray-400 mb-4">
              {dayUseAddCottageModal.special_requests?.replace('Day Use Guest: ', '').split('\n')[0] || dayUseAddCottageModal.booking_number}
              {' · '}{dayUseAddCottageModal.period === 'night' ? 'Night Pass' : 'Day Pass'}
            </div>

            {dayUseAvailableCottages.length === 0 ? (
              <div className="text-sm text-amber-600 bg-amber-50 rounded-xl p-4 mb-4">No cottages available right now.</div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto mb-4">
                {dayUseAvailableCottages.map((c: any) => {
                  const rate = cottagePriceFor(dayUseAddCottageModal, c)
                  return (
                    <label key={c.id} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer ${dayUseSelectedCottageId === c.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                      <div className="flex items-center gap-2">
                        <input type="radio" name="dayUseCottage" checked={dayUseSelectedCottageId === c.id}
                          onChange={() => { setDayUseSelectedCottageId(c.id); setDayUseCottageAmount(rate) }} />
                        <span className="text-sm text-gray-700">{c.name} <span className="text-gray-400">({c.cottage_code})</span></span>
                      </div>
                      <span className="text-xs text-gray-500">₱{Number(rate ?? 0).toLocaleString()}</span>
                    </label>
                  )
                })}
              </div>
            )}

            <div className="text-[11px] text-gray-400 mb-3">
              Charged at the {dayUseAddCottageModal.period === 'night' ? 'night' : 'day'} rate for this pass. Collect payment now — a receipt prints on confirm.
            </div>

            {dayUseSelectedCottageId && (() => {
              const c = dayUseAvailableCottages.find(x => x.id === dayUseSelectedCottageId)
              const due = c ? cottagePriceFor(dayUseAddCottageModal, c) : 0
              return (
                <div className="mb-3">
                  <PaymentCalculator
                    totalDue={due}
                    method={dayUseCottageMethod}
                    onMethodChange={setDayUseCottageMethod}
                    amountTendered={dayUseCottageAmount}
                    onAmountTenderedChange={setDayUseCottageAmount}
                  />
                </div>
              )
            })()}

            <div className="flex gap-2">
              <button onClick={confirmDayUseAddCottage}
                disabled={
                  !dayUseSelectedCottageId || addingDayUseCottage ||
                  !isPaymentValid(
                    dayUseCottageMethod,
                    (() => { const c = dayUseAvailableCottages.find(x => x.id === dayUseSelectedCottageId); return c ? cottagePriceFor(dayUseAddCottageModal, c) : 0 })(),
                    dayUseCottageAmount
                  )
                }
                className="flex-1 py-2 bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50">
                {addingDayUseCottage ? 'Adding...' : 'Add Cottage & Collect Payment'}
              </button>
              <button onClick={() => setDayUseAddCottageModal(null)} disabled={addingDayUseCottage}
                className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== ADD EXTRA MODAL (cottage or extra room, on an active stay) ===== */}
      {addExtraModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !addingExtra && setAddExtraModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-0.5">Add Extra</div>
            <div className="text-xs text-gray-400 mb-4">
              {(addExtraModal.primary.guests as any)?.full_name} · {addExtraModal.roomLabel}
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => { setAddExtraType('cottage'); setSelectedExtraId('') }}
                className={`flex-1 py-2 text-xs rounded-lg font-medium ${addExtraType === 'cottage' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-500'}`}>
                🏖️ Cottage
              </button>
              <button
                onClick={() => { setAddExtraType('room'); setSelectedExtraId('') }}
                className={`flex-1 py-2 text-xs rounded-lg font-medium ${addExtraType === 'room' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-500'}`}>
                🛏️ Extra Room
              </button>
            </div>

            {addExtraType === 'cottage' ? (
              availableCottages.length === 0 ? (
                <div className="text-sm text-amber-600 bg-amber-50 rounded-xl p-4">No cottages available right now.</div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto mb-4">
                  {availableCottages.map(c => (
                    <label key={c.id} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer ${selectedExtraId === c.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                      <div className="flex items-center gap-2">
                        <input type="radio" name="extra" checked={selectedExtraId === c.id} onChange={() => setSelectedExtraId(c.id)} />
                        <span className="text-sm text-gray-700">{c.name} <span className="text-gray-400">({c.cottage_code})</span></span>
                      </div>
                      <span className="text-xs text-gray-500">₱{Number(c.overnight_rate || c.day_rate).toLocaleString()}/night</span>
                    </label>
                  ))}
                </div>
              )
            ) : (
              availableExtraRooms.length === 0 ? (
                <div className="text-sm text-amber-600 bg-amber-50 rounded-xl p-4">No rooms available for these dates.</div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto mb-4">
                  {availableExtraRooms.map((r: any) => (
                    <label key={r.id} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer ${selectedExtraId === r.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                      <div className="flex items-center gap-2">
                        <input type="radio" name="extra" checked={selectedExtraId === r.id} onChange={() => setSelectedExtraId(r.id)} />
                        <span className="text-sm text-gray-700">Room {r.room_number} <span className="text-gray-400">({(r.room_types_config as any)?.name})</span></span>
                      </div>
                      <span className="text-xs text-gray-500">₱{Number((r.room_types_config as any)?.base_rate ?? 0).toLocaleString()}/night</span>
                    </label>
                  ))}
                </div>
              )
            )}

            <div className="text-[11px] text-gray-400 mb-3">
              Charged to this guest's bill for the rest of their stay — collected together at check-out, and automatically reflected in the shift remittance breakdown.
            </div>

            <div className="flex gap-2">
              <button onClick={confirmAddExtra} disabled={!selectedExtraId || addingExtra}
                className="flex-1 py-2 bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50">
                {addingExtra ? 'Adding...' : 'Add to Bill'}
              </button>
              <button onClick={() => setAddExtraModal(null)} disabled={addingExtra}
                className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== BILL DETAIL MODAL (group) ===== */}
      {billDetail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setBillDetail(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-0.5">
              {billDetail.group.items.length > 1 ? billDetail.group.primary.group_number : billDetail.group.primary.booking_number}
            </div>
            <div className="text-xs text-gray-400 mb-3">{(billDetail.group.primary.guests as any)?.full_name}</div>
            <div className="text-sm space-y-1.5 bg-gray-50 rounded-lg p-3 mb-4">
              {billDetail.group.items.map((b: any) => (
                <div key={b.id} className="flex justify-between text-gray-600">
                  <span>{b.rooms ? `Room ${(b.rooms as any).room_number}` : (b.cottages as any)?.name}</span>
                  <span>₱{Number(b.subtotal).toLocaleString()}</span>
                </div>
              ))}
              {billDetail.posOrders.length > 0 && (
                <>
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide pt-1">🍽️ Restaurant Orders</div>
                  {billDetail.posOrders.map((o: any) => (
                    <div key={o.id}>
                      <div className="text-[10px] text-gray-400">{o.order_number} · {new Date(o.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</div>
                      {(o.order_items ?? []).map((i: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-gray-600 pl-2">
                          <span>{(i.menu_items as any)?.name ?? 'Item'}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</span>
                          <span>₱{Number(i.subtotal).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}
              {billDetail.addons.length > 0 && (
                <>
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide pt-1">Additional Charges</div>
                  {billDetail.addons.map((a: any) => (
                    <div key={a.id} className="flex justify-between text-gray-600">
                      <span>{a.name}{a.quantity > 1 ? ` × ${a.quantity}` : ''}</span>
                      <span>₱{Number(a.total_price ?? a.unit_price * a.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </>
              )}
              <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-200 pt-1.5">
                <span>Total</span><span>₱{groupTotal(billDetail.group).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>Paid</span><span>₱{groupPaid(billDetail.group).toLocaleString()}</span>
              </div>
              <div className={`flex justify-between font-medium ${groupBalance(billDetail.group) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                <span>Balance</span>
                <span>₱{groupBalance(billDetail.group).toLocaleString()}</span>
              </div>
            </div>
            <div className="flex gap-2">
              {groupBalance(billDetail.group) > 0 && (
                <button onClick={() => { const g = billDetail.group; setBillDetail(null); openRecordPaymentModal(g) }}
                  className="flex-1 py-2 bg-blue-700 text-white text-sm rounded-lg">Record Payment</button>
              )}
              <button onClick={() => setBillDetail(null)}
                className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== CHECKOUT PAYMENT MODAL (group) ===== */}
      {checkoutModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !processingCheckout && setCheckoutModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-0.5">
              {checkoutModal.mode === 'checkout' ? 'Check Out' : 'Record Payment'} — {checkoutModal.group.items.length > 1 ? checkoutModal.group.primary.group_number : checkoutModal.group.primary.booking_number}
            </div>
            <div className="text-xs text-gray-400 mb-3">
              {(checkoutModal.group.primary.guests as any)?.full_name}
              {checkoutModal.mode === 'payment' && ' · Guest stays checked in'}
            </div>

            <div className="text-sm space-y-1.5 bg-gray-50 rounded-lg p-3 mb-3">
              {checkoutModal.group.items.map((b: any) => (
                <div key={b.id} className="flex justify-between text-gray-600">
                  <span>{b.rooms ? `Room ${(b.rooms as any).room_number}` : (b.cottages as any)?.name}</span>
                  <span>₱{Number(b.subtotal).toLocaleString()}</span>
                </div>
              ))}
              {checkoutModal.posOrders.length > 0 && (
                <>
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide pt-1">🍽️ Restaurant Orders</div>
                  {checkoutModal.posOrders.map((o: any) => (
                    <div key={o.id}>
                      <div className="text-[10px] text-gray-400">{o.order_number} · {new Date(o.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</div>
                      {(o.order_items ?? []).map((i: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-gray-600 pl-2">
                          <span>{(i.menu_items as any)?.name ?? 'Item'}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</span>
                          <span>₱{Number(i.subtotal).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}
              {checkoutModal.addons.length > 0 && (
                <>
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide pt-1">Additional Charges</div>
                  {checkoutModal.addons.map((a: any) => (
                    <div key={a.id} className="flex justify-between text-gray-600">
                      <span>{a.name}{a.quantity > 1 ? ` × ${a.quantity}` : ''}</span>
                      <span>₱{Number(a.total_price ?? a.unit_price * a.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </>
              )}
              <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-200 pt-1.5">
                <span>Total Bill</span><span>₱{groupTotal(checkoutModal.group).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>Already Paid</span><span>₱{groupPaid(checkoutModal.group).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-medium text-red-600">
                <span>Balance Due</span>
                <span>₱{groupBalance(checkoutModal.group).toLocaleString()}</span>
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">Amount Being Paid Now</label>
              <input type="number" value={checkoutAmount}
                onChange={e => setCheckoutAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>

            <PaymentCalculator
              totalDue={checkoutAmount}
              method={checkoutMethod}
              onMethodChange={setCheckoutMethod}
              amountTendered={checkoutAmount}
              onAmountTenderedChange={setCheckoutAmount}
            />

            <div className="flex gap-2 mt-3">
              <button onClick={confirmCheckout} disabled={processingCheckout}
                className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm rounded-lg">
                {processingCheckout ? 'Processing...' : (checkoutModal.mode === 'checkout' ? 'Confirm Check-Out' : 'Confirm Payment')}
              </button>
              <button onClick={() => setCheckoutModal(null)} disabled={processingCheckout}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== EQUIPMENT DAMAGE CHECK MODAL ===== */}
      {equipmentCheckModal.length > 0 && pendingCheckoutGroup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="text-sm font-semibold text-gray-800 mb-1">Equipment Return Check</div>
            <div className="text-xs text-gray-400 mb-4">Inspect each item before finalizing.</div>

            <div className="space-y-4">
              {equipmentCheckModal.map((rental: any) => {
                const cond = equipmentConditions[rental.id] ?? { condition: 'good', notes: '', charge: 0 }
                return (
                  <div key={rental.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-sm font-medium text-gray-700">{(rental.equipment as any)?.name}</div>
                        <div className="text-xs text-gray-400">Qty: {rental.quantity}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEquipmentConditions(p => ({ ...p, [rental.id]: { ...p[rental.id], condition: 'good' } }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${cond.condition === 'good' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                          ✓ Good
                        </button>
                        <button onClick={() => setEquipmentConditions(p => ({ ...p, [rental.id]: { ...p[rental.id], condition: 'damaged' } }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${cond.condition === 'damaged' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                          ⚠ Damaged
                        </button>
                      </div>
                    </div>
                    {cond.condition === 'damaged' && (
                      <div className="space-y-2 pt-3 border-t border-gray-100">
                        <input value={cond.notes} onChange={e => setEquipmentConditions(p => ({ ...p, [rental.id]: { ...p[rental.id], notes: e.target.value } }))}
                          placeholder="Damage description..."
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white" />
                        <input type="number" value={cond.charge || ''} onChange={e => setEquipmentConditions(p => ({ ...p, [rental.id]: { ...p[rental.id], charge: parseFloat(e.target.value) || 0 } }))}
                          placeholder="Damage charge (₱)"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {Object.values(equipmentConditions).some(c => c.condition === 'damaged' && c.charge > 0) && (
              <div className="mt-3 bg-red-50 rounded-lg p-3 text-sm flex justify-between font-medium text-red-700">
                <span>Total Damage Charges</span>
                <span>₱{Object.values(equipmentConditions).reduce((s, c) => s + (c.charge ?? 0), 0).toLocaleString()}</span>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={confirmEquipmentCheck}
                className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg">
                Confirm & Proceed
              </button>
              <button onClick={() => { setEquipmentCheckModal([]); setPendingCheckoutGroup(null) }}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DAMAGE PAYMENT MODAL (day use) ===== */}
      {damagePaymentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-sm">
            <div className="text-sm font-semibold text-gray-800 mb-1">Collect Damage Payment</div>
            <div className="text-xs text-gray-400 mb-4">{damagePaymentModal.finalBooking.booking_number}</div>

            <div className="bg-red-50 rounded-lg p-3 text-sm font-medium text-red-700 flex justify-between mb-4">
              <span>Damage Charge Total</span>
              <span>₱{damagePaymentModal.damageTotal.toLocaleString()}</span>
            </div>

            <PaymentCalculator
              totalDue={damagePaymentModal.damageTotal}
              method={damagePaymentMethod}
              onMethodChange={setDamagePaymentMethod}
              amountTendered={damagePaymentAmount}
              onAmountTenderedChange={setDamagePaymentAmount}
            />

            <button
              onClick={confirmDamagePayment}
              disabled={!isPaymentValid(damagePaymentMethod, damagePaymentModal.damageTotal, damagePaymentAmount)}
              className="w-full mt-3 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium rounded-lg"
            >
              Collect Payment & Complete Check-out
            </button>
          </div>
        </div>
      )}

      {/* ===== CHECK-IN BALANCE PAYMENT MODAL (group) ===== */}
      {checkinPaymentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-sm">
            <div className="text-sm font-semibold text-gray-800 mb-1">Balance Payment Required</div>
            <div className="text-xs text-gray-400 mb-4">
              {checkinPaymentModal.items.length > 1 ? checkinPaymentModal.primary.group_number : checkinPaymentModal.primary.booking_number}
              {' · '}{(checkinPaymentModal.primary.guests as any)?.full_name}
            </div>

            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1 mb-4">
              {checkinPaymentModal.items.length > 1 && (
                <div className="text-xs text-gray-400 mb-1">{checkinPaymentModal.roomLabel}</div>
              )}
              <div className="flex justify-between text-gray-500">
                <span>Total Bill</span><span>₱{groupTotal(checkinPaymentModal).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>Already Paid (deposit)</span><span>₱{groupPaid(checkinPaymentModal).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-semibold text-red-600 border-t border-gray-200 pt-1">
                <span>Balance Due</span><span>₱{checkinAmount.toLocaleString()}</span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 text-xs text-amber-700 mb-4">
              This booking has an unpaid balance. Please collect payment before proceeding with check-in.
            </div>

            <PaymentCalculator
              totalDue={checkinAmount}
              method={checkinMethod}
              onMethodChange={setCheckinMethod}
              amountTendered={checkinAmount}
              onAmountTenderedChange={setCheckinAmount}
            />

            <div className="flex gap-2 mt-4">
              <button
                onClick={confirmCheckInPayment}
                disabled={processingCheckin || !isPaymentValid(checkinMethod, groupBalance(checkinPaymentModal), checkinAmount)}
                className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg"
              >
                {processingCheckin ? 'Processing...' : 'Collect Payment & Check In'}
              </button>
              <button
                onClick={() => setCheckinPaymentModal(null)}
                disabled={processingCheckin}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
