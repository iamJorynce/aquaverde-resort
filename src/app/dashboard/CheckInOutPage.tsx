'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { printReceipt } from './receipt'
import { createOrUpdateInvoice } from './invoiceUtils'

export default function CheckInOutPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'in' | 'active' | 'out'>('in')
  const [pendingCheckins, setPendingCheckins] = useState<any[]>([])
  const [activeStays, setActiveStays] = useState<any[]>([])
  const [pendingCheckouts, setPendingCheckouts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [billDetail, setBillDetail] = useState<{ booking: any; addons: any[] } | null>(null)
  const [loadingBill, setLoadingBill] = useState(false)

  const [checkoutModal, setCheckoutModal] = useState<{ booking: any; addons: any[] } | null>(null)
  const [checkoutAmount, setCheckoutAmount] = useState(0)
  const [checkoutMethod, setCheckoutMethod] = useState('cash')
  const [processingCheckout, setProcessingCheckout] = useState(false)

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

  async function viewBill(booking: any) {
    setLoadingBill(true)
    const { data: addons } = await supabase
      .from('booking_addons')
      .select('*')
      .eq('booking_id', booking.id)
      .order('created_at')
    setBillDetail({ booking, addons: addons ?? [] })
    setLoadingBill(false)
  }

  async function openCheckoutModal(booking: any) {
    const balance = Math.max(0, booking.total_amount - booking.amount_paid)

    const { data: addons } = await supabase
      .from('booking_addons')
      .select('*')
      .eq('booking_id', booking.id)
      .order('created_at')

    setCheckoutModal({ booking, addons: addons ?? [] })
    setCheckoutAmount(balance)
    setCheckoutMethod('cash')
  }

  async function confirmCheckout() {
    if (!checkoutModal) return
    const { booking, addons } = checkoutModal
    const balanceBefore = Math.max(0, booking.total_amount - booking.amount_paid)

    if (checkoutAmount < 0) { showToast('Amount cannot be negative.'); return }

    setProcessingCheckout(true)

    const newAmountPaid = Number(booking.amount_paid) + Number(checkoutAmount)
    const remainingBalance = Math.max(0, booking.total_amount - newAmountPaid)

    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'checked_out',
        actual_check_out: new Date().toISOString(),
        amount_paid: newAmountPaid,
        payment_status: remainingBalance > 0 ? 'partial' : 'paid',
      })
      .eq('id', booking.id)

    if (error) { showToast('Error: ' + error.message); setProcessingCheckout(false); return }

    if (booking.room_id) {
      await supabase.from('rooms').update({ status: 'cleaning' }).eq('id', booking.room_id)
    }
    if (booking.cottage_id) {
      await supabase.from('cottages').update({ status: 'cleaning' }).eq('id', booking.cottage_id)
    }

    if (checkoutAmount > 0) {
      await supabase.from('transactions').insert({
        txn_number: `TXN-${Date.now()}`,
        booking_id: booking.id,
        guest_id: booking.guest_id,
        txn_type: 'room',
        description: 'Payment recorded at check-out',
        amount: checkoutAmount,
        payment_method: checkoutMethod,
      })
    }

    const guestName = (booking.guests as any)?.full_name ?? 'Guest'
    const roomLabel = booking.rooms ? `Room ${(booking.rooms as any).room_number}` : (booking.cottages as any)?.name ?? 'Accommodation'

    // booking.subtotal is the original room/cottage charge before any
    // POS add-ons were charged to the room. Listing each addon separately
    // (instead of just the final total_amount) is what makes POS charges
    // actually visible on the check-out receipt.
    const addonLineItems = (addons ?? []).map((a: any) => ({
      label: a.name,
      qty: a.quantity > 1 ? a.quantity : undefined,
      amount: Number(a.total_price ?? a.unit_price * a.quantity),
    }))

    printReceipt({
      title: 'AquaVerde Beach Resort',
      receiptNumber: booking.booking_number,
      receiptType: 'Check-out Receipt',
      date: new Date().toLocaleDateString('en-PH', { dateStyle: 'medium' }),
      guestName,
      lineItems: [
        { label: roomLabel, amount: Number(booking.subtotal) },
        ...addonLineItems,
      ],
      total: booking.total_amount,
      amountPaid: newAmountPaid,
      balance: remainingBalance,
      paymentMethod: checkoutMethod,
      footerNote: remainingBalance > 0
        ? 'Balance remains on this guest\'s account.'
        : 'Thank you for staying with us!',
    })

    // Update (or create) the invoice to reflect final payment state.
    // If invoice was already created at walk-in, this updates it.
    // If somehow missed (e.g. advance booking checked in without walk-in flow),
    // this creates it fresh so Billing always has a record.
    await createOrUpdateInvoice(supabase, {
      booking_id: booking.id,
      guest_id: booking.guest_id,
      subtotal: Number(booking.subtotal),
      total: Number(booking.total_amount),
      amount_paid: newAmountPaid,
      notes: remainingBalance > 0
        ? `Partial payment at check-out. Balance: ₱${remainingBalance.toLocaleString()}`
        : 'Fully settled at check-out.',
    })

    showToast(
      remainingBalance > 0
        ? `${guestName} checked out with ₱${remainingBalance.toLocaleString()} balance remaining.`
        : `${guestName} checked out! Room set to cleaning.`
    )

    setCheckoutModal(null)
    setProcessingCheckout(false)
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
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-xs">No pending check-ins today.</td></tr>
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
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-xs">No guests currently checked in.</td></tr>
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
                        onClick={() => viewBill(b)}
                        className="px-3 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs rounded-lg mr-1"
                      >
                        View Bill
                      </button>
                      <button
                        onClick={() => openCheckoutModal(b)}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg"
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
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-xs">No pending check-outs today.</td></tr>
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
                          onClick={() => viewBill(b)}
                          className="px-3 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs rounded-lg mr-1"
                        >
                          View Bill
                        </button>
                        <button
                          onClick={() => openCheckoutModal(b)}
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

      {billDetail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setBillDetail(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-1">
              Bill — {billDetail.booking.booking_number}
            </div>
            <div className="text-xs text-gray-400 mb-3">
              {(billDetail.booking.guests as any)?.full_name}
            </div>

            <div className="text-sm space-y-1.5 mb-3">
              <div className="flex justify-between text-gray-600">
                <span>
                  {billDetail.booking.rooms ? `Room ${(billDetail.booking.rooms as any).room_number}` : (billDetail.booking.cottages as any)?.name}
                </span>
                <span>₱{Number(billDetail.booking.subtotal).toLocaleString()}</span>
              </div>

              {billDetail.addons.length === 0 ? (
                <div className="text-xs text-gray-400 italic">No additional charges (POS, etc.)</div>
              ) : billDetail.addons.map((a: any) => (
                <div key={a.id} className="flex justify-between text-gray-600">
                  <span>{a.name}{a.quantity > 1 ? ` × ${a.quantity}` : ''}</span>
                  <span>₱{Number(a.total_price ?? a.unit_price * a.quantity).toLocaleString()}</span>
                </div>
              ))}

              <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-100 pt-1.5 mt-1.5">
                <span>Total</span>
                <span>₱{Number(billDetail.booking.total_amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Amount Paid</span>
                <span>₱{Number(billDetail.booking.amount_paid).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className={billDetail.booking.total_amount - billDetail.booking.amount_paid > 0 ? 'text-red-600' : 'text-green-600'}>
                  Balance
                </span>
                <span className={billDetail.booking.total_amount - billDetail.booking.amount_paid > 0 ? 'text-red-600' : 'text-green-600'}>
                  ₱{Math.max(0, billDetail.booking.total_amount - billDetail.booking.amount_paid).toLocaleString()}
                </span>
              </div>
            </div>

            <button onClick={() => setBillDetail(null)} className="w-full py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">
              Close
            </button>
          </div>
        </div>
      )}

      {checkoutModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !processingCheckout && setCheckoutModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-1">
              Check Out — {checkoutModal.booking.booking_number}
            </div>
            <div className="text-xs text-gray-400 mb-3">
              {(checkoutModal.booking.guests as any)?.full_name}
            </div>

            <div className="text-sm space-y-1.5 mb-3 bg-gray-50 rounded-lg p-3">
              <div className="flex justify-between text-gray-600">
                <span>
                  {checkoutModal.booking.rooms ? `Room ${(checkoutModal.booking.rooms as any).room_number}` : (checkoutModal.booking.cottages as any)?.name}
                </span>
                <span>₱{Number(checkoutModal.booking.subtotal).toLocaleString()}</span>
              </div>

              {checkoutModal.addons.map((a: any) => (
                <div key={a.id} className="flex justify-between text-gray-600">
                  <span>{a.name}{a.quantity > 1 ? ` × ${a.quantity}` : ''}</span>
                  <span>₱{Number(a.total_price ?? a.unit_price * a.quantity).toLocaleString()}</span>
                </div>
              ))}

              <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-200 pt-1.5 mt-1.5">
                <span>Total Bill</span>
                <span>₱{Number(checkoutModal.booking.total_amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Already Paid</span>
                <span>₱{Number(checkoutModal.booking.amount_paid).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-medium text-red-600">
                <span>Balance Due</span>
                <span>₱{Math.max(0, checkoutModal.booking.total_amount - checkoutModal.booking.amount_paid).toLocaleString()}</span>
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">Amount Being Paid Now</label>
              <input
                type="number"
                value={checkoutAmount}
                onChange={e => setCheckoutAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
              />
              <div className="text-xs text-gray-400 mt-1">
                Defaults to the full balance. Lower it if the guest is only paying part now.
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">Payment Method</label>
              <select
                value={checkoutMethod}
                onChange={e => setCheckoutMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
              >
                <option value="cash">Cash</option>
                <option value="gcash">GCash</option>
                <option value="maya">Maya</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="credit_card">Credit Card</option>
              </select>
            </div>

            {checkoutAmount < Math.max(0, checkoutModal.booking.total_amount - checkoutModal.booking.amount_paid) && (
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 text-xs text-amber-700 mb-3">
                This is less than the full balance. The guest will check out with a remaining balance of{' '}
                ₱{Math.max(0, checkoutModal.booking.total_amount - checkoutModal.booking.amount_paid - checkoutAmount).toLocaleString()}.
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={confirmCheckout}
                disabled={processingCheckout}
                className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm rounded-lg"
              >
                {processingCheckout ? 'Processing...' : 'Confirm Check-Out'}
              </button>
              <button
                onClick={() => setCheckoutModal(null)}
                disabled={processingCheckout}
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
