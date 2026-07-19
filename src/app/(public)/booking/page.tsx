'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface RoomType {
  id: string; name: string; base_rate: number; max_capacity: number
  type: string; description: string | null
}
interface RoomOption {
  id: string; room_number: string; room_type_id: string
  room_types_config: { name: string; base_rate: number; max_capacity: number } | null
}

export default function BookingPage() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [allRooms, setAllRooms] = useState<RoomOption[]>([])
  const [rooms, setRooms]       = useState<RoomOption[]>([])   // date-available rooms
  const [checkingAvail, setCheckingAvail] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [step, setStep]         = useState<1 | 2 | 3 | 4>(1)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofPreview, setProofPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const today    = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  const [form, setForm] = useState({
    check_in_date: today,
    check_out_date: tomorrow,
    num_adults: 2,
    num_children: 0,
    room_ids: [] as string[],
    full_name: '', email: '', phone: '', special_requests: '',
    payment_method: 'gcash' as 'gcash' | 'bank_transfer',
    payment_reference: '',
  })

  const totalPax = form.num_adults + form.num_children
  const selectedRooms = rooms.filter(r => form.room_ids.includes(r.id))
  const selectedRoomsCapacity = selectedRooms.reduce((s, r) => s + (r.room_types_config?.max_capacity ?? 0), 0)
  const roomsFittingAlone = rooms.filter(r => (r.room_types_config?.max_capacity ?? 0) >= totalPax)

  const nights = Math.max(1, Math.ceil(
    (new Date(form.check_out_date).getTime() - new Date(form.check_in_date).getTime()) / 86400000
  ))

  const roomLines = selectedRooms.map(r => ({
    id: r.id,
    label: `${r.room_types_config?.name} (Room ${r.room_number})`,
    rate: r.room_types_config?.base_rate ?? 0,
    amount: (r.room_types_config?.base_rate ?? 0) * nights,
  }))
  const subtotal = roomLines.reduce((s, l) => s + l.amount, 0)
  const primaryRoomRate = roomLines[0]?.rate ?? 0
  const reservationFee  = Math.ceil(primaryRoomRate * 0.5)

  useEffect(() => {
    Promise.all([
      supabase.from('room_types_config').select('*').eq('is_active', true).order('base_rate'),
      supabase.from('rooms').select('id, room_number, room_type_id, room_types_config(name, base_rate, max_capacity)').order('room_number'),
    ]).then(([{ data: types }, { data: roomData }]) => {
      setRoomTypes(types ?? [])
      setAllRooms((roomData as any) ?? [])
    })
  }, [])

  // Re-check availability whenever dates change (once we have rooms loaded)
  useEffect(() => {
    if (step === 1) checkRoomAvailability()
  }, [form.check_in_date, form.check_out_date, allRooms])

  async function checkRoomAvailability() {
    if (allRooms.length === 0 || !form.check_in_date || !form.check_out_date) return
    if (form.check_in_date >= form.check_out_date) { setRooms([]); return }

    setCheckingAvail(true)

    // NOTE: only valid booking_status enum values here — pending, confirmed,
    // checked_in are the "active/blocking" statuses. ('reserved' is NOT a
    // valid enum value and must never appear in this filter.)
    const { data: overlappingBookings } = await supabase
      .from('bookings')
      .select('room_id')
      .in('status', ['pending', 'confirmed', 'checked_in'])
      .not('room_id', 'is', null)
      .lt('check_in_date', form.check_out_date)
      .gt('check_out_date', form.check_in_date)

    const bookedRoomIds = new Set((overlappingBookings ?? []).map(b => b.room_id))
    const availableForDates = allRooms.filter(r => !bookedRoomIds.has(r.id))

    setRooms(availableForDates)
    setForm(p => ({ ...p, room_ids: p.room_ids.filter(id => availableForDates.some(r => r.id === id)) }))
    setCheckingAvail(false)
  }

  function toggleRoom(id: string) {
    setForm(p => ({
      ...p,
      room_ids: p.room_ids.includes(id) ? p.room_ids.filter(r => r !== id) : [...p.room_ids, id],
    }))
  }

  function goToStep2() {
    setError('')
    if (form.room_ids.length === 0) { setError('Please select at least one room.'); return }
    if (selectedRoomsCapacity < totalPax) {
      setError(`Selected room(s) only fit ${selectedRoomsCapacity} guest(s) — you need room for ${totalPax}. Please select more rooms.`)
      return
    }
    setStep(2)
  }

  async function submitBooking() {
    if (!form.full_name) { setError('Please enter your full name.'); return }
    if (!form.email && !form.phone) { setError('Please provide an email or phone number.'); return }
    if (!proofFile) { setError('Please upload your proof of payment.'); return }
    if (!form.payment_reference) { setError('Please enter your payment reference number.'); return }

    setLoading(true)
    setError('')

    try {
      // Re-verify availability right before submitting
      const { data: freshOverlaps } = await supabase
        .from('bookings')
        .select('room_id')
        .in('status', ['pending', 'confirmed', 'checked_in'])
        .in('room_id', form.room_ids)
        .lt('check_in_date', form.check_out_date)
        .gt('check_out_date', form.check_in_date)

      if (freshOverlaps && freshOverlaps.length > 0) {
        setError('One of your selected rooms was just booked by someone else. Please go back and reselect.')
        setLoading(false)
        checkRoomAvailability()
        return
      }

      // Upload proof of payment to storage
      setUploading(true)
      const fileExt = proofFile.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(fileName, proofFile)

      if (uploadError) throw new Error('Failed to upload payment proof: ' + uploadError.message)

      const { data: urlData } = supabase.storage.from('payment-proofs').getPublicUrl(fileName)
      const proofUrl = urlData.publicUrl
      setUploading(false)

      const guestCode = `G-${Date.now().toString().slice(-6)}`
      const { data: guest, error: guestError } = await supabase
        .from('guests')
        .insert({ full_name: form.full_name, email: form.email || null, phone: form.phone || null, guest_code: guestCode })
        .select('id').single()
      if (guestError) throw guestError

      const groupNumber = `GRP-${Date.now().toString().slice(-8)}`
      const createdBookings: any[] = []

      for (let i = 0; i < roomLines.length; i++) {
        const rl = roomLines[i]
        const isPrimary = i === 0

        const { data: booking, error: bookingError } = await supabase
          .from('bookings')
          .insert({
            guest_id: guest.id,
            room_id: rl.id,
            booking_type: 'online',
            accommodation_type: 'room',
            num_adults: isPrimary ? form.num_adults : 0,
            num_children: isPrimary ? form.num_children : 0,
            group_number: roomLines.length > 1 ? groupNumber : null,
            is_group_primary: isPrimary,
            check_in_date: form.check_in_date,
            check_out_date: form.check_out_date,
            subtotal: rl.amount,
            total_amount: isPrimary ? subtotal : rl.amount,
            amount_paid: 0,  // not credited until admin verifies the proof
            payment_status: 'unpaid',
            status: 'pending',  // admin verifies proof, then confirms
            payment_proof_url: isPrimary ? proofUrl : null,
            payment_reference: isPrimary ? form.payment_reference : null,
            payment_method_used: isPrimary ? form.payment_method : null,
            payment_submitted_at: isPrimary ? new Date().toISOString() : null,
            special_requests: [
              form.special_requests || null,
              roomLines.length > 1 ? `Group booking: ${groupNumber} (${roomLines.length} rooms, ${totalPax} total guests)` : null,
            ].filter(Boolean).join(' | ') || null,
          })
          .select().single()

        if (bookingError) throw bookingError
        createdBookings.push(booking)
      }

      router.push(`/booking/confirmation/${createdBookings[0].id}${roomLines.length > 1 ? `?group=${groupNumber}&count=${roomLines.length}` : ''}`)

    } catch (err: any) {
      const isDoubleBooking = err.message?.includes('no_overlapping_room_bookings') || err.code === '23P01'
      setError(isDoubleBooking
        ? 'One of your selected rooms was just booked by someone else. Please go back and reselect.'
        : (err.message || 'Something went wrong. Please try again.'))
      setLoading(false)
      setUploading(false)
    }
  }

  return (
    <>
      <section className="bg-gradient-to-br from-blue-900 to-teal-700 text-white py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-3">Book Your Stay</h1>
          <p className="text-blue-100">Reserve now, pay the 50% reservation fee on arrival. Easy and hassle-free.</p>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="max-w-2xl mx-auto px-4">

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-10">
            {[
              { n: 1, label: 'Rooms & Dates' },
              { n: 2, label: 'Your Details' },
              { n: 3, label: 'Review' },
              { n: 4, label: 'Pay Deposit' },
            ].map((s, i) => (
              <div key={s.n} className="flex items-center gap-2 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
                  step >= s.n ? 'bg-blue-700 text-white' : 'bg-gray-200 text-gray-500'
                }`}>{s.n}</div>
                <span className={`text-xs hidden sm:block ${step >= s.n ? 'text-blue-700 font-medium' : 'text-gray-400'}`}>{s.label}</span>
                {i < 3 && <div className={`flex-1 h-0.5 ${step > s.n ? 'bg-blue-700' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{error}</div>
          )}

          {/* Step 1: Guests, Dates & Rooms */}
          {step === 1 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
              <h2 className="text-lg font-semibold text-gray-800">Guests & Dates</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Adults</label>
                  <input type="number" min={1} max={20} value={form.num_adults}
                    onChange={e => setForm(p => ({ ...p, num_adults: parseInt(e.target.value) || 1 }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Children</label>
                  <input type="number" min={0} max={20} value={form.num_children}
                    onChange={e => setForm(p => ({ ...p, num_children: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Check-in Date</label>
                  <input type="date" value={form.check_in_date} min={today}
                    onChange={e => setForm(p => ({ ...p, check_in_date: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Check-out Date</label>
                  <input type="date" value={form.check_out_date} min={form.check_in_date}
                    onChange={e => setForm(p => ({ ...p, check_out_date: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Room(s) <span className="text-xs text-gray-400 font-normal">— select multiple if needed for your group</span>
                </label>

                {checkingAvail ? (
                  <div className="text-sm text-gray-400 py-4 text-center">Checking availability...</div>
                ) : rooms.length === 0 ? (
                  <div className="text-sm text-amber-600 bg-amber-50 rounded-xl p-4">
                    No rooms available for these dates. Please try different dates.
                  </div>
                ) : (
                  <>
                    {roomsFittingAlone.length === 0 && (
                      <div className="text-xs text-blue-600 bg-blue-50 rounded-lg p-2.5 mb-2">
                        No single room fits {totalPax} guest(s) — select multiple rooms below to combine capacity.
                      </div>
                    )}
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {rooms.map(r => {
                        const cap = r.room_types_config?.max_capacity ?? 0
                        const tooSmallAlone = cap < totalPax && form.room_ids.length === 0
                        const checked = form.room_ids.includes(r.id)
                        return (
                          <label key={r.id} className={`flex items-center gap-4 border-2 rounded-xl p-4 cursor-pointer transition-colors ${
                            checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                          } ${tooSmallAlone ? 'opacity-50' : ''}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleRoom(r.id)} className="sr-only" />
                            <div className="flex-1">
                              <div className="font-medium text-gray-800">{r.room_types_config?.name}</div>
                              <div className="text-sm text-gray-500">Room {r.room_number} · up to {cap} guests</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-blue-700">₱{Number(r.room_types_config?.base_rate ?? 0).toLocaleString()}</div>
                              <div className="text-xs text-gray-400">per night</div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </>
                )}

                {form.room_ids.length > 0 && (
                  <div className={`mt-2 text-xs rounded-lg px-3 py-2 ${
                    selectedRoomsCapacity >= totalPax ? 'text-blue-600 bg-blue-50' : 'text-red-600 bg-red-50'
                  }`}>
                    {form.room_ids.length} room(s) selected — fits {selectedRoomsCapacity} guest(s)
                    {selectedRoomsCapacity < totalPax && ` — short by ${totalPax - selectedRoomsCapacity}, select more rooms`}
                  </div>
                )}
              </div>

              {roomLines.length > 0 && (
                <div className="bg-blue-50 rounded-xl p-4 text-sm">
                  {roomLines.map(rl => (
                    <div key={rl.id} className="flex justify-between text-gray-600 mb-1">
                      <span>{rl.label} × {nights} night{nights > 1 ? 's' : ''}</span>
                      <span>₱{rl.amount.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-semibold text-blue-700 border-t border-blue-200 pt-1.5 mt-1.5">
                    <span>Reservation fee (50% of 1st room, 1st night)</span>
                    <span>₱{reservationFee.toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Balance of ₱{(subtotal - reservationFee).toLocaleString()} due on arrival.</div>
                </div>
              )}

              <button onClick={goToStep2} disabled={form.room_ids.length === 0 || selectedRoomsCapacity < totalPax}
                className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white py-3.5 rounded-xl font-semibold transition-colors">
                Continue →
              </button>
            </div>
          )}

          {/* Step 2: Guest Details */}
          {step === 2 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(1)} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
                <h2 className="text-lg font-semibold text-gray-800">Your Details</h2>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700">
                ✓ {form.room_ids.length} room{form.room_ids.length > 1 ? 's' : ''} selected, fits {selectedRoomsCapacity} guests
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
                <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                  placeholder="Juan Dela Cruz"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="you@email.com"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
                <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="+63 9XX XXX XXXX"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white" />
                <p className="text-xs text-gray-400 mt-1">Please provide at least one contact method.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Special Requests (optional)</label>
                <textarea value={form.special_requests} onChange={e => setForm(p => ({ ...p, special_requests: e.target.value }))}
                  rows={3} placeholder="e.g. Extra pillows, early check-in, adjacent rooms..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white resize-none" />
              </div>

              <button onClick={() => { if (!form.full_name || (!form.email && !form.phone)) { setError('Please fill in required fields.'); return }; setError(''); setStep(3) }}
                className="w-full bg-blue-700 hover:bg-blue-800 text-white py-3.5 rounded-xl font-semibold transition-colors">
                Review Booking →
              </button>
            </div>
          )}

          {/* Step 3: Review & Confirm */}
          {step === 3 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(2)} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
                <h2 className="text-lg font-semibold text-gray-800">Review Your Booking</h2>
              </div>

              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Booking Summary</div>
                <div className="p-4 space-y-3 text-sm">
                  {roomLines.map(rl => (
                    <div key={rl.id} className="flex justify-between"><span className="text-gray-500">{rl.label}</span><span className="font-medium">₱{rl.amount.toLocaleString()}</span></div>
                  ))}
                  <div className="flex justify-between"><span className="text-gray-500">Check-in</span><span className="font-medium">{new Date(form.check_in_date).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Check-out</span><span className="font-medium">{new Date(form.check_out_date).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Duration</span><span className="font-medium">{nights} night{nights > 1 ? 's' : ''}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Guests</span><span className="font-medium">{form.num_adults} adult{form.num_adults > 1 ? 's' : ''}{form.num_children > 0 ? `, ${form.num_children} child${form.num_children > 1 ? 'ren' : ''}` : ''}</span></div>
                </div>
                <div className="border-t border-gray-100 px-4 py-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Total Bill</span><span>₱{subtotal.toLocaleString()}</span></div>
                  <div className="flex justify-between font-semibold text-blue-700"><span>Reservation Fee (pay on arrival)</span><span>₱{reservationFee.toLocaleString()}</span></div>
                  <div className="flex justify-between text-gray-400 text-xs"><span>Balance on check-in</span><span>₱{(subtotal - reservationFee).toLocaleString()}</span></div>
                </div>
              </div>

              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Guest Details</div>
                <div className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-medium">{form.full_name}</span></div>
                  {form.email && <div className="flex justify-between"><span className="text-gray-500">Email</span><span>{form.email}</span></div>}
                  {form.phone && <div className="flex justify-between"><span className="text-gray-500">Phone</span><span>{form.phone}</span></div>}
                  {form.special_requests && <div className="flex justify-between gap-4"><span className="text-gray-500 flex-shrink-0">Requests</span><span className="text-right">{form.special_requests}</span></div>}
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
                <strong>Next step:</strong> You'll pay the ₱{reservationFee.toLocaleString()} reservation fee via GCash or bank transfer, then upload your proof of payment. Your booking is confirmed once we verify the payment.
              </div>

              <button onClick={() => setStep(4)}
                className="w-full bg-blue-700 hover:bg-blue-800 text-white py-4 rounded-xl font-semibold text-lg transition-colors">
                Continue to Payment →
              </button>
            </div>
          )}

          {/* Step 4: Pay deposit & upload proof */}
          {step === 4 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(3)} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
                <h2 className="text-lg font-semibold text-gray-800">Pay Reservation Fee</h2>
              </div>

              <div className="bg-blue-50 rounded-xl p-4 text-center">
                <div className="text-xs text-blue-500 mb-1">Amount to Pay</div>
                <div className="text-3xl font-bold text-blue-700">₱{reservationFee.toLocaleString()}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setForm(p => ({ ...p, payment_method: 'gcash' }))}
                    className={`p-4 rounded-xl border-2 text-sm font-medium transition-colors ${
                      form.payment_method === 'gcash' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}>
                    📱 GCash
                  </button>
                  <button type="button" onClick={() => setForm(p => ({ ...p, payment_method: 'bank_transfer' }))}
                    className={`p-4 rounded-xl border-2 text-sm font-medium transition-colors ${
                      form.payment_method === 'bank_transfer' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}>
                    🏦 Bank Transfer
                  </button>
                </div>
              </div>

              {form.payment_method === 'gcash' ? (
                <div className="bg-gray-50 rounded-xl p-4 text-sm">
                  <div className="font-medium text-gray-700 mb-1">Send payment to:</div>
                  <div className="text-gray-600">GCash: <strong>0912 345 6789</strong></div>
                  <div className="text-gray-600">Account Name: <strong>AquaVerde Beach Resort</strong></div>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-4 text-sm">
                  <div className="font-medium text-gray-700 mb-1">Bank Transfer Details:</div>
                  <div className="text-gray-600">Bank: <strong>BDO</strong></div>
                  <div className="text-gray-600">Account Name: <strong>AquaVerde Beach Resort</strong></div>
                  <div className="text-gray-600">Account Number: <strong>1234-5678-9012</strong></div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Reference Number *</label>
                <input value={form.payment_reference} onChange={e => setForm(p => ({ ...p, payment_reference: e.target.value }))}
                  placeholder="e.g. GCash reference number"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Upload Proof of Payment *</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setProofFile(file)
                      setProofPreview(URL.createObjectURL(file))
                    }
                  }}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white"
                />
                {proofPreview && (
                  <img src={proofPreview} alt="Payment proof preview" className="mt-3 rounded-xl max-h-64 mx-auto border border-gray-200" />
                )}
                <p className="text-xs text-gray-400 mt-1">Screenshot of your GCash/bank transfer confirmation.</p>
              </div>

              <button onClick={submitBooking} disabled={loading || uploading || !proofFile || !form.payment_reference}
                className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white py-4 rounded-xl font-semibold text-lg transition-colors">
                {uploading ? 'Uploading proof...' : loading ? 'Submitting...' : 'Submit Booking Request'}
              </button>
              <p className="text-xs text-gray-400 text-center">
                We'll verify your payment and confirm your booking within 24 hours.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
