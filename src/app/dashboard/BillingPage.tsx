'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const statusColor: Record<string, string> = {
  unpaid: 'bg-red-100 text-red-700',
  partial: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  refunded: 'bg-gray-100 text-gray-600',
  voided: 'bg-gray-100 text-gray-600',
}

export default function BillingPage() {
  const supabase = createClient()
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [payModal, setPayModal] = useState<any>(null)
  const [payAmount, setPayAmount] = useState(0)
  const [payMethod, setPayMethod] = useState('cash')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('invoices')
      .select('*, guests(full_name), bookings(booking_number)')
      .order('created_at', { ascending: false })
    setInvoices(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function openPay(inv: any) {
    setPayModal(inv)
    setPayAmount(inv.balance)
  }

  async function submitPayment() {
    if (!payModal || payAmount <= 0) return

    const newPaid = payModal.paid + payAmount
    const newStatus = newPaid >= payModal.total ? 'paid' : 'partial'

    const { error } = await supabase
      .from('invoices')
      .update({ paid: newPaid, status: newStatus })
      .eq('id', payModal.id)

    if (error) { showToast('Error: ' + error.message); return }

    await supabase.from('transactions').insert({
      txn_number: `TXN-${Date.now()}`,
      booking_id: payModal.booking_id,
      guest_id: payModal.guest_id,
      txn_type: 'room',
      description: `Invoice payment — ${payModal.invoice_number}`,
      amount: payAmount,
      payment_method: payMethod,
    })

    if (payModal.booking_id) {
      const { data: booking } = await supabase.from('bookings').select('amount_paid, total_amount').eq('id', payModal.booking_id).single()
      if (booking) {
        const newBookingPaid = booking.amount_paid + payAmount
        await supabase.from('bookings').update({
          amount_paid: newBookingPaid,
          payment_status: newBookingPaid >= booking.total_amount ? 'paid' : 'partial',
        }).eq('id', payModal.booking_id)
      }
    }

    showToast(`Payment of ₱${payAmount.toLocaleString()} recorded.`)
    setPayModal(null)
    load()
  }

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50">
          {toast}
        </div>
      )}

      <div className="text-sm font-medium text-gray-700 mb-4">{invoices.length} Invoices</div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5">Invoice #</th>
                <th className="text-left px-4 py-2.5">Guest</th>
                <th className="text-left px-4 py-2.5">Booking</th>
                <th className="text-left px-4 py-2.5">Total</th>
                <th className="text-left px-4 py-2.5">Paid</th>
                <th className="text-left px-4 py-2.5">Balance</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-xs">No invoices found.</td></tr>
              ) : invoices.map(inv => (
                <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-blue-700">{inv.invoice_number}</td>
                  <td className="px-4 py-2.5">{(inv.guests as any)?.full_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{(inv.bookings as any)?.booking_number ?? '—'}</td>
                  <td className="px-4 py-2.5">₱{Number(inv.total).toLocaleString()}</td>
                  <td className="px-4 py-2.5">₱{Number(inv.paid).toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <span className={inv.balance > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                      ₱{Number(inv.balance).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColor[inv.status]}`}>{inv.status}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {inv.balance > 0 ? (
                      <button onClick={() => openPay(inv)} className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg">
                        Pay
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">Settled</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setPayModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-3">Pay Invoice — {payModal.invoice_number}</div>
            <div className="text-xs text-gray-500 mb-3">Balance: ₱{Number(payModal.balance).toLocaleString()}</div>
            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">Amount</label>
              <input type="number" value={payAmount} onChange={e => setPayAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">Payment Method</label>
              <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                <option value="cash">Cash</option>
                <option value="gcash">GCash</option>
                <option value="maya">Maya</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="credit_card">Credit Card</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={submitPayment} className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-lg">
                Confirm Payment
              </button>
              <button onClick={() => setPayModal(null)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
