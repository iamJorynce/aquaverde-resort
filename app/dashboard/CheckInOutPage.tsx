'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { printReceipt } from './receipt'
import { isPaymentValid, paymentValidationMessage } from './PaymentCalculator'
import PaymentCalculator from './PaymentCalculator'
import { createOrUpdateInvoice } from './invoiceUtils'
import { logActivity } from './activityLog'

// A "group" is one or more room bookings that were made together (a guest
// booking multiple rooms in one transaction). Ungrouped bookings become a
// group of exactly 1. All UI and actions operate on groups so a guest with
// 3 rooms shows as ONE row / ONE check-in / ONE check-out, not three.
interface BookingGroup {
  key: string
  primary: any
  items: any[]
  roomLabel: string
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
    const roomLabels = items.map((b: any) =>
      b.rooms ? `Room ${b.rooms.room_number}` : ((b.cottages as any)?.name ?? b.booking_number)
    )
    return {
      key: primary.group_number ?? primary.id,
      primary,
      items,
      roomLabel: roomLabels.join(', '),
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

export default function CheckInOutPage() {
  const supabase = createClient()

  const [tab, setTab] = useState<'in' | 'active' | 'out' | 'dayuse'>('in')
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
  const [checkoutModal, setCheckoutModal] = useState<{ group: BookingGroup; addons: any[]; posOrders: any[] } | null>(null)
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

  // ---- Load ----
  async function load() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)

    const [{ data: checkins }, { data: active }, { data: checkouts }, { data: dayUse }] = await Promise.all([
      supabase.from('bookings')
        .select('*, guests(full_name, phone), rooms(room_number, id), cottages(name, cottage_code, id), group_number, is_group_primary, cottage_ids')
        .in('status', ['pending', 'confirmed'])
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
        .select('id, booking_number, special_requests, created_at, check_in_date, num_adults, num_children, num_seniors, num_pwd, cottage_id, cottage_ids')
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

    setPendingCheckins(checkins ?? [])
    setActiveStays(active ?? [])
    setPendingCheckouts(checkouts ?? [])
    setActiveDayUse(dayUseWithEquipment)
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
      setCheckoutModal({ group, addons: addons ?? [], posOrders: posOrders ?? [] })
      setCheckoutAmount(balance)
      setCheckoutMethod("cash")
    }
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
    const refreshedGroup: BookingGroup = { key: group.key, primary: refreshedPrimary, items: refreshedItems, roomLabel: group.roomLabel }

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
    setCheckoutModal({ group: refreshedGroup, addons: updatedAddons ?? [], posOrders: updatedPosOrders ?? [] })
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

  // ---- Confirm checkout (overnight, operates on a whole group) ----
  async function confirmCheckout() {
    if (!checkoutModal) return
    const { group, addons, posOrders } = checkoutModal
    setProcessingCheckout(true)

    const totalGroupBalance = groupBalance(group)
    const remainingGroupBalance = Math.max(0, totalGroupBalance - checkoutAmount)

    for (const booking of group.items) {
      const bookingBalance = Math.max(0, Number(booking.total_amount) - Number(booking.amount_paid))
      const share = totalGroupBalance > 0 ? Math.round((bookingBalance / totalGroupBalance) * checkoutAmount) : 0
      const newAmountPaid = Number(booking.amount_paid) + share
      const bookingRemaining = Math.max(0, Number(booking.total_amount) - newAmountPaid)

      const { error } = await supabase.from('bookings').update({
        status: 'checked_out',
        actual_check_out: new Date().toISOString(),
        amount_paid: newAmountPaid,
        payment_status: bookingRemaining > 0 ? 'partial' : 'paid',
      }).eq('id', booking.id)

      if (error) { showToast('Error: ' + error.message); setProcessingCheckout(false); return }

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

      try {
        await createOrUpdateInvoice(supabase, {
          booking_id: booking.id,
          guest_id: booking.guest_id,
          subtotal: Number(booking.subtotal),
          total: Number(booking.total_amount),
          amount_paid: newAmountPaid,
          notes: bookingRemaining > 0 ? `Partial payment at check-out. Balance: ₱${bookingRemaining.toLocaleString()}` : 'Fully settled at check-out.',
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
        description: `Payment at check-out — ${group.roomLabel}`,
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
      title: "AquaVerde Beach Resort",
      receiptNumber: group.items.length > 1 ? group.primary.group_number ?? group.primary.booking_number : group.primary.booking_number,
      receiptType: "Check-out Receipt",
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

    showToast(remainingGroupBalance > 0
      ? `${guestName} checked out with ₱${remainingGroupBalance.toLocaleString()} balance remaining.`
      : `${guestName} checked out! Room(s) set to cleaning.`)

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

  async function closeAllBeachOnly() {
    // Close all beach/pool-only day use guests (no equipment, no cottage)
    const beachOnly = activeDayUse.filter(b => {
      const hasCottage = b.cottage_id || (b.cottage_ids?.length > 0)
      const hasEquipment = b.rentals.length > 0
      return !hasCottage && !hasEquipment
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
          { id: 'dayuse',  label: `Day Use (${activeDayUse.length})` },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>
            {t.label}
          </button>
        ))}
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
                  {checkinGroups.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-xs">No pending check-ins.</td></tr>
                  ) : checkinGroups.map(g => (
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
                      <th className="text-left px-4 py-2.5">Check-in</th>
                      <th className="text-left px-4 py-2.5">Check-out</th>
                      <th className="text-left px-4 py-2.5">Wristband</th>
                      <th className="text-left px-4 py-2.5">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeGroups.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-xs">No guests currently checked in.</td></tr>
                    ) : activeGroups.map(g => (
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
                        <td className="px-4 py-2.5 text-gray-500">{g.primary.check_in_date}</td>
                        <td className="px-4 py-2.5 text-gray-500">{g.primary.check_out_date}</td>
                        <td className="px-4 py-2.5 text-gray-500">{g.primary.wristband_number ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => viewBill(g)}
                            className="px-3 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs rounded-lg mr-1">
                            View Bill
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
                    <th className="text-left px-4 py-2.5">Check-out</th>
                    <th className="text-right px-4 py-2.5">Balance</th>
                    <th className="text-left px-4 py-2.5">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {checkoutGroups.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-xs">No guests due for check-out today.</td></tr>
                  ) : checkoutGroups.map(g => {
                    const balance = groupBalance(g)
                    return (
                      <tr key={g.key} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-blue-700">
                          {g.items.length > 1 ? g.primary.group_number : g.primary.booking_number}
                          {g.items.length > 1 && (
                            <span className="ml-1.5 text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full align-middle">{g.items.length} rooms</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">{(g.primary.guests as any)?.full_name}</td>
                        <td className="px-4 py-2.5 text-gray-500">{g.roomLabel}</td>
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
                            Check Out{g.items.length > 1 ? ' All' : ''}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ===== DAY USE TAB (unchanged — no room grouping applies here) ===== */}
          {tab === 'dayuse' && (
            <div>
              {activeDayUse.length > 0 && (() => {
                const tA = activeDayUse.reduce((s, b) => s + (b.num_adults   ?? 0), 0)
                const tC = activeDayUse.reduce((s, b) => s + (b.num_children ?? 0), 0)
                const tS = activeDayUse.reduce((s, b) => s + (b.num_seniors  ?? 0), 0)
                const tP = activeDayUse.reduce((s, b) => s + (b.num_pwd      ?? 0), 0)
                const total = tA + tC + tS + tP
                return (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="text-sm font-semibold text-blue-700">Day Use Guests Currently In Resort</div>
                      <div className="text-xs text-blue-500 mt-0.5">
                        {tA > 0 && `${tA} adult${tA > 1 ? 's' : ''}`}
                        {tC > 0 && ` · ${tC} child${tC > 1 ? 'ren' : ''}`}
                        {tS > 0 && ` · ${tS} senior${tS > 1 ? 's' : ''}`}
                        {tP > 0 && ` · ${tP} PWD`}
                        {' · '}{activeDayUse.length} group{activeDayUse.length > 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-blue-700">{total} pax</div>
                  </div>
                )
              })()}

              {activeDayUse.length === 0 ? (
                <div className="text-center py-12 bg-white border border-gray-100 rounded-xl text-gray-400 text-sm">
                  No active day use guests right now.
                </div>
              ) : (
                <div className="space-y-3">
                  {activeDayUse.map(b => {
                    const pax = (b.num_adults ?? 0) + (b.num_children ?? 0) + (b.num_seniors ?? 0) + (b.num_pwd ?? 0)
                    const guestName = b.special_requests?.replace('Day Use Guest: ', '').split('\n')[0] || b.booking_number
                    const hasUnreturnedEquipment = b.rentals.length > 0
                    const hasCottage = b.cottage_id || (b.cottage_ids?.length > 0)
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
                            <div className="flex gap-1 mt-1">
                              {hasUnreturnedEquipment && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Equipment</span>}
                              {hasCottage && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Cottage</span>}
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
                                setPendingCheckoutGroup({ key: b.id, primary: b, items: [b], roomLabel: b.booking_number })
                              }}
                              className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg font-medium">
                              Return Equipment First ({b.rentals.length} item{b.rentals.length > 1 ? 's' : ''})
                            </button>
                          </div>
                        )}

                        {!hasUnreturnedEquipment && (
                          <div className="text-xs text-green-600 mb-3">✓ No unreturned equipment</div>
                        )}

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
                    const beachOnly = activeDayUse.filter(b => {
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
                              <div key={b.id} className="flex justify-between text-xs text-gray-500 py-0.5">
                                <span>{guestName}</span>
                                <span>{pax} pax · {new Date(b.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            )
                          })}
                        </div>
                        <button
                          onClick={closeAllBeachOnly}
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
                <button onClick={() => { const g = billDetail.group; setBillDetail(null); openCheckoutModal(g) }}
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
              Check Out — {checkoutModal.group.items.length > 1 ? checkoutModal.group.primary.group_number : checkoutModal.group.primary.booking_number}
            </div>
            <div className="text-xs text-gray-400 mb-3">{(checkoutModal.group.primary.guests as any)?.full_name}</div>

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
                {processingCheckout ? 'Processing...' : 'Confirm Check-Out'}
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
