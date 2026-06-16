'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function CheckInOutPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'in' | 'active' | 'out'>('in')
  const [pendingCheckins, setPendingCheckins] = useState<any[]>([])
  const [activeStays, setActiveStays] = useState<any[]>([])
  const [pendingCheckouts, setPendingCheckouts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)

    const [{ data: checkins }, { data: active }, { data: checkouts }] = await Promise.all([
      // Bookings due to arrive (today or earlier) that haven't checked in yet
      supabase
        .from('bookings')
        .select('*, guests(full_name, phone), rooms(room_number), cottages(name, cottage_code)')
        .in('status', ['pending', 'confirmed'])
        .lte('check_in_date', today),
      // All guests currently staying (checked in, not yet checked out)
      supabase
        .from('bookings')
        .select('*, guests(full_name, phone), rooms(room_number, id), cottages(name, cottage_code, id)')
        .eq('status', 'checked_in')
        .order('check_out_date'),
      // Guests scheduled to check out today (or overdue)
      supabase
        .from('bookings')
        .select('*, guests(full_name, phone), rooms(room_number, id), cottages(name, cottage_code, id)')
        .eq('status', 'checked_in')
        .lte('check_out_date', today),
    ])

    setPendingCheckins(checkins ?? [])
    setActiveStays(active ?? [])
    setPendingCheckouts(checkouts ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function handleCheckIn(booking: any) {
    const wristband = `WB-${Date.now().toString().slice(-6)}`

    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'checked_in',
        actual_check_in: new Date().toISOString(),
        wristband_number: wristband,
      })
      .eq('id', booking.id)

    if (error) { showToast('Error: ' + error.message); return }

    if (booking.room_id) {
      await supabase.from('rooms').update({ status: 'occupied' }).eq('id', booking.room_id)
    }
    if (booking.cottage_id) {
      await supabase.from('cottages').update({ status: 'occupied' }).eq('id', booking.cottage_id)
    }

    showToast(`${(booking.guests as any)?.full_name} checked in! Wristband: ${wristband}`)
    load()
  }

  async function handleCheckOut(booking: any) {
    const balance = Math.max(0, booking.total_amount - booking.amount_paid)

    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'checked_out',
        actual_check_out: new Date().toISOString(),
        amount_paid: booking.total_amount,
        payment_status: 'paid',
      })
      .eq('id', booking.id)

    if (error) { showToast('Error: ' + error.message); return }

    if (booking.room_id) {
      await supabase.from('rooms').update({ status: 'cleaning' }).eq('id', booking.room_id)
    }
    if (booking.cottage_id) {
      await supabase.from('cottages').update({ status: 'cleaning' }).eq('id', booking.cottage_id)
    }

    if (balance > 0) {
      await supabase.from('transactions').insert({
        txn_number: `TXN-${Date.now()}`,
        booking_id: booking.id,
        guest_id: booking.guest_id,
        txn_type: 'room',
        description: 'Final payment on check-out',
        amount: balance,
        payment_method: 'cash',
      })
    }

    showToast(`${(booking.guests as any)?.full_name} checked out! Room set to cleaning.`)
    load()
  }

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50 max-w-xs">
          ✅ {toast}
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4 w-fit">
        <button
          onClick={() => setTab('in')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'in' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
          }`}
        >
          Check-In ({pendingCheckins.length})
        </button>
        <button
          onClick={() => setTab('active')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'active' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
          }`}
        >
          Active Stays ({activeStays.length})
        </button>
        <button
          onClick={() => setTab('out')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'out' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
          }`}
        >
          Due for Check-Out ({pendingCheckouts.length})
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : tab === 'in' ? (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">
            Pending Check-ins
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5">Booking #</th>
                  <th className="text-left px-4 py-2.5">Guest</th>
                  <th className="text-left px-4 py-2.5">Room/Cottage</th>
                  <th className="text-left px-4 py-2.5">Pax</th>
                  <th className="text-left px-4 py-2.5">Payment</th>
                  <th className="text-left px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingCheckins.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-xs">Walay pending check-ins karon.</td></tr>
                ) : pendingCheckins.map(b => (
                  <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-blue-700">{b.booking_number}</td>
                    <td className="px-4 py-2.5">{(b.guests as any)?.full_name}</td>
                    <td className="px-4 py-2.5">
                      {b.rooms ? `Room ${(b.rooms as any).room_number}` : (b.cottages as any)?.name}
                    </td>
                    <td className="px-4 py-2.5">{b.num_adults + b.num_children}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        b.payment_status === 'paid' ? 'bg-green-100 text-green-700' :
                        b.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {b.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => handleCheckIn(b)}
                        className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg"
                      >
                        Check In
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'active' ? (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">
            Currently Checked-In Guests
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5">Booking #</th>
                  <th className="text-left px-4 py-2.5">Guest</th>
                  <th className="text-left px-4 py-2.5">Room/Cottage</th>
                  <th className="text-left px-4 py-2.5">Check-in</th>
                  <th className="text-left px-4 py-2.5">Check-out</th>
                  <th className="text-left px-4 py-2.5">Wristband</th>
                  <th className="text-left px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {activeStays.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-xs">Walay currently checked-in guests.</td></tr>
                ) : activeStays.map(b => (
                  <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-blue-700">{b.booking_number}</td>
                    <td className="px-4 py-2.5">{(b.guests as any)?.full_name}</td>
                    <td className="px-4 py-2.5">
                      {b.rooms ? `Room ${(b.rooms as any).room_number}` : (b.cottages as any)?.name}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{b.check_in_date}</td>
                    <td className="px-4 py-2.5 text-gray-500">{b.check_out_date}</td>
                    <td className="px-4 py-2.5 text-gray-500">{b.wristband_number ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => handleCheckOut(b)}
                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs rounded-lg"
                      >
                        Check Out Now
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">
            Due for Check-Out
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5">Booking #</th>
                  <th className="text-left px-4 py-2.5">Guest</th>
                  <th className="text-left px-4 py-2.5">Room</th>
                  <th className="text-left px-4 py-2.5">Total</th>
                  <th className="text-left px-4 py-2.5">Balance</th>
                  <th className="text-left px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingCheckouts.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-xs">Walay pending check-outs karon.</td></tr>
                ) : pendingCheckouts.map(b => {
                  const balance = Math.max(0, b.total_amount - b.amount_paid)
                  return (
                    <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-blue-700">{b.booking_number}</td>
                      <td className="px-4 py-2.5">{(b.guests as any)?.full_name}</td>
                      <td className="px-4 py-2.5">
                        {b.rooms ? `Room ${(b.rooms as any).room_number}` : (b.cottages as any)?.name}
                      </td>
                      <td className="px-4 py-2.5">₱{Number(b.total_amount).toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <span className={balance > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                          ₱{balance.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => handleCheckOut(b)}
                          className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg"
                        >
                          Check Out
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
