'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { printReceipt } from './receipt'

interface RoomOption {
  id: string
  room_number: string
  room_type_id: string
  room_types_config: { name: string; base_rate: number } | null
}

export default function WalkInPage() {
  const supabase = createClient()
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<{
    wristband: string
    bookingNumber: string
    guestName: string
    roomLabel: string
    nights: number
    rate: number
    subtotal: number
    deposit: number
    total: number
  } | null>(null)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    num_adults: 1,
    num_children: 0,
    room_id: '',
    check_in_date: new Date().toISOString().slice(0, 10),
    check_out_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    special_requests: '',
    security_deposit: 1000,
  })

  useEffect(() => {
    async function loadRooms() {
      const { data } = await supabase
        .from('rooms')
        .select('id, room_number, room_type_id, room_types_config(name, base_rate)')
        .eq('status', 'available')
        .order('room_number')
      setRooms((data as any) ?? [])
    }
    loadRooms()
  }, [])

  const selectedRoom = rooms.find(r => r.id === form.room_id)
  const rate = selectedRoom?.room_types_config?.base_rate ?? 0
  const nights = Math.max(1, Math.ceil(
    (new Date(form.check_out_date).getTime() - new Date(form.check_in_date).getTime()) / 86400000
  ))
  const subtotal = rate * nights
  const total = subtotal + Number(form.security_deposit)

  function update(field: string, value: any) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name || !form.room_id) {
      setError('Please fill in the name and select a room.')
      return
    }
    setLoading(true)
    setError('')

    try {
      // 1. Create or find guest
      const guestCode = `G-${Date.now().toString().slice(-6)}`
      const { data: guest, error: guestError } = await supabase
        .from('guests')
        .insert({
          guest_code: guestCode,
          full_name: form.full_name,
          phone: form.phone || null,
          email: form.email || null,
        })
        .select()
        .single()

      if (guestError) throw guestError

      // 2. Create booking
      const wristband = `WB-${Date.now().toString().slice(-6)}`
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          guest_id: guest.id,
          booking_type: 'walk_in',
          accommodation_type: 'room',
          room_id: form.room_id,
          status: 'checked_in',
          check_in_date: form.check_in_date,
          check_out_date: form.check_out_date,
          actual_check_in: new Date().toISOString(),
          num_adults: form.num_adults,
          num_children: form.num_children,
          room_rate: rate,
          subtotal,
          total_amount: subtotal,
          security_deposit: form.security_deposit,
          amount_paid: subtotal,
          payment_status: 'paid',
          wristband_number: wristband,
          special_requests: form.special_requests || null,
        })
        .select()
        .single()

      if (bookingError) throw bookingError

      // 3. Update room status to occupied
      await supabase.from('rooms').update({ status: 'occupied' }).eq('id', form.room_id)

      // 4. Record transactions — room charge and security deposit are recorded separately
      await supabase.from('transactions').insert({
        txn_number: `TXN-${Date.now()}`,
        booking_id: booking.id,
        guest_id: guest.id,
        txn_type: 'room',
        description: `Walk-in registration — Room ${selectedRoom?.room_number}`,
        amount: subtotal,
        payment_method: 'cash',
      })

      if (form.security_deposit > 0) {
        await supabase.from('transactions').insert({
          txn_number: `TXN-${Date.now() + 1}`,
          booking_id: booking.id,
          guest_id: guest.id,
          txn_type: 'deposit',
          description: `Security deposit — Room ${selectedRoom?.room_number}`,
          amount: form.security_deposit,
          payment_method: 'cash',
        })
      }

      setSuccess({
        wristband,
        bookingNumber: booking.booking_number,
        guestName: form.full_name,
        roomLabel: `Room ${selectedRoom?.room_number} — ${selectedRoom?.room_types_config?.name}`,
        nights,
        rate,
        subtotal,
        deposit: form.security_deposit,
        total,
      })

      // Reset form
      setForm({
        full_name: '', phone: '', email: '',
        num_adults: 1, num_children: 0, room_id: '',
        check_in_date: new Date().toISOString().slice(0, 10),
        check_out_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        special_requests: '', security_deposit: 1000,
      })

      // Reload available rooms
      const { data } = await supabase
        .from('rooms')
        .select('id, room_number, room_type_id, room_types_config(name, base_rate)')
        .eq('status', 'available')
        .order('room_number')
      setRooms((data as any) ?? [])

    } catch (err: any) {
      setError(err.message || 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl">
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-green-800">
              ✅ Walk-in registered! Booking {success.bookingNumber}
            </div>
            <div className="text-xs text-green-600 mt-0.5">Wristband: {success.wristband}</div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => printReceipt({
                title: 'AquaVerde Beach Resort',
                receiptNumber: success.bookingNumber,
                receiptType: 'Walk-in Receipt',
                date: new Date().toLocaleDateString('en-PH', { dateStyle: 'medium' }),
                guestName: success.guestName,
                lineItems: [
                  { label: success.roomLabel, qty: success.nights, amount: success.subtotal },
                  { label: 'Security deposit (refundable)', amount: success.deposit },
                ],
                total: success.total,
                amountPaid: success.total,
                paymentMethod: 'cash',
                footerNote: `Wristband: ${success.wristband}`,
              })}
              className="text-sm text-green-700 hover:text-green-900 underline"
            >
              Print Receipt
            </button>
            <button onClick={() => setSuccess(null)} className="text-green-600 text-sm">×</button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Guest Info */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
          <div className="text-sm font-medium text-gray-700 mb-1">Guest Information</div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Full Name *</label>
            <input
              value={form.full_name}
              onChange={e => update('full_name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Guest full name"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Contact Number</label>
            <input
              value={form.phone}
              onChange={e => update('phone', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+63 9XX XXX XXXX"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Email (optional)</label>
            <input
              type="email"
              value={form.email}
              onChange={e => update('email', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="guest@email.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Adults</label>
              <input
                type="number" min={1}
                value={form.num_adults}
                onChange={e => update('num_adults', parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Children</label>
              <input
                type="number" min={0}
                value={form.num_children}
                onChange={e => update('num_children', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Accommodation */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
          <div className="text-sm font-medium text-gray-700 mb-1">Accommodation</div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Select Room *</label>
            <select
              value={form.room_id}
              onChange={e => update('room_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">-- Select a room --</option>
              {rooms.map(r => (
                <option key={r.id} value={r.id}>
                  Room {r.room_number} — {r.room_types_config?.name} (₱{r.room_types_config?.base_rate}/night)
                </option>
              ))}
            </select>
            {rooms.length === 0 && (
              <div className="text-xs text-amber-600 mt-1">No available rooms right now.</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Check-in</label>
              <input
                type="date"
                value={form.check_in_date}
                onChange={e => update('check_in_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Check-out</label>
              <input
                type="date"
                value={form.check_out_date}
                onChange={e => update('check_out_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Special Requests</label>
            <input
              value={form.special_requests}
              onChange={e => update('special_requests', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Extra bed, etc."
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Security Deposit</label>
            <input
              type="number"
              value={form.security_deposit}
              onChange={e => update('security_deposit', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Bill Summary */}
          <div className="bg-blue-50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between text-gray-600">
              <span>Room rate × {nights} night(s)</span>
              <span>₱{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Security deposit (refundable)</span>
              <span>₱{Number(form.security_deposit).toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-semibold text-blue-700 border-t border-blue-200 pt-1 mt-1">
              <span>Total to Collect Today</span>
              <span>₱{total.toLocaleString()}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !form.room_id}
            className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Processing...' : 'Register & Check In'}
          </button>
        </div>
      </form>
    </div>
  )
}
