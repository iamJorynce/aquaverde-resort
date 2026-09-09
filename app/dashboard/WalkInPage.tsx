'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { todayInManila, addDaysInManila, addDaysToDate, weekdayOf } from '@/lib/bookingDates'
import { printReceipt } from './receipt'
import PaymentCalculator, { isPaymentValid, paymentValidationMessage } from './PaymentCalculator'
import { logActivity } from './activityLog'
import { createOrUpdateInvoice } from './invoiceUtils'
import { usePermissions } from './permissions'
import { useResortSettings } from '@/hooks/useResortSettings'

interface RoomOption {
  id: string; room_number: string
  room_type_id: string
  room_types_config: {
    name: string; base_rate: number; max_capacity: number
    rate_3hr: number | null; rate_6hr: number | null; rate_12hr: number | null; extend_hourly_rate: number | null
  } | null
}

type DurationType = 'overnight' | '3hr' | '6hr' | '12hr'
const DURATION_HOURS: Record<Exclude<DurationType, 'overnight'>, number> = { '3hr': 3, '6hr': 6, '12hr': 12 }
const DURATION_LABELS: Record<DurationType, string> = {
  overnight: 'Overnight', '3hr': '3 Hours', '6hr': '6 Hours', '12hr': '12 Hours',
}
// Which rate field on room_types_config prices a given short-time duration.
function shortTimeRate(rtc: RoomOption['room_types_config'], duration: DurationType): number | null {
  if (!rtc || duration === 'overnight') return null
  return duration === '3hr' ? rtc.rate_3hr : duration === '6hr' ? rtc.rate_6hr : rtc.rate_12hr
}
interface CottageOption {
  id: string; name: string; cottage_code: string; day_rate: number; overnight_rate: number; status?: string
  rate_4hr: number | null; rate_8hr: number | null; blocked_weekdays: number[]
}

type CottageDurationType = 'overnight' | '4hr' | '8hr'
const COTTAGE_DURATION_HOURS: Record<Exclude<CottageDurationType, 'overnight'>, number> = { '4hr': 4, '8hr': 8 }
const COTTAGE_DURATION_LABELS: Record<CottageDurationType, string> = {
  overnight: 'Per Night', '4hr': '4 Hours', '8hr': '8 Hours',
}
// Which rate field on a cottage prices a given fixed-duration event rental
// (e.g. a Function Hall booked for a 4-hour or 8-hour block).
function cottageShortTimeRate(cottage: CottageOption | undefined, duration: CottageDurationType): number | null {
  if (!cottage || duration === 'overnight') return null
  return duration === '4hr' ? cottage.rate_4hr : cottage.rate_8hr
}
interface EquipmentOption { id: string; name: string; hourly_rate: number | null; daily_rate: number | null; available_qty: number }

// Senior Citizen / PWD / Athlete-Coach — 20% off, matching RA 9994, RA 10754
// and RA 10699. Only offered for immediate walk-in check-ins; an "advance"
// booking isn't checked in yet, so its discount (if any) is applied later
// at actual check-in via the Check-In/Out screen.
type WalkinDiscountType = 'none' | 'senior' | 'pwd' | 'athlete'
const WALKIN_DISCOUNT_LABELS: Record<Exclude<WalkinDiscountType, 'none'>, string> = {
  senior: 'Senior Citizen Discount (20%)',
  pwd: 'PWD Discount (20%)',
  athlete: 'Athlete/Coach Discount (20%)',
}

