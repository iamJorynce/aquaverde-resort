'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface RoomType {
  id: string; name: string; base_rate: number; max_capacity: number
  type: string; description: string | null
}

export default function BookingPage() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [availableRooms, setAvailableRooms] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [checkingAvail, setCheckingAvail] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  const [form, setForm] = useState({
    room_type_id: searchParams.get('type') ?? '',
    check_in_date: today,
    check_out_date: tomorrow,
    num_adults: 2,
    num_children: 0,
    full_name: '',
    email: '',
    phone: '',
    special_requests: '',
  })

  const selectedType = roomTypes.find(rt => rt.id === form.room_type_id)
  const nights = Math.max(1, Math.ceil(
    (new Date(form.check_out_date).getTime() - new Date(form.check_in_date).getTime()) / 86400000
  ))
  const subtotal = (selectedType?.base_rate ?? 0) * nights
  const reservationFee = Math.ceil(subtotal * 0.5 / nights) // 50% of first night

  useEffect(() => {
    supabase.from('room_types_config').select('*').eq('is_active', true).order('base_rate')
      .then(({ data }) => setRoomTypes(data ?? []))
  }, [])

  async function checkAvailability() {
    if (!form.room_type_id) { setError('Please select a room type.'); return }
    if (!form.check_in_date || !form.check_out_date) { setError('Please select check-in and check-out dates.'); return }
    if (form.check_in_date >= form.check_out_date) { setError('Check-out must be after check-in.'); return }

    setCheckingAvail(true)
    setError('')

    // Find available rooms of selected type not booked in requested dates
    const { data: bookedRooms } = await supabase
      .from('bookings')
      .select('room_id')
      .in('status', ['reserved', 'checked_in', 'confirmed'])
      .lt('check_in_date', form.check_out_date)
      .gt('check_out_date', form.check_in_date)
      .not('room_id', 'is', null)

    const bookedIds = (bookedRooms ?? []).map(b => b.room_id).filter(Boolean)

    const query = supabase.from('rooms').select('id, room_number')
      .eq('room_type_id', form.room_type_id)
      .eq('status', 'available')

    const { data: rooms } = bookedIds.length > 0
      ? await query.not('id', 'in', `(${bookedIds.join(',')})`)
      : await query

    setAvailableRooms(rooms ?? [])
    setCheckingAvail(false)

    if (!rooms || rooms.length === 0) {
      setError('No rooms available for the selected dates. Please try different dates.')
    } else {
      setStep(2)
    }
  }

  async function submitBooking() {
    if (!form.full_name) { setError('Please enter your full name.'); return }
    if (!form.email && !form.phone) { setError('Please provide an email or phone number.'); return }

    setLoading(true)
    setError('')

    try {
      // Upsert guest
      const guestCode = `G-${Date.now().toString().slice(-6)}`
      const { data: guest, error: guestError } = await supabase
        .from('guests')
        .insert({
          full_name: form.full_name,
          email: form.email || null,
          phone: form.phone || null,
          guest_code: guestCode,
        })
        .select('id')
        .single()

      if (guestError) throw guestError

      // Pick first available room
      const assignedRoom = availableRooms[0]

      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          guest_id: guest.id,
          room_id: assignedRoom.id,
          booking_type: 'online',
          accommodation_type: 'room',
          num_adults: form.num_adults,
          num_children: form.num_children,
          check_in_date: form.check_in_date,
          check_out_date: form.check_out_date,
          subtotal,
          total_amount: subtotal,
          amount_paid: 0,
          payment_status: 'unpaid',
          status: 'pending',  // admin must approve
          special_requests: form.special_requests || null,
        })
        .select()
        .single()

      if (bookingError) throw bookingError

      router.push(`/booking/confirmation/${booking.id}`)

    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <>
      {/* Hero */}
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
              { n: 1, label: 'Select Room & Dates' },
              { n: 2, label: 'Your Details' },
              { n: 3, label: 'Review & Confirm' },
            ].map((s, i) => (
              <div key={s.n} className="flex items-center gap-2 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
                  step >= s.n ? 'bg-blue-700 text-white' : 'bg-gray-200 text-gray-500'
                }`}>{s.n}</div>
                <span className={`text-xs hidden sm:block ${step >= s.n ? 'text-blue-700 font-medium' : 'text-gray-400'}`}>{s.label}</span>
                {i < 2 && <div className={`flex-1 h-0.5 ${step > s.n ? 'bg-blue-700' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{error}</div>
          )}

          {/* Step 1: Room & Dates */}
          {step === 1 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
              <h2 className="text-lg font-semibold text-gray-800">Select Room & Dates</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Room Type</label>
                <div className="grid grid-cols-1 gap-3">
                  {roomTypes.map(rt => (
                    <label key={rt.id} className={`flex items-center gap-4 border-2 rounded-xl p-4 cursor-pointer transition-colors ${
                      form.room_type_id === rt.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input type="radio" name="room_type" value={rt.id} checked={form.room_type_id === rt.id}
                        onChange={() => setForm(p => ({ ...p, room_type_id: rt.id }))} className="sr-only" />
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">{rt.name}</div>
                        <div className="text-sm text-gray-500">Up to {rt.max_capacity} guests</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-blue-700">₱{Number(rt.base_rate).toLocaleString()}</div>
                        <div className="text-xs text-gray-400">per night</div>
                      </div>
                    </label>
                  ))}
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Adults</label>
                  <input type="number" min={1} max={10} value={form.num_adults}
                    onChange={e => setForm(p => ({ ...p, num_adults: parseInt(e.target.value) || 1 }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Children</label>
                  <input type="number" min={0} max={10} value={form.num_children}
                    onChange={e => setForm(p => ({ ...p, num_children: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white" />
                </div>
              </div>

              {selectedType && (
                <div className="bg-blue-50 rounded-xl p-4 text-sm">
                  <div className="flex justify-between text-gray-600 mb-1">
                    <span>{selectedType.name} × {nights} night{nights > 1 ? 's' : ''}</span>
                    <span>₱{subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-blue-700">
                    <span>Reservation fee (50% of 1st night)</span>
                    <span>₱{reservationFee.toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Balance of ₱{(subtotal - reservationFee).toLocaleString()} due on arrival.</div>
                </div>
              )}

              <button onClick={checkAvailability} disabled={checkingAvail || !form.room_type_id}
                className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white py-3.5 rounded-xl font-semibold transition-colors">
                {checkingAvail ? 'Checking availability...' : 'Check Availability →'}
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
                ✓ {availableRooms.length} room{availableRooms.length > 1 ? 's' : ''} available for your selected dates!
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
                  rows={3} placeholder="e.g. Extra pillows, early check-in, ground floor room..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white resize-none" />
              </div>

              <button onClick={() => { if (!form.full_name || (!form.email && !form.phone)) { setError('Please fill in required fields.'); return }; setError(''); setStep(3) }}
                className="w-full bg-blue-700 hover:bg-blue-800 text-white py-3.5 rounded-xl font-semibold transition-colors">
                Review Booking →
              </button>
            </div>
          )}

          {/* Step 3: Review & Confirm */}
          {step === 3 && selectedType && (
            <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(2)} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
                <h2 className="text-lg font-semibold text-gray-800">Review Your Booking</h2>
              </div>

              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Booking Summary</div>
                <div className="p-4 space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Room Type</span><span className="font-medium">{selectedType.name}</span></div>
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
                <strong>Important:</strong> Your booking will be <strong>pending admin approval</strong>. You will be notified once confirmed. The reservation fee of ₱{reservationFee.toLocaleString()} is payable upon arrival.
              </div>

              <button onClick={submitBooking} disabled={loading}
                className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white py-4 rounded-xl font-semibold text-lg transition-colors">
                {loading ? 'Submitting...' : 'Confirm Booking Request'}
              </button>
              <p className="text-xs text-gray-400 text-center">By booking, you agree to our cancellation and booking policies.</p>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
