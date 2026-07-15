'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { printReceipt } from './receipt'
import PaymentCalculator, { isPaymentValid, paymentValidationMessage } from './PaymentCalculator'
import { logActivity } from './activityLog'
import { createOrUpdateInvoice } from './invoiceUtils'

interface RoomOption {
  id: string; room_number: string
  room_type_id: string
  room_types_config: { name: string; base_rate: number; max_capacity: number } | null
}
interface CottageOption { id: string; name: string; cottage_code: string; day_rate: number; overnight_rate: number }
interface EquipmentOption { id: string; name: string; hourly_rate: number | null; daily_rate: number | null; available_qty: number }

export default function WalkInPage() {
  const supabase = createClient()
  const [allRooms, setAllRooms] = useState<RoomOption[]>([])  // all rooms, unfiltered
  const [rooms, setRooms]       = useState<RoomOption[]>([])  // rooms available for the selected dates
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [cottages, setCottages] = useState<CottageOption[]>([])
  const [equipment, setEquipment] = useState<EquipmentOption[]>([])
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState<any>(null)
  const [error, setError]       = useState('')

  const [bookingType, setBookingType] = useState<'walkin' | 'advance'>('walkin')

  const [form, setForm] = useState({
    full_name: '', phone: '', email: '',
    num_adults: 1, num_children: 0,
    room_ids: [] as string[],           // ← multiple rooms now
    cottage_ids: [] as string[],
    check_in_date:  new Date().toISOString().slice(0, 10),
    check_out_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    special_requests: '',
    equipment_selections: {} as Record<string, { selected: boolean; quantity: number; rateType: 'hourly' | 'daily'; units: number }>,
  })

  const [payment, setPayment] = useState({ method: 'cash', amountTendered: 0 })

  async function loadData() {
    const [{ data: roomData }, { data: cottageData }, { data: eqData }] = await Promise.all([
      // Fetch ALL rooms (not filtered by status) — availability for the
      // selected dates is computed separately via checkRoomAvailability,
      // since a room being "occupied" for one date range doesn't mean
      // it's unavailable for a completely different, non-overlapping range.
      supabase.from('rooms').select('id, room_number, room_type_id, status, room_types_config(name, base_rate, max_capacity)').order('room_number'),
      supabase.from('cottages').select('id, name, cottage_code, day_rate, overnight_rate').eq('status', 'available').order('cottage_code'),
      supabase.from('equipment').select('id, name, hourly_rate, daily_rate, available_qty').eq('is_active', true).gt('available_qty', 0).order('name'),
    ])
    setAllRooms((roomData as any) ?? [])
    setCottages(cottageData ?? [])
    setEquipment(eqData ?? [])
  }

  useEffect(() => { loadData() }, [])

  // Re-check room availability whenever check-in/check-out dates change
  useEffect(() => {
    checkRoomAvailability()
  }, [form.check_in_date, form.check_out_date, allRooms])

  async function checkRoomAvailability() {
    if (allRooms.length === 0 || !form.check_in_date || !form.check_out_date) return
    if (form.check_in_date >= form.check_out_date) { setRooms([]); return }

    setCheckingAvailability(true)

    // Find bookings that OVERLAP with the requested date range.
    // Overlap condition: existing.check_in < new.check_out AND existing.check_out > new.check_in
    const { data: overlappingBookings } = await supabase
      .from('bookings')
      .select('room_id')
      .in('status', ['reserved', 'checked_in', 'confirmed', 'pending'])
      .not('room_id', 'is', null)
      .lt('check_in_date', form.check_out_date)
      .gt('check_out_date', form.check_in_date)

    const bookedRoomIds = new Set((overlappingBookings ?? []).map(b => b.room_id))

    // A room is available for these dates if it's not in maintenance/out_of_order
    // AND has no overlapping booking in this date range.
    const availableForDates = allRooms.filter(r =>
      !bookedRoomIds.has(r.id) &&
      (r as any).status !== 'maintenance' &&
      (r as any).status !== 'out_of_order'
    )

    setRooms(availableForDates)

    // Deselect any previously-selected rooms that are no longer available
    setForm(p => ({ ...p, room_ids: p.room_ids.filter(id => availableForDates.some(r => r.id === id)) }))

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
  const selectedRooms = rooms.filter(r => form.room_ids.includes(r.id))
  const nights = Math.max(1, Math.ceil(
    (new Date(form.check_out_date).getTime() - new Date(form.check_in_date).getTime()) / 86400000
  ))

  // Per-room subtotal (each room may have a different rate)
  const roomLines = selectedRooms.map(r => ({
    id: r.id,
    label: `Room ${r.room_number} — ${r.room_types_config?.name}`,
    rate: r.room_types_config?.base_rate ?? 0,
    amount: (r.room_types_config?.base_rate ?? 0) * nights,
  }))
  const roomsSubtotal = roomLines.reduce((s, l) => s + l.amount, 0)

  const selectedCottages = cottages.filter(c => form.cottage_ids.includes(c.id))
  const cottageFee = selectedCottages.reduce((sum, c) => sum + Number(c.overnight_rate || c.day_rate), 0) * nights

  const equipmentLines = Object.entries(form.equipment_selections)
    .filter(([, s]) => s.selected)
    .map(([id, s]) => {
      const item = equipment.find(e => e.id === id)
      if (!item) return null
      const r = s.rateType === 'hourly' ? item.hourly_rate ?? 0 : item.daily_rate ?? 0
      return { id, name: item.name, quantity: s.quantity, units: s.units, rateType: s.rateType, amount: r * s.quantity * s.units }
    }).filter(Boolean) as { id: string; name: string; quantity: number; units: number; rateType: string; amount: number }[]

  const equipmentFee = equipmentLines.reduce((s, l) => s + l.amount, 0)

  // Reservation fee = 50% of FIRST night rate of the FIRST room only (matches existing policy)
  const primaryRoomRate = roomLines[0]?.rate ?? 0
  const reservationFee  = bookingType === 'advance' ? Math.ceil(primaryRoomRate * 0.5) : 0

  const totalBill    = roomsSubtotal + cottageFee + equipmentFee
  const amountDueNow  = bookingType === 'advance' ? reservationFee : totalBill

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name)  { setError('Guest name is required.'); return }
    if (form.room_ids.length === 0) { setError('Please select at least one room.'); return }

    setLoading(true)
    setError('')

    const paymentError = paymentValidationMessage(payment.method, amountDueNow, payment.amountTendered)
    if (paymentError) { setError(paymentError); setLoading(false); return }

    // Re-verify room availability right before submitting — closes most of
    // the race-condition window (though the DB constraint is the real
    // guarantee against two simultaneous submissions).
    const { data: freshOverlaps } = await supabase
      .from('bookings')
      .select('room_id')
      .in('status', ['reserved', 'checked_in', 'confirmed', 'pending'])
      .in('room_id', form.room_ids)
      .lt('check_in_date', form.check_out_date)
      .gt('check_out_date', form.check_in_date)

    if (freshOverlaps && freshOverlaps.length > 0) {
      const conflictingIds = new Set(freshOverlaps.map(b => b.room_id))
      const conflictingRooms = selectedRooms.filter(r => conflictingIds.has(r.id)).map(r => `Room ${r.room_number}`)
      setError(`${conflictingRooms.join(', ')} ${conflictingRooms.length > 1 ? 'were' : 'was'} just booked by someone else. Please reselect.`)
      setLoading(false)
      checkRoomAvailability()
      return
    }

    try {
      // 1. Upsert guest
      const { data: existingGuest } = await supabase.from('guests')
        .select('id').eq('phone', form.phone || '__none__').maybeSingle()

      let guestId: string
      if (existingGuest) {
        guestId = existingGuest.id
      } else {
        const guestCode = `G-${Date.now().toString().slice(-6)}`
        const { data: newGuest, error: guestError } = await supabase.from('guests')
          .insert({ full_name: form.full_name, phone: form.phone || null, email: form.email || null, guest_code: guestCode })
          .select('id').single()
        if (guestError) throw guestError
        guestId = newGuest.id
      }

      const wristband = `WB-${Date.now().toString().slice(-6)}`
      const groupNumber = `GRP-${Date.now().toString().slice(-8)}`  // ties multiple room bookings together

      // 2. Create ONE booking per room, all sharing the same guest/dates/group
      const createdBookings: any[] = []
      for (let i = 0; i < roomLines.length; i++) {
        const rl = roomLines[i]
        const isPrimary = i === 0

        const { data: booking, error: bookingError } = await supabase.from('bookings').insert({
          guest_id: guestId,
          room_id: rl.id,
          booking_type: bookingType === 'advance' ? 'online' : 'walk_in',
          accommodation_type: 'room',
          num_adults: form.num_adults,
          num_children: form.num_children,
          check_in_date: form.check_in_date,
          check_out_date: form.check_out_date,
          subtotal: rl.amount,
          // Cottages + equipment fees are attributed to the PRIMARY (first) booking only,
          // to avoid double counting across multiple room records.
          extras_total: isPrimary ? (cottageFee + equipmentFee) : 0,
          total_amount: isPrimary ? (rl.amount + cottageFee + equipmentFee) : rl.amount,
          amount_paid: 0,  // set after we know the split, below
          payment_status: 'unpaid',
          status: bookingType === 'advance' ? 'reserved' : 'checked_in',
          wristband_number: wristband,
          special_requests: [
            form.special_requests || null,
            roomLines.length > 1 ? `Group booking: ${groupNumber} (${roomLines.length} rooms)` : null,
          ].filter(Boolean).join(' | ') || null,
        }).select().single()

        if (bookingError) throw bookingError
        createdBookings.push({ ...booking, roomLabel: rl.label, roomAmount: rl.amount })

        // Mark room occupied (walk-in only; advance stays reserved until check-in)
        if (bookingType === 'walkin') {
          await supabase.from('rooms').update({ status: 'occupied' }).eq('id', rl.id)
        }
      }

      const primaryBooking = createdBookings[0]

      // 3. Apply payment — split proportionally across all room bookings so
      // each booking's amount_paid reflects its fair share of what's due now.
      const primaryBookingTotal = Number(primaryBooking.total_amount)
      const allBookingsGrandTotal = createdBookings.reduce((s, b) => s + Number(b.total_amount), 0)

      for (const b of createdBookings) {
        const share = allBookingsGrandTotal > 0
          ? Math.round((Number(b.total_amount) / allBookingsGrandTotal) * amountDueNow)
          : 0
        const newStatus = share >= Number(b.total_amount) ? 'paid' : (share > 0 ? 'partial' : 'unpaid')
        await supabase.from('bookings').update({
          amount_paid: share,
          payment_status: newStatus,
        }).eq('id', b.id)
      }

      // 4. Cottages — attributed to primary booking
      for (const c of selectedCottages) {
        await supabase.from('cottages').update({ status: bookingType === 'walkin' ? 'occupied' : 'reserved' }).eq('id', c.id)
        await supabase.from('booking_addons').insert({ booking_id: primaryBooking.id, name: `Cottage — ${c.name}`, quantity: nights, unit_price: c.overnight_rate || c.day_rate })
      }

      // Store cottage IDs on the primary booking so checkout can trigger
      // housekeeping cleanup for them (same pattern used for day use bookings)
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
          rental_number: `RNT-${Date.now()}-${line.id.slice(0, 4)}`,
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

      // 6. Single transaction for the whole payment
      await supabase.from('transactions').insert({
        txn_number: `TXN-${Date.now()}`,
        booking_id: primaryBooking.id,
        guest_id: guestId,
        txn_type: bookingType === 'advance' ? 'reservation_fee' : 'room',
        description: bookingType === 'advance'
          ? `Reservation fee (50% of 1st room, 1st night) — ${roomLines.length} room(s), ${primaryBooking.booking_number}${roomLines.length > 1 ? ` +${roomLines.length - 1} more` : ''}`
          : `Walk-in payment — ${roomLines.length} room(s), ${primaryBooking.booking_number}${roomLines.length > 1 ? ` +${roomLines.length - 1} more` : ''}`,
        amount: amountDueNow,
        payment_method: payment.method,
      })

      await logActivity(supabase, {
        action: bookingType === 'advance' ? 'ADVANCE_BOOKING' : 'WALK_IN',
        details: `${form.full_name} — ${roomLines.length} room(s) [${roomLines.map(r => r.label).join(', ')}], ₱${amountDueNow.toLocaleString()} ${payment.method}`,
        table_name: 'bookings',
        record_id: primaryBooking.id,
      })

      // 7. Invoice for billing module — one invoice covering the whole group
      await createOrUpdateInvoice(supabase, {
        booking_id: primaryBooking.id,
        guest_id: guestId,
        subtotal: roomsSubtotal,
        total: totalBill,
        amount_paid: amountDueNow,
        notes: roomLines.length > 1
          ? `Group booking ${groupNumber}: ${roomLines.map(r => r.label).join(', ')}`
          : (bookingType === 'advance' ? 'Reservation fee collected. Balance due on check-in.' : null),
      })

      // 8. Print single itemized receipt covering all rooms
      const lineItems: any[] = roomLines.map(r => ({ label: `${r.label} × ${nights} night(s)`, amount: r.amount }))
      selectedCottages.forEach(c => lineItems.push({ label: `${c.name} × ${nights} night(s)`, amount: (c.overnight_rate || c.day_rate) * nights }))
      equipmentLines.forEach(l => lineItems.push({ label: `${l.name} × ${l.quantity} (${l.units} ${l.rateType === 'hourly' ? 'hr' : 'day'})`, amount: l.amount }))

      printReceipt({
        title: 'AquaVerde Beach Resort',
        receiptNumber: roomLines.length > 1 ? groupNumber : primaryBooking.booking_number,
        receiptType: bookingType === 'advance' ? 'Reservation Receipt' : 'Walk-in Receipt',
        date: new Date().toLocaleDateString('en-PH', { dateStyle: 'medium' }),
        guestName: form.full_name,
        guestContact: form.phone || form.email || undefined,
        lineItems,
        total: totalBill,
        amountPaid: amountDueNow,
        balance: totalBill - amountDueNow,
        paymentMethod: payment.method,
        footerNote: bookingType === 'advance'
          ? `Reservation fee paid. Balance of ₱${(totalBill - amountDueNow).toLocaleString()} due on check-in. Wristband: ${wristband}`
          : `Thank you! Wristband: ${wristband}${roomLines.length > 1 ? ` · ${roomLines.length} rooms booked` : ''}`,
      })

      setSuccess({
        bookingNumbers: createdBookings.map(b => b.booking_number),
        wristband, guestName: form.full_name, amountDueNow, totalBill, roomCount: roomLines.length,
      })
      setForm({
        full_name: '', phone: '', email: '', num_adults: 1, num_children: 0,
        room_ids: [], cottage_ids: [],
        check_in_date: new Date().toISOString().slice(0, 10),
        check_out_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        special_requests: '', equipment_selections: {},
      })
      setPayment({ method: 'cash', amountTendered: 0 })
      loadData()

    } catch (err: any) {
      // Detect the DB-level double-booking rejection specifically and show
      // a clear message instead of the raw Postgres constraint error text.
      const isDoubleBookingError = err.message?.includes('no_overlapping_room_bookings')
        || err.message?.includes('exclusion constraint')
        || err.code === '23P01'

      setError(
        isDoubleBookingError
          ? 'One of the selected rooms was just booked by someone else for overlapping dates. Please refresh and pick another room.'
          : (err.message || 'Something went wrong. Please try again.')
      )

      // Refresh availability so the conflicting room disappears from the list
      if (isDoubleBookingError) checkRoomAvailability()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl">
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
        <button type="button" onClick={() => setBookingType('walkin')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${bookingType === 'walkin' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Walk-in (today)
        </button>
        <button type="button" onClick={() => setBookingType('advance')}
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
                <input type="number" min={1} value={form.num_adults} onChange={e => setForm(p => ({ ...p, num_adults: parseInt(e.target.value) || 1 }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Children</label>
                <input type="number" min={0} value={form.num_children} onChange={e => setForm(p => ({ ...p, num_children: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
            <div className="text-sm font-medium text-gray-700">Dates</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Check-in</label>
                <input type="date" value={form.check_in_date} onChange={e => setForm(p => ({ ...p, check_in_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Check-out</label>
                <input type="date" value={form.check_out_date} onChange={e => setForm(p => ({ ...p, check_out_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Special Requests</label>
              <input value={form.special_requests} onChange={e => setForm(p => ({ ...p, special_requests: e.target.value }))}
                placeholder="e.g. Extra pillows, adjacent rooms"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
          </div>

          {/* Multiple room selection — mixed types allowed, filtered by date availability */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">
              Select Room(s) <span className="text-xs text-gray-400 font-normal">— select multiple, any type</span>
            </div>
            {checkingAvailability ? (
              <div className="text-xs text-gray-400 py-3 text-center">Checking availability for selected dates...</div>
            ) : rooms.length === 0 ? (
              <div className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
                No rooms available for {form.check_in_date} to {form.check_out_date}. Try different dates.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {rooms.map(r => (
                  <label key={r.id} className="flex items-center justify-between gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-1 py-1">
                    <span className="flex items-center gap-2">
                      <input type="checkbox" checked={form.room_ids.includes(r.id)} onChange={() => toggleRoom(r.id)} />
                      <span className="text-gray-700">Room {r.room_number}</span>
                      <span className="text-xs text-gray-400">— {r.room_types_config?.name}</span>
                    </span>
                    <span className="text-gray-400 text-xs">₱{Number(r.room_types_config?.base_rate ?? 0).toLocaleString()}/night</span>
                  </label>
                ))}
              </div>
            )}
            {form.room_ids.length > 1 && (
              <div className="mt-2 text-xs text-blue-600 bg-blue-50 rounded-lg px-2 py-1.5">
                {form.room_ids.length} rooms selected — will be booked together under one guest.
              </div>
            )}
          </div>
        </div>

        {/* Right column: cottages + equipment + summary */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Add Cottages (optional, select multiple)</div>
            {cottages.length === 0 ? (
              <div className="text-xs text-gray-400">No available cottages right now.</div>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {cottages.map(c => (
                  <label key={c.id} className="flex items-center justify-between gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                    <span className="flex items-center gap-2">
                      <input type="checkbox" checked={form.cottage_ids.includes(c.id)} onChange={() => toggleCottage(c.id)} />
                      <span className="text-gray-700">{c.name}</span>
                      <span className="text-xs text-gray-400">({c.cottage_code})</span>
                    </span>
                    <span className="text-gray-400 text-xs">₱{Number(c.overnight_rate || c.day_rate).toLocaleString()}/night</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-4">
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
                            <input type="number" min={1} max={item.available_qty} value={sel.quantity}
                              onChange={e => updateEqField(item.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
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
                            <input type="number" min={1} value={sel.units}
                              onChange={e => updateEqField(item.id, 'units', Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-14 px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white" />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Bill summary */}
          <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
            <div className="text-sm font-medium text-gray-700">Bill Summary</div>
            <div className="text-sm space-y-1 bg-gray-50 rounded-lg p-3">
              {roomLines.map(r => (
                <div key={r.id} className="flex justify-between text-gray-600">
                  <span>{r.label} × {nights} night{nights > 1 ? 's' : ''}</span>
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
              {bookingType === 'advance' && (
                <>
                  <div className="flex justify-between text-amber-600 font-medium">
                    <span>Reservation Fee (50% of 1st room's 1st night)</span>
                    <span>₱{reservationFee.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-400 text-xs">
                    <span>Balance due on check-in</span>
                    <span>₱{(totalBill - reservationFee).toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>

            <PaymentCalculator
              totalDue={amountDueNow}
              method={payment.method}
              onMethodChange={m => setPayment(p => ({ ...p, method: m }))}
              amountTendered={payment.amountTendered}
              onAmountTenderedChange={a => setPayment(p => ({ ...p, amountTendered: a }))}
            />

            <button type="submit" disabled={loading || !isPaymentValid(payment.method, amountDueNow, payment.amountTendered)}
              className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg">
              {loading ? 'Processing...' : bookingType === 'advance'
                ? `Confirm Booking & Collect Reservation Fee (₱${reservationFee.toLocaleString()})`
                : `Register Walk-in & Collect Full Payment (₱${totalBill.toLocaleString()})`}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