export default function WalkInPage() {
  const supabase = createClient()
  const { role } = usePermissions()
  const { settings: resortSettings } = useResortSettings()
  const isAdmin = role === 'super_admin' || role === 'resort_owner'
  const [hasActiveShift, setHasActiveShift] = useState<boolean | null>(null)

  const [allRooms, setAllRooms] = useState<RoomOption[]>([])  // all rooms, unfiltered
  const [rooms, setRooms]       = useState<RoomOption[]>([])  // rooms available for the selected dates
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [allCottages, setAllCottages] = useState<CottageOption[]>([]) // all cottages, unfiltered
  const [cottages, setCottages] = useState<CottageOption[]>([])       // cottages available for the selected dates
  const [equipment, setEquipment] = useState<EquipmentOption[]>([])
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState<any>(null)
  const [error, setError]       = useState('')

  const [bookingType, setBookingType] = useState<'walkin' | 'advance'>('walkin')
  const [discountType, setDiscountType] = useState<WalkinDiscountType>('none')
  // Short-time (3/6/12 hr) is a staff walk-in option only — an "advance"
  // reservation is for a future date, so it always stays overnight/nightly.
  const [durationType, setDurationType] = useState<DurationType>('overnight')

  function selectBookingType(type: 'walkin' | 'advance') {
    setBookingType(type)
    setDiscountType('none')
    // A walk-in guest is physically here right now — check-in is always
    // today, there's nothing to pick. Only "advance" bookings (reserving
    // for a future date) need an editable check-in date.
    if (type === 'walkin') {
      setForm(p => ({ ...p, check_in_date: todayInManila() }))
    } else {
      // Advance bookings don't support short-time — reset back to overnight.
      selectDurationType('overnight')
    }
  }

  function selectDurationType(duration: DurationType) {
    setDurationType(duration)
    // Short-time stays are same-day: check-out date isn't picked by the
    // cashier, it's derived from check-in time + duration (+ extensions
    // later, from Check-In/Out). Keep check_out_date one day ahead of
    // check-in (not "tomorrow from right now" — those differ for advance
    // bookings, where check-in isn't necessarily today) so the existing
    // date-range availability/overlap logic (which needs check_in_date <
    // check_out_date) keeps working unchanged — the room is simply held
    // for the rest of that calendar day either way.
    if (duration !== 'overnight') {
      setForm(p => ({ ...p, check_out_date: addDaysToDate(p.check_in_date, 1) }))
    }
  }

  // Cottage/function-hall fixed-duration events (4hr/8hr) — same
  // same-day placeholder-date trick as room short-time, above.
  const [cottageDurationType, setCottageDurationType] = useState<CottageDurationType>('overnight')
  function selectCottageDurationType(duration: CottageDurationType) {
    setCottageDurationType(duration)
    if (duration !== 'overnight') {
      setForm(p => ({ ...p, check_out_date: addDaysToDate(p.check_in_date, 1) }))
    }
  }

  const [form, setForm] = useState({
    full_name: '', phone: '', email: '',
    num_adults: 1 as number | '', num_children: 0 as number | '',
    room_ids: [] as string[],           // ← multiple rooms now
    cottage_ids: [] as string[],
    check_in_date:  todayInManila(),
    check_out_date: addDaysInManila(1),
    special_requests: '',
    equipment_selections: {} as Record<string, { selected: boolean; quantity: number | ''; rateType: 'hourly' | 'daily'; units: number | '' }>,
  })

  const [payment, setPayment] = useState({ method: 'cash', amountTendered: 0 })
  const [existingGuestMatch, setExistingGuestMatch] = useState<{ id: string; full_name: string; phone: string } | null>(null)
  const [pendingSubmit, setPendingSubmit] = useState(false)
  const [forceNewGuest, setForceNewGuest] = useState(false)

  async function loadData() {
    const [{ data: roomData }, { data: cottageData }, { data: eqData }] = await Promise.all([
      supabase.from('rooms').select('id, room_number, room_type_id, status, room_types_config(name, base_rate, max_capacity, rate_3hr, rate_6hr, rate_12hr, extend_hourly_rate)').order('room_number'),
      supabase.from('cottages').select('id, name, cottage_code, day_rate, overnight_rate, status, rate_4hr, rate_8hr, blocked_weekdays')
        .eq('is_active', true).order('cottage_code'),
      supabase.from('equipment').select('id, name, hourly_rate, daily_rate, available_qty').eq('is_active', true).gt('available_qty', 0).order('name'),
    ])
    setAllRooms((roomData as any) ?? [])
    setAllCottages((cottageData as any) ?? [])
    setEquipment(eqData ?? [])

    if (role === null) return // wait for role to load
    if (!isAdmin) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: shift } = await supabase.from('shifts').select('id')
          .eq('cashier_id', user.id).eq('status', 'open').maybeSingle()
        setHasActiveShift(!!shift)
      }
    } else {
      setHasActiveShift(true)
    }
  }

  useEffect(() => { loadData() }, [role])

  // Re-check room + cottage availability whenever check-in/check-out dates change
  useEffect(() => {
    checkAvailability()
  }, [form.check_in_date, form.check_out_date, allRooms, allCottages])

  // If the duration changes to a short-time option (or to a different one),
  // drop any already-selected room that isn't priced for it — otherwise a
  // room picked under "Overnight" could silently ride along at ₱0.
  useEffect(() => {
    if (!isShortTime) return
    setForm(p => ({ ...p, room_ids: p.room_ids.filter(id => selectableRooms.some(r => r.id === id)) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationType, rooms])

  // Deselect any cottage that isn't priced for the currently chosen event
  // duration — runs both ways (switching TO an hourly duration drops
  // cottages with no hourly rate; switching back to overnight drops
  // hourly-only cottages, e.g. an Function Hall with no day/night rate).
  useEffect(() => {
    setForm(p => ({ ...p, cottage_ids: p.cottage_ids.filter(id => selectableCottages.some(c => c.id === id)) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cottageDurationType, cottages])

  // Keep check_out_date pinned to check_in_date + 1 while a short-time
  // duration is "in charge" of the date range. Needed for advance
  // bookings: the cashier can pick any future check-in date, then change
  // it again after already selecting e.g. "4 Hours" for a Function Room —
  // without this, check_out_date would stay wherever it last was and
  // could end up BEFORE the newly chosen check_in_date.
  //
  // Priority when a room IS part of this booking: the ROOM's duration
  // decides the date range, never the cottage. An overnight room stay can
  // span several nights; a same-visit Function Room rental (4hr/8hr) is
  // just a flat add-on fee layered on top, not something that should
  // shrink the room stay down to one night. Cottage short-time only pins
  // the date range on its own when there's no room in this booking at all
  // (a pure Function Hall booking).
  useEffect(() => {
    const roomDrivesDates = form.room_ids.length > 0
    const shouldPin = roomDrivesDates ? isShortTime : (isShortTime || isCottageShortTime)
    if (!shouldPin) return
    setForm(p => ({ ...p, check_out_date: addDaysToDate(p.check_in_date, 1) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.check_in_date, form.room_ids.length, durationType, cottageDurationType])

  async function checkAvailability() {
    if (!form.check_in_date || !form.check_out_date) return
    if (form.check_in_date >= form.check_out_date) { setRooms([]); setCottages([]); return }

    setCheckingAvailability(true)

    // Find bookings that OVERLAP with the requested date range.
    // Overlap condition: existing.check_in < new.check_out AND existing.check_out > new.check_in
    const [{ data: overlappingRoomBookings }, { data: overlappingCottageBookings }] = await Promise.all([
      supabase.from('bookings')
        .select('room_id')
        .in('status', ['confirmed', 'checked_in', 'pending'])
        .not('room_id', 'is', null)
        .lt('check_in_date', form.check_out_date)
        .gt('check_out_date', form.check_in_date),

      // Cottages were previously gated ONLY by their `status` column
      // (available/reserved/occupied), which isn't date-aware — booking
      // one for next week flipped it to 'reserved' and hid it from every
      // OTHER date range too, even ones that don't overlap at all. This
      // mirrors the room logic above so a cottage is judged by whether
      // it's actually booked for THESE dates, not a single global flag.
      supabase.from('bookings')
        .select('cottage_id, cottage_ids')
        .in('status', ['confirmed', 'checked_in', 'pending'])
        .lt('check_in_date', form.check_out_date)
        .gt('check_out_date', form.check_in_date),
    ])

    const bookedRoomIds = new Set((overlappingRoomBookings ?? []).map(b => b.room_id))

    const bookedCottageIds = new Set<string>()
    for (const b of overlappingCottageBookings ?? []) {
      if (b.cottage_id) bookedCottageIds.add(b.cottage_id)
      for (const id of (b.cottage_ids as string[] | null) ?? []) bookedCottageIds.add(id)
    }

    // A room is available for these dates if it's not in maintenance/out_of_order
    // AND has no overlapping booking in this date range.
    const availableRooms = allRooms.filter(r =>
      !bookedRoomIds.has(r.id) &&
      (r as any).status !== 'maintenance' &&
      (r as any).status !== 'out_of_order'
    )

    // For cottages: 'maintenance' always blocks it. 'occupied'/'cleaning'
    // only block it when today falls inside the requested range — that
    // status reflects the cottage's real, physical state right now (e.g.
    // mid-cleaning from a day-use guest that just left), which the
    // booking-overlap query alone might miss. For a range that doesn't
    // include today, only an actual overlapping booking should block it.
    const todayStr = todayInManila()
    const rangeIncludesToday = form.check_in_date <= todayStr && todayStr < form.check_out_date
    const blockedCottageStatuses = rangeIncludesToday
      ? ['maintenance', 'occupied', 'cleaning']
      : ['maintenance']

    // A cottage with blocked_weekdays set (e.g. a Function Hall closed
    // every Sunday) is hidden whenever the check-in date falls on one of
    // those weekdays — this only looks at check-in day, matching how a
    // fixed-duration event booking (4hr/8hr) is a single-day affair.
    const checkInWeekday = weekdayOf(form.check_in_date)

    const availableCottages = allCottages.filter(c =>
      !bookedCottageIds.has(c.id) &&
      !blockedCottageStatuses.includes((c as any).status) &&
      !(c.blocked_weekdays ?? []).includes(checkInWeekday)
    )

    setRooms(availableRooms)
    setCottages(availableCottages)

    // Deselect any previously-selected rooms/cottages that are no longer available
    setForm(p => ({
      ...p,
      room_ids: p.room_ids.filter(id => availableRooms.some(r => r.id === id)),
      cottage_ids: p.cottage_ids.filter(id => availableCottages.some(c => c.id === id)),
    }))

    setCheckingAvailability(false)
  }

  function toggleRoom(id: string) {
    setForm(p => ({
      ...p,
      room_ids: p.room_ids.includes(id) ? p.room_ids.filter(r => r !== id) : [...p.room_ids, id],
    }))
  }

  function toggleCottage(id: string) {
    setForm(p => ({
      ...p,
      cottage_ids: p.cottage_ids.includes(id) ? p.cottage_ids.filter(c => c !== id) : [...p.cottage_ids, id],
    }))
  }

  function toggleEquipment(id: string, item: EquipmentOption) {
    setForm(p => {
      const cur = p.equipment_selections[id]
      return {
        ...p,
        equipment_selections: {
          ...p.equipment_selections,
          [id]: {
            selected: !cur?.selected,
            quantity: cur?.quantity ?? 1,
            rateType: cur?.rateType ?? (item.hourly_rate ? 'hourly' : 'daily'),
            units: cur?.units ?? 1,
          },
        },
      }
    })
  }

  function updateEqField(id: string, field: 'quantity' | 'units' | 'rateType', value: any) {
    setForm(p => ({
      ...p,
      equipment_selections: { ...p.equipment_selections, [id]: { ...p.equipment_selections[id], [field]: value } },
    }))
  }

  // ---- Pricing calculation ----
  const isShortTime = durationType !== 'overnight'
  // For short-time, only room types that were actually given a flat rate
  // for this duration are offerable — everything else stays overnight-only.
  const selectableRooms = isShortTime
    ? rooms.filter(r => shortTimeRate(r.room_types_config, durationType) != null)
    : rooms

  const totalPax = (Number(form.num_adults) || 0) + (Number(form.num_children) || 0)
  const selectedRooms = selectableRooms.filter(r => form.room_ids.includes(r.id))
  const selectedRoomsCapacity = selectedRooms.reduce((s, r) => s + (r.room_types_config?.max_capacity ?? 0), 0)
  // Rooms that individually fit totalPax alone — used only to decide which
  // empty-state message to show (all rooms remain selectable regardless,
  // since combining multiple smaller rooms is a valid way to fit more pax).
  const capacityFilteredRooms = selectableRooms.filter(r => (r.room_types_config?.max_capacity ?? 0) >= totalPax)
  const nights = Math.max(1, Math.ceil(
    (new Date(form.check_out_date).getTime() - new Date(form.check_in_date).getTime()) / 86400000
  ))

  // Per-room subtotal (each room may have a different rate). Short-time
  // stays are a flat rate for the whole booking, not multiplied by nights.
  const roomLines = selectedRooms.map(r => {
    const rate = isShortTime ? (shortTimeRate(r.room_types_config, durationType) ?? 0) : (r.room_types_config?.base_rate ?? 0)
    return {
      id: r.id,
      label: `Room ${r.room_number} — ${r.room_types_config?.name}`,
      rate,
      amount: isShortTime ? rate : rate * nights,
    }
  })
  const roomsSubtotal = roomLines.reduce((s, l) => s + l.amount, 0)

  const isCottageShortTime = cottageDurationType !== 'overnight'
  // For a fixed-duration event booking, only cottages that were actually
  // given a flat rate for this duration are offerable — everything else
  // stays per-night/per-day only.
  const selectableCottages = isCottageShortTime
    ? cottages.filter(c => cottageShortTimeRate(c, cottageDurationType) != null)
    : cottages.filter(c => (c.overnight_rate ?? 0) > 0 || (c.day_rate ?? 0) > 0)
  const selectedCottages = selectableCottages.filter(c => form.cottage_ids.includes(c.id))
  const cottageFee = isCottageShortTime
    ? selectedCottages.reduce((sum, c) => sum + (cottageShortTimeRate(c, cottageDurationType) ?? 0), 0)
    : selectedCottages.reduce((sum, c) => sum + Number(c.overnight_rate || c.day_rate), 0) * nights

  const equipmentLines = Object.entries(form.equipment_selections)
    .filter(([, s]) => s.selected)
    .map(([id, s]) => {
      const item = equipment.find(e => e.id === id)
      if (!item) return null
      const r = s.rateType === 'hourly' ? item.hourly_rate ?? 0 : item.daily_rate ?? 0
      const qty = Number(s.quantity) || 0
      const units = Number(s.units) || 0
      return { id, name: item.name, quantity: qty, units, rateType: s.rateType, amount: r * qty * units }
    }).filter(Boolean) as { id: string; name: string; quantity: number; units: number; rateType: string; amount: number }[]

  const equipmentFee = equipmentLines.reduce((s, l) => s + l.amount, 0)

  const totalBill = roomsSubtotal + cottageFee + equipmentFee

  // Discount only applies to an actual walk-in (checked in right now) — an
  // "advance" booking isn't checked in yet, so it's handled later at the
  // real check-in via the Check-In/Out screen.
  const walkinDiscountAmount = bookingType === 'walkin' && discountType !== 'none' ? Math.round(totalBill * 0.20) : 0
  const finalTotalBill = totalBill - walkinDiscountAmount

  // Reservation fee = 50% of the ENTIRE bill (all rooms, cottages, equipment, all nights)
  const reservationFee = bookingType === 'advance' ? Math.ceil(totalBill * 0.5) : 0
  const amountDueNow    = bookingType === 'advance' ? reservationFee : finalTotalBill

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name)  { setError('Guest name is required.'); return }
    // A booking needs a room OR a cottage — a Function Hall / cottage-only
    // event booking with no room is valid, so only reject when BOTH are empty.
    if (form.room_ids.length === 0 && form.cottage_ids.length === 0) {
      setError('Please select at least one room or cottage.'); return
    }
    // Defensive: if a number field was left empty (e.g. submit tapped before
    // blur fired on mobile), fall back to its minimum instead of inserting 0.
    const numAdults = form.num_adults === '' || Number(form.num_adults) < 1 ? 1 : Number(form.num_adults)
    const numChildren = form.num_children === '' ? 0 : Number(form.num_children)
    if (numAdults !== form.num_adults || numChildren !== form.num_children) {
      setForm(p => ({ ...p, num_adults: numAdults, num_children: numChildren }))
    }
    // Room capacity only matters when a room is actually being booked —
    // a cottage-only (e.g. Function Hall) booking has its own capacity
    // (cottage_types_config.max_capacity) but isn't gated here.
    if (form.room_ids.length > 0 && selectedRoomsCapacity < numAdults + numChildren) {
      setError(`Selected rooms only fit ${selectedRoomsCapacity} guest(s), but ${numAdults + numChildren} guest(s) were entered. Please select more rooms.`)
      return
    }

    setLoading(true)
    setError('')

    const paymentError = paymentValidationMessage(payment.method, amountDueNow, payment.amountTendered)
    if (paymentError) { setError(paymentError); setLoading(false); return }

    // Re-verify room availability right before submitting — closes most of
    // the race-condition window (though the DB constraint is the real
    // guarantee against two simultaneous submissions). Skipped entirely
    // for a cottage-only booking (no rooms selected) — .in('room_id', [])
    // would otherwise be sent with an empty list.
    if (form.room_ids.length > 0) {
      const { data: freshOverlaps } = await supabase
        .from('bookings')
        .select('room_id')
        .in('status', ['confirmed', 'checked_in', 'pending'])
        .in('room_id', form.room_ids)
        .lt('check_in_date', form.check_out_date)
        .gt('check_out_date', form.check_in_date)

      if (freshOverlaps && freshOverlaps.length > 0) {
        const conflictingIds = new Set(freshOverlaps.map(b => b.room_id))
        const conflictingRooms = selectedRooms.filter(r => conflictingIds.has(r.id)).map(r => `Room ${r.room_number}`)
        setError(`${conflictingRooms.join(', ')} ${conflictingRooms.length > 1 ? 'were' : 'was'} just booked by someone else. Please reselect.`)
        setLoading(false)
        checkAvailability()
        return
      }
    }

    if (form.cottage_ids.length > 0) {
      const { data: freshCottageOverlaps } = await supabase
        .from('bookings')
        .select('cottage_id, cottage_ids')
        .in('status', ['confirmed', 'checked_in', 'pending'])
        .lt('check_in_date', form.check_out_date)
        .gt('check_out_date', form.check_in_date)

      const conflictingCottageIds = new Set<string>()
      for (const b of freshCottageOverlaps ?? []) {
        if (b.cottage_id) conflictingCottageIds.add(b.cottage_id)
        for (const id of (b.cottage_ids as string[] | null) ?? []) conflictingCottageIds.add(id)
      }
      const conflictingCottages = selectedCottages
        .filter(c => conflictingCottageIds.has(c.id))
        .map(c => c.name)

      if (conflictingCottages.length > 0) {
        setError(`${conflictingCottages.join(', ')} ${conflictingCottages.length > 1 ? 'were' : 'was'} just booked by someone else. Please reselect.`)
        setLoading(false)
        checkAvailability()
        return
      }
    }

    // Re-verify equipment quantities right before submitting — the counts
    // shown on screen were fetched on page load and can go stale if
    // another cashier rents the same item in the meantime.
    if (equipmentLines.length > 0) {
      const { data: freshEquipment } = await supabase
        .from('equipment')
        .select('id, name, available_qty')
        .in('id', equipmentLines.map(l => l.id))

      const shortages = equipmentLines.filter(l => {
        const fresh = freshEquipment?.find(e => e.id === l.id)
        return !fresh || fresh.available_qty < l.quantity
      })

      if (shortages.length > 0) {
        setError(`Not enough stock left for: ${shortages.map(s => s.name).join(', ')}. Please adjust the quantity.`)
        setLoading(false)
        loadData()
        return
      }
    }

    // Tracks what's actually been committed so far in this attempt, so we
    // can undo it if a later step fails partway through (e.g. room 2 of a
    // 3-room group booking loses a booking-slot race). Without this, a
    // failed submission could leave orphaned "confirmed" bookings and
    // rooms stuck marked occupied with no payment/invoice/receipt to match.
    const rollback = {
      bookingIds: [] as string[],
      occupiedRoomIds: [] as string[],
      createdGuestId: null as string | null,
    }
    async function rollbackPartialSubmit() {
      if (rollback.bookingIds.length > 0) {
        await supabase.from('bookings').delete().in('id', rollback.bookingIds)
      }
      for (const roomId of rollback.occupiedRoomIds) {
        await supabase.from('rooms').update({ status: 'available' }).eq('id', roomId)
      }
      // Only remove the guest record if THIS submission created it — never
      // delete a pre-existing guest just because a later step failed.
      if (rollback.createdGuestId) {
        await supabase.from('guests').delete().eq('id', rollback.createdGuestId)
      }
    }

    try {
      // 1. Upsert guest — only match by phone if phone provided
      // Only look up existing guest if phone was provided — never match on blank/placeholder
      // forceNewGuest=true means cashier chose "Different Person" — skip lookup
      const { data: existingGuest } = form.phone && !forceNewGuest
        ? await supabase.from('guests').select('id, full_name, phone').eq('phone', form.phone).maybeSingle()
        : { data: null }

      let guestId: string

      if (existingGuest) {
        // Phone matched an existing guest — ask cashier to confirm before reusing
        if (!pendingSubmit) {
          setExistingGuestMatch(existingGuest)
          setLoading(false)
          return   // pause here; confirmation modal will re-call handleSubmit with pendingSubmit=true
        }
        // Cashier confirmed — use existing guest
        guestId = existingGuest.id
        setPendingSubmit(false)
        setExistingGuestMatch(null)
        setForceNewGuest(false)
      } else {
        const guestCode = `G-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
        const { data: newGuest, error: guestError } = await supabase.from('guests')
          .insert({ full_name: form.full_name, phone: form.phone || null, email: form.email || null, guest_code: guestCode })
          .select('id').single()
        if (guestError) throw guestError
        guestId = newGuest.id
        rollback.createdGuestId = newGuest.id
      }

      const wristband = `WB-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
      const groupNumber = `GRP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`  // ties multiple room bookings together

      // 2. Create ONE booking per room, all sharing the same guest/dates/group
      const createdBookings: any[] = []
      // Short-time stays: the clock starts now and expires `duration` hours
      // later. Every room in the group shares the same start/expiry.
      const checkInTimestamp = new Date()
      const expectedCheckOutAt = isShortTime
        ? new Date(checkInTimestamp.getTime() + DURATION_HOURS[durationType as Exclude<DurationType, 'overnight'>] * 60 * 60 * 1000).toISOString()
        : null
      // Same idea for a cottage/function-hall fixed-duration event booking.
      const cottageExpectedCheckOutAt = isCottageShortTime
        ? new Date(checkInTimestamp.getTime() + COTTAGE_DURATION_HOURS[cottageDurationType as Exclude<CottageDurationType, 'overnight'>] * 60 * 60 * 1000).toISOString()
        : null

      // No rooms selected — this is a cottage-only booking (e.g. a
      // Function Hall event). Create exactly ONE booking row directly
      // against the cottage(s), with no room attached at all.
      if (roomLines.length === 0) {
        const { data: booking, error: bookingError } = await supabase.from('bookings').insert({
          guest_id: guestId,
          room_id: null,
          cottage_id: selectedCottages[0]?.id ?? null,
          cottage_ids: selectedCottages.map(c => c.id),
          booking_type: bookingType === 'advance' ? 'online' : 'walk_in',
          accommodation_type: 'cottage',
          duration_type: isCottageShortTime ? cottageDurationType : 'overnight',
          expected_check_out_at: cottageExpectedCheckOutAt,
          num_adults: numAdults,
          num_children: numChildren,
          group_number: null,
          is_group_primary: true,
          check_in_date: form.check_in_date,
          check_out_date: form.check_out_date,
          actual_check_in: bookingType === 'walkin' ? checkInTimestamp.toISOString() : null,
          subtotal: cottageFee,
          extras_total: equipmentFee,
          total_amount: cottageFee + equipmentFee,
          amount_paid: 0,
          payment_status: 'unpaid',
          status: bookingType === 'advance' ? 'confirmed' : 'checked_in',
          wristband_number: wristband,
          special_requests: form.special_requests || null,
        }).select().single()

        if (bookingError) throw bookingError
        createdBookings.push({
          ...booking,
          roomLabel: selectedCottages.map(c => c.name).join(', '),
          roomAmount: cottageFee,
        })
        rollback.bookingIds.push(booking.id)
      }

      for (let i = 0; i < roomLines.length; i++) {
        const rl = roomLines[i]
        const isPrimary = i === 0

        const { data: booking, error: bookingError } = await supabase.from('bookings').insert({
          guest_id: guestId,
          room_id: rl.id,
          booking_type: bookingType === 'advance' ? 'online' : 'walk_in',
          accommodation_type: 'room',
          duration_type: durationType,
          expected_check_out_at: expectedCheckOutAt,
          // Only the primary (first) booking in the group carries the real
          // guest count. Other rooms in the same group get 0 — their
          // occupants are already counted once via the primary booking.
          // This prevents headcount sums (e.g. in Check-In/Out) from
          // multiplying the same group's pax by the number of rooms booked.
          num_adults: isPrimary ? numAdults : 0,
          num_children: isPrimary ? numChildren : 0,
          group_number: roomLines.length > 1 ? groupNumber : null,
          is_group_primary: isPrimary,
          check_in_date: form.check_in_date,
          check_out_date: form.check_out_date,
          actual_check_in: bookingType === 'walkin' ? checkInTimestamp.toISOString() : null,
          subtotal: rl.amount,
          // Cottages + equipment fees are attributed to the PRIMARY (first) booking only,
          // to avoid double counting across multiple room records.
          extras_total: isPrimary ? (cottageFee + equipmentFee) : 0,
          total_amount: isPrimary ? (rl.amount + cottageFee + equipmentFee) : rl.amount,
          amount_paid: 0,  // set after we know the split, below
          payment_status: 'unpaid',
          status: bookingType === 'advance' ? 'confirmed' : 'checked_in',
          wristband_number: wristband,
          special_requests: [
            form.special_requests || null,
            roomLines.length > 1 ? `Group booking: ${groupNumber} (${roomLines.length} rooms, ${totalPax} total guests)` : null,
          ].filter(Boolean).join(' | ') || null,
        }).select().single()

        if (bookingError) throw bookingError
        createdBookings.push({ ...booking, roomLabel: rl.label, roomAmount: rl.amount })
        rollback.bookingIds.push(booking.id)

        // Mark room occupied (walk-in only; advance stays reserved until check-in)
        if (bookingType === 'walkin') {
          await supabase.from('rooms').update({ status: 'occupied' }).eq('id', rl.id)
          rollback.occupiedRoomIds.push(rl.id)
        }
      }

      const primaryBooking = createdBookings[0]

      // 3. Apply discount (if any) and payment — split proportionally across
      // all room bookings so each booking's total/amount_paid reflects its
      // fair share.
      const allBookingsGrandTotal = createdBookings.reduce((s, b) => s + Number(b.total_amount), 0)
      const applyDiscount = bookingType === 'walkin' && discountType !== 'none'
      const groupDiscountAmount = applyDiscount ? Math.round(allBookingsGrandTotal * 0.20) : 0

      for (const b of createdBookings) {
        const bookingDiscountShare = applyDiscount && allBookingsGrandTotal > 0
          ? Math.round((Number(b.total_amount) / allBookingsGrandTotal) * groupDiscountAmount)
          : 0
        const newTotalAmount = Number(b.total_amount) - bookingDiscountShare
        const share = allBookingsGrandTotal > 0
          ? Math.round((Number(b.total_amount) / allBookingsGrandTotal) * amountDueNow)
          : 0
        const newStatus = share >= newTotalAmount ? 'paid' : (share > 0 ? 'partial' : 'unpaid')
        await supabase.from('bookings').update({
          amount_paid: share,
          payment_status: newStatus,
          ...(applyDiscount ? {
            total_amount: newTotalAmount,
            discount_amount: bookingDiscountShare,
            discount_reason: WALKIN_DISCOUNT_LABELS[discountType as Exclude<WalkinDiscountType, 'none'>],
          } : {}),
        }).eq('id', b.id)
      }

      // 4. Cottages — attributed to primary booking (which IS the cottage
      // booking itself, when there's no room in this booking).
      for (const c of selectedCottages) {
        await supabase.from('cottages').update({ status: bookingType === 'walkin' ? 'occupied' : 'reserved' }).eq('id', c.id)
        const cottageRate = isCottageShortTime ? (cottageShortTimeRate(c, cottageDurationType) ?? 0) : Number(c.overnight_rate || c.day_rate)
        const cottageQty = isCottageShortTime ? 1 : nights
        const cottageLabel = isCottageShortTime ? `${c.name} — ${COTTAGE_DURATION_LABELS[cottageDurationType]}` : `Cottage — ${c.name}`
        await supabase.from('booking_addons').insert({ booking_id: primaryBooking.id, name: cottageLabel, quantity: cottageQty, unit_price: cottageRate })
      }

      // Store cottage IDs on the primary booking so checkout can trigger
      // housekeeping cleanup for them (same pattern used for day use
      // bookings). Already set at insert time for a cottage-only booking —
      // this just re-confirms it, and is the only place it's set when
      // rooms are also involved.
      if (selectedCottages.length > 0) {
        await supabase.from('bookings').update({
          cottage_id: selectedCottages[0].id,
          cottage_ids: selectedCottages.map(c => c.id),
        }).eq('id', primaryBooking.id)
      }

      // 5. Equipment — attributed to primary booking
      for (const line of equipmentLines) {
        const item = equipment.find(eq => eq.id === line.id)
        if (!item) continue
        await supabase.from('equipment_rentals').insert({
          rental_number: `RNT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          equipment_id: line.id,
          booking_id: primaryBooking.id,
          quantity: line.quantity,
          rate_type: line.rateType,
          rate_amount: line.rateType === 'hourly' ? item.hourly_rate : item.daily_rate,
          total_amount: line.amount,
          rental_start: new Date().toISOString(),
        })
        await supabase.from('equipment').update({ available_qty: item.available_qty - line.quantity }).eq('id', line.id)
        await supabase.from('booking_addons').insert({ booking_id: primaryBooking.id, name: `${line.name} × ${line.quantity}`, quantity: line.units, unit_price: line.amount / line.units })
      }

      // Human-readable label for what was booked — handles the cottage-only
      // (no room) case, e.g. a Function Hall event, same as the room case.
      const bookingSummaryLabel = roomLines.length > 0
        ? `${roomLines.length} room(s)`
        : `${selectedCottages.length} cottage(s) [${selectedCottages.map(c => c.name).join(', ')}]`

      // 6. Single transaction for the whole payment
      await supabase.from('transactions').insert({
        status: 'completed',
        txn_number: `TXN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        booking_id: primaryBooking.id,
        guest_id: guestId,
        txn_type: bookingType === 'advance' ? 'reservation_fee' : 'room',
        description: bookingType === 'advance'
          ? `Reservation fee (50% of total) — ${bookingSummaryLabel}, ${primaryBooking.booking_number}${roomLines.length > 1 ? ` +${roomLines.length - 1} more` : ''}`
          : `Walk-in payment — ${bookingSummaryLabel}, ${primaryBooking.booking_number}${roomLines.length > 1 ? ` +${roomLines.length - 1} more` : ''}`,
        amount: amountDueNow,
        payment_method: payment.method,
      })

      await logActivity(supabase, {
        action: bookingType === 'advance' ? 'ADVANCE_BOOKING' : 'WALK_IN',
        details: roomLines.length > 0
          ? `${form.full_name} — ${roomLines.length} room(s) [${roomLines.map(r => r.label).join(', ')}], ₱${amountDueNow.toLocaleString()} ${payment.method}`
          : `${form.full_name} — ${bookingSummaryLabel}, ₱${amountDueNow.toLocaleString()} ${payment.method}`,
        table_name: 'bookings',
        record_id: primaryBooking.id,
      })

      // 7. Invoice for billing module — one invoice covering the whole group
      await createOrUpdateInvoice(supabase, {
        booking_id: primaryBooking.id,
        guest_id: guestId,
        subtotal: roomLines.length > 0 ? roomsSubtotal : cottageFee,
        total: finalTotalBill,
        amount_paid: amountDueNow,
        notes: roomLines.length > 1
          ? `Group booking ${groupNumber}: ${roomLines.map(r => r.label).join(', ')}`
          : (bookingType === 'advance' ? 'Reservation fee collected. Balance due on check-in.' : undefined),
      })

      // 8. Print single itemized receipt covering all rooms/cottages
      const lineItems: any[] = roomLines.map(r => ({ label: isShortTime ? `${r.label} — ${DURATION_LABELS[durationType]}` : `${r.label} × ${nights} night(s)`, amount: r.amount }))
      selectedCottages.forEach(c => {
        const cottageRate = isCottageShortTime ? (cottageShortTimeRate(c, cottageDurationType) ?? 0) : Number(c.overnight_rate || c.day_rate) * nights
        const label = isCottageShortTime ? `${c.name} — ${COTTAGE_DURATION_LABELS[cottageDurationType]}` : `${c.name} × ${nights} night(s)`
        lineItems.push({ label, amount: cottageRate })
      })
      equipmentLines.forEach(l => lineItems.push({ label: `${l.name} × ${l.quantity} (${l.units} ${l.rateType === 'hourly' ? 'hr' : 'day'})`, amount: l.amount }))

      printReceipt({
        title: resortSettings.resort_name,
        subtitle: resortSettings.address,
        receiptNumber: roomLines.length > 1 ? groupNumber : primaryBooking.booking_number,
        receiptType: bookingType === 'advance' ? 'Reservation Receipt' : 'Walk-in Receipt',
        date: new Date().toLocaleDateString('en-PH', { dateStyle: 'medium' }),
        guestName: form.full_name,
        guestContact: form.phone || form.email || undefined,
        lineItems,
        total: finalTotalBill,
        discount: walkinDiscountAmount || undefined,
        discountReason: applyDiscount ? WALKIN_DISCOUNT_LABELS[discountType as Exclude<WalkinDiscountType, 'none'>] : undefined,
        amountPaid: amountDueNow,
        balance: finalTotalBill - amountDueNow,
        paymentMethod: payment.method,
        footerNote: bookingType === 'advance'
          ? `Reservation fee paid. Balance of ₱${(totalBill - amountDueNow).toLocaleString()} due on check-in. Wristband: ${wristband}`
          : `Thank you! Wristband: ${wristband}${roomLines.length > 1 ? ` · ${roomLines.length} rooms booked` : ''}`,
      })

      setSuccess({
        bookingNumbers: createdBookings.map(b => b.booking_number),
        wristband, guestName: form.full_name, amountDueNow, totalBill: finalTotalBill, roomCount: roomLines.length,
      })
      setForm({
        full_name: '', phone: '', email: '', num_adults: 1, num_children: 0,
        room_ids: [], cottage_ids: [],
        check_in_date: todayInManila(),
        check_out_date: addDaysInManila(1),
        special_requests: '', equipment_selections: {},
      })
      setDiscountType('none')
      setDurationType('overnight')
      setPayment({ method: 'cash', amountTendered: 0 })
      loadData()

    } catch (err: any) {
      // Detect the DB-level double-booking rejection specifically and show
      // a clear message instead of the raw Postgres constraint error text.
      const isDoubleBookingError = err.message?.includes('no_overlapping_room_bookings')
        || err.message?.includes('exclusion constraint')
        || err.code === '23P01'

      // Undo whatever this attempt already committed (bookings created,
      // rooms marked occupied, a brand-new guest row) so a mid-loop
      // failure — e.g. room 2 of a 3-room group losing a booking race —
      // doesn't leave orphaned records with no payment/invoice/receipt.
      await rollbackPartialSubmit()

      setError(
        isDoubleBookingError
          ? 'One of the selected rooms was just booked by someone else for overlapping dates. Please refresh and pick another room.'
          : (err.message || 'Something went wrong. Please try again.')
      )

      // Refresh availability so the conflicting room disappears from the list
      checkAvailability()
      loadData()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl">
      {hasActiveShift === false && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-red-500 text-lg">🔒</span>
          <div>
            <div className="text-sm font-medium text-red-700">No Active Shift</div>
            <div className="text-xs text-red-500">You must open a shift in the <strong>Remittance</strong> section before registering a walk-in.</div>
          </div>
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4 flex items-start justify-between">
          <div>
            <div className="text-sm font-medium text-green-800">
              ✅ Registered! {success.roomCount > 1 ? `${success.roomCount} rooms` : success.bookingNumbers[0]}
            </div>
            <div className="text-xs text-green-600 mt-0.5">
              {success.roomCount > 1 && `Bookings: ${success.bookingNumbers.join(', ')} · `}
              Wristband: {success.wristband} · Paid: ₱{success.amountDueNow?.toLocaleString()}
            </div>
          </div>
          <button onClick={() => setSuccess(null)} className="text-green-500 text-lg">×</button>
        </div>
      )}
      {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{error}</div>}

      <div className="flex gap-2 mb-4">
        <button type="button" onClick={() => selectBookingType('walkin')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${bookingType === 'walkin' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Walk-in (today)
        </button>
        <button type="button" onClick={() => selectBookingType('advance')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${bookingType === 'advance' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Advance / Online Booking
        </button>
      </div>

      {bookingType === 'advance' && (
        <div className="mb-4 bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700">
          Advance booking: only the <strong>50% reservation fee (based on first room's first night)</strong> is collected now. Balance is due on actual check-in.
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left column: guest + rooms */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
            <div className="text-sm font-medium text-gray-700">Guest Details</div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Full Name</label>
              <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                placeholder="Juan Dela Cruz"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phone</label>
                <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="+63 9XX XXX XXXX"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Adults</label>
                <input type="number" inputMode="numeric" min={1} value={form.num_adults}
                  onChange={e => {
                    const v = e.target.value
                    setForm(p => ({ ...p, num_adults: v === '' ? '' : Math.max(0, parseInt(v) || 0) }))
                  }}
                  onBlur={() => setForm(p => ({ ...p, num_adults: (p.num_adults === '' || Number(p.num_adults) < 1) ? 1 : p.num_adults }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Children</label>
                <input type="number" inputMode="numeric" min={0} value={form.num_children}
                  onChange={e => {
                    const v = e.target.value
                    setForm(p => ({ ...p, num_children: v === '' ? '' : Math.max(0, parseInt(v) || 0) }))
                  }}
                  onBlur={() => setForm(p => ({ ...p, num_children: p.num_children === '' ? 0 : p.num_children }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
            <div className="text-sm font-medium text-gray-700">Dates</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Check-in</label>
                {bookingType === 'walkin' ? (
                  <div className="w-full px-3 py-2 border border-gray-100 bg-gray-50 rounded-lg text-sm text-gray-500">
                    Today — {new Date(form.check_in_date + 'T00:00:00').toLocaleDateString('en-PH', { dateStyle: 'medium' })}
                  </div>
                ) : (
                  <input type="date" value={form.check_in_date} onChange={e => setForm(p => ({ ...p, check_in_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Check-out</label>
                {(() => {
                  // Same priority as the sync effect above: a room in the
                  // booking always drives the date range (so an overnight
                  // room stay can still span several nights even if a
                  // Function Room/cottage add-on is a flat 4hr/8hr rental).
                  // Cottage short-time only locks the field on its own for
                  // a pure Function Hall booking with no room selected.
                  const roomDrivesDates = form.room_ids.length > 0
                  const locked = roomDrivesDates ? isShortTime : (isShortTime || isCottageShortTime)
                  const lockLabel = isShortTime ? DURATION_LABELS[durationType] : COTTAGE_DURATION_LABELS[cottageDurationType]
                  return locked ? (
                    <div className="w-full px-3 py-2 border border-gray-100 bg-gray-50 rounded-lg text-sm text-gray-500">
                      ~{lockLabel} from check-in
                    </div>
                  ) : (
                    <input type="date" value={form.check_out_date} onChange={e => setForm(p => ({ ...p, check_out_date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
                  )
                })()}
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Special Requests</label>
              <input value={form.special_requests} onChange={e => setForm(p => ({ ...p, special_requests: e.target.value }))}
                placeholder="e.g. Extra pillows, adjacent rooms"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
          </div>

          {/* Multiple room selection — mixed types allowed, filtered by date availability AND capacity */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">
              Select Room(s) <span className="text-xs text-gray-400 font-normal">— select multiple, any type</span>
            </div>

            {bookingType === 'walkin' && form.cottage_ids.length === 0 && (
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-1.5">Stay Type</div>
                <div className="flex gap-2 flex-wrap">
                  {(['overnight', '3hr', '6hr', '12hr'] as DurationType[]).map(d => (
                    <button key={d} type="button" onClick={() => selectDurationType(d)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-medium ${durationType === d ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {DURATION_LABELS[d]}
                    </button>
                  ))}
                </div>
                {isShortTime && (
                  <div className="mt-2 bg-teal-50 border border-teal-100 rounded-lg p-2.5 text-xs text-teal-700">
                    Short-time · {DURATION_LABELS[durationType]} flat rate, starting now. Only rooms priced for this duration are shown below.
                    Use <strong>Extend</strong> on the Active Stays tab in Check-In/Out if the guest needs more time.
                  </div>
                )}
              </div>
            )}

            {checkingAvailability ? (
              <div className="text-xs text-gray-400 py-3 text-center">Checking availability for selected dates...</div>
            ) : form.cottage_ids.length > 0 ? (
              <div className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
                A cottage/function hall is selected — rooms can't be added to this booking. Unselect it first, or submit the room as a separate booking.
              </div>
            ) : rooms.length === 0 ? (
              <div className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
                No rooms available for {form.check_in_date} to {form.check_out_date}. Try different dates.
              </div>
            ) : isShortTime && selectableRooms.length === 0 ? (
              <div className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
                No room type has a {DURATION_LABELS[durationType]} rate set yet. Add one under Rooms → Room Types, or pick a different stay type.
              </div>
            ) : (
              <>
                {capacityFilteredRooms.length === 0 && (
                  <div className="text-xs text-blue-600 bg-blue-50 rounded-lg p-2.5 mb-2">
                    No single room fits {totalPax} guest(s) — select multiple rooms below to combine capacity.
                  </div>
                )}
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {selectableRooms.map(r => {
                    const cap = r.room_types_config?.max_capacity ?? 0
                    const tooSmallAlone = cap < totalPax && form.room_ids.length === 0
                    const displayRate = isShortTime ? (shortTimeRate(r.room_types_config, durationType) ?? 0) : (r.room_types_config?.base_rate ?? 0)
                    return (
                      <label key={r.id} className={`flex items-center justify-between gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-1 py-1 ${tooSmallAlone ? 'opacity-40' : ''}`}>
                        <span className="flex items-center gap-2">
                          <input type="checkbox" checked={form.room_ids.includes(r.id)} onChange={() => toggleRoom(r.id)} />
                          <span className="text-gray-700">Room {r.room_number}</span>
                          <span className="text-xs text-gray-400">— {r.room_types_config?.name}</span>
                          <span className="text-xs text-gray-300">(max {cap} pax)</span>
                        </span>
                        <span className="text-gray-400 text-xs">₱{Number(displayRate).toLocaleString()}{isShortTime ? ` / ${DURATION_LABELS[durationType]}` : '/night'}</span>
                      </label>
                    )
                  })}
                </div>
              </>
            )}

            {form.room_ids.length > 0 && (
              <div className={`mt-2 text-xs rounded-lg px-2 py-1.5 ${
                selectedRoomsCapacity >= totalPax ? 'text-blue-600 bg-blue-50' : 'text-red-600 bg-red-50'
              }`}>
                {form.room_ids.length} room(s) selected — capacity {selectedRoomsCapacity} pax
                {selectedRoomsCapacity < totalPax && ` — ⚠ short by ${totalPax - selectedRoomsCapacity} pax, please select more rooms`}
              </div>
            )}
          </div>
        </div>

        {/* Right column: cottages + equipment + summary */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Add Cottages / Function Room (optional, select multiple)</div>
            {form.room_ids.length > 0 ? (
              <div className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
                A room is selected — cottages/function halls can't be added to this booking. Unselect all rooms first, or submit the cottage/function hall as a separate booking.
              </div>
            ) : (
              <>
                <div className="flex gap-1.5 mb-2">
                  {(['overnight', '4hr', '8hr'] as CottageDurationType[]).map(d => (
                    <button key={d} type="button" onClick={() => selectCottageDurationType(d)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
                        cottageDurationType === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                      }`}>
                      {COTTAGE_DURATION_LABELS[d]}
                    </button>
                  ))}
                </div>

                {selectableCottages.length === 0 ? (
                  <div className="text-xs text-gray-400">
                    {isCottageShortTime
                      ? `No cottages offer a ${COTTAGE_DURATION_LABELS[cottageDurationType]} rate.`
                      : 'No available cottages right now.'}
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {selectableCottages.map(c => {
                      const rate = isCottageShortTime ? cottageShortTimeRate(c, cottageDurationType) : Number(c.overnight_rate || c.day_rate)
                      return (
                        <label key={c.id} className="flex items-center justify-between gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                          <span className="flex items-center gap-2">
                            <input type="checkbox" checked={form.cottage_ids.includes(c.id)} onChange={() => toggleCottage(c.id)} />
                            <span className="text-gray-700">{c.name}</span>
                            <span className="text-xs text-gray-400">({c.cottage_code})</span>
                          </span>
                          <span className="text-gray-400 text-xs">
                            ₱{Number(rate).toLocaleString()}{isCottageShortTime ? '' : '/night'}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
                {cottages.some(c => (c.blocked_weekdays ?? []).length > 0) && (
                  <div className="text-[11px] text-gray-400 mt-2">Cottages closed on the selected check-in day are hidden from this list.</div>
                )}
              </>
            )}
          </div>

         {/*  <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Equipment Rental (optional, select multiple)</div>
            {equipment.length === 0 ? (
              <div className="text-xs text-gray-400">No available equipment right now.</div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {equipment.map(item => {
                  const sel = form.equipment_selections[item.id]
                  return (
                    <div key={item.id} className="border border-gray-100 rounded-lg p-2">
                      <label className="flex items-center justify-between gap-2 text-sm cursor-pointer">
                        <span className="flex items-center gap-2">
                          <input type="checkbox" checked={sel?.selected ?? false} onChange={() => toggleEquipment(item.id, item)} />
                          <span className="text-gray-700">{item.name}</span>
                        </span>
                        <span className="text-xs text-gray-400">
                          {item.hourly_rate ? `₱${item.hourly_rate}/hr` : `₱${item.daily_rate}/day`} · {item.available_qty} avail
                        </span>
                      </label>
                      {sel?.selected && (
                        <div className="flex items-center gap-2 mt-2 pl-6 flex-wrap">
                          <div>
                            <label className="block text-xs text-gray-400">Qty</label>
                            <input type="number" inputMode="numeric" min={1} max={item.available_qty} value={sel.quantity}
                              onChange={e => {
                                const v = e.target.value
                                updateEqField(item.id, 'quantity', v === '' ? '' : Math.max(0, parseInt(v) || 0))
                              }}
                              onBlur={() => updateEqField(item.id, 'quantity', (sel.quantity === '' || Number(sel.quantity) < 1) ? 1 : sel.quantity)}
                              className="w-14 px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white" />
                          </div>
                          {item.hourly_rate && item.daily_rate && (
                            <div>
                              <label className="block text-xs text-gray-400">Rate</label>
                              <select value={sel.rateType} onChange={e => updateEqField(item.id, 'rateType', e.target.value)}
                                className="px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white">
                                <option value="hourly">Hourly</option>
                                <option value="daily">Daily</option>
                              </select>
                            </div>
                          )}
                          <div>
                            <label className="block text-xs text-gray-400">{sel.rateType === 'hourly' ? 'Hours' : 'Days'}</label>
                            <input type="number" inputMode="numeric" min={1} value={sel.units}
                              onChange={e => {
                                const v = e.target.value
                                updateEqField(item.id, 'units', v === '' ? '' : Math.max(0, parseInt(v) || 0))
                              }}
                              onBlur={() => updateEqField(item.id, 'units', (sel.units === '' || Number(sel.units) < 1) ? 1 : sel.units)}
                              className="w-14 px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white" />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>*/}

          {/* Bill summary */}
          <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
            <div className="text-sm font-medium text-gray-700">Bill Summary</div>
            <div className="text-sm space-y-1 bg-gray-50 rounded-lg p-3">
              {roomLines.map(r => (
                <div key={r.id} className="flex justify-between text-gray-600">
                  <span>{r.label} {isShortTime ? `— ${DURATION_LABELS[durationType]}` : `× ${nights} night${nights > 1 ? 's' : ''}`}</span>
                  <span>₱{r.amount.toLocaleString()}</span>
                </div>
              ))}
              {selectedCottages.map(c => (
                <div key={c.id} className="flex justify-between text-gray-600">
                  <span>{c.name} × {nights} night{nights > 1 ? 's' : ''}</span>
                  <span>₱{((c.overnight_rate || c.day_rate) * nights).toLocaleString()}</span>
                </div>
              ))}
              {equipmentLines.map(l => (
                <div key={l.id} className="flex justify-between text-gray-600">
                  <span>{l.name} × {l.quantity} ({l.units} {l.rateType === 'hourly' ? 'hr' : 'day'})</span>
                  <span>₱{l.amount.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-200 pt-1 mt-1">
                <span>Total Bill</span><span>₱{totalBill.toLocaleString()}</span>
              </div>
              {bookingType === 'walkin' && discountType !== 'none' && (
                <>
                  <div className="flex justify-between text-blue-600">
                    <span>{WALKIN_DISCOUNT_LABELS[discountType]}</span>
                    <span>-₱{walkinDiscountAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-gray-800">
                    <span>Discounted Total</span><span>₱{finalTotalBill.toLocaleString()}</span>
                  </div>
                </>
              )}
              {bookingType === 'advance' && (
                <>
                  <div className="flex justify-between text-amber-600 font-medium">
                    <span>Reservation fee (50% of total bill)</span>
                    <span>₱{reservationFee.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-400 text-xs">
                    <span>Balance due on check-in</span>
                    <span>₱{(totalBill - reservationFee).toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>

            {bookingType === 'walkin' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Discount (Senior / PWD / Athlete-Coach — 20%)</label>
                <div className="flex gap-1.5 flex-wrap">
                  {([
                    ['none', 'None'],
                    ['senior', 'Senior'],
                    ['pwd', 'PWD'],
                    ['athlete', 'Athlete/Coach'],
                  ] as const).map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setDiscountType(val)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${discountType === val ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-gray-600 border-gray-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <PaymentCalculator
              totalDue={amountDueNow}
              method={payment.method}
              onMethodChange={m => setPayment(p => ({ ...p, method: m }))}
              amountTendered={payment.amountTendered}
              onAmountTenderedChange={a => setPayment(p => ({ ...p, amountTendered: a }))}
            />

            <button type="submit" disabled={
              loading ||
              (form.room_ids.length === 0 && form.cottage_ids.length === 0) ||
              (form.room_ids.length > 0 && selectedRoomsCapacity < totalPax) ||
              !isPaymentValid(payment.method, amountDueNow, payment.amountTendered) ||
              hasActiveShift === false
            }
              className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg">
              {hasActiveShift === false ? '🔒 Open a shift first'
                : loading ? 'Processing...'
                : bookingType === 'advance'
                ? `Confirm Booking & Collect Reservation Fee (₱${reservationFee.toLocaleString()})`
                : `Register Walk-in & Collect Full Payment (₱${finalTotalBill.toLocaleString()})`}
            </button>
          </div>
        </div>
        
      </form>

      {/* Existing Guest Confirmation Modal */}
      {existingGuestMatch && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-sm space-y-4 shadow-xl">
            <div className="text-sm font-semibold text-gray-800">⚠️ Phone Number Already Exists</div>
            <p className="text-sm text-gray-600">
              The phone number <strong>{form.phone}</strong> is already linked to:
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              <div className="font-semibold text-gray-800">{existingGuestMatch.full_name}</div>
              <div className="text-xs text-gray-500">{existingGuestMatch.phone}</div>
            </div>
            <p className="text-sm text-gray-600">Is this the same person, or a different guest?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setPendingSubmit(true)
                  setTimeout(() => {
                    const f = document.querySelector('form')
                    f?.requestSubmit()
                  }, 50)
                }}
                className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-lg font-medium"
              >
                ✓ Same Person — Use existing record
              </button>
              <button
                onClick={() => {
                  setExistingGuestMatch(null)
                  setPendingSubmit(false)
                  setForceNewGuest(true)
                  setTimeout(() => {
                    const f = document.querySelector('form')
                    f?.requestSubmit()
                  }, 50)
                }}
                className="w-full py-2.5 border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm rounded-lg"
              >
                + Different Person — Create new guest
              </button>
              <button
                onClick={() => { setExistingGuestMatch(null); setPendingSubmit(false); setForceNewGuest(false) }}
                className="text-xs text-gray-400 hover:text-gray-600 text-center"
              >
                Cancel — Go back and edit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
