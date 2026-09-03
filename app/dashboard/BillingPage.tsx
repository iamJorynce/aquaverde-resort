'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PaymentCalculator from './PaymentCalculator'
import { logActivity } from './activityLog'
import { createOrUpdateInvoice } from './invoiceUtils'
import { printReceipt } from './receipt'
import { useResortSettings } from '@/hooks/useResortSettings'

const statusColor: Record<string, string> = {
  unpaid:   'bg-red-100 text-red-700',
  partial:  'bg-yellow-100 text-yellow-700',
  paid:     'bg-green-100 text-green-700',
  refunded: 'bg-gray-100 text-gray-600',
  voided:   'bg-gray-100 text-gray-600',
}

export default function BillingPage() {
  const supabase = createClient()
  const { settings: resortSettings } = useResortSettings()
  const [invoices, setInvoices]     = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [toast, setToast]           = useState('')
  const [filter, setFilter]         = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all')

  const [payModal, setPayModal]     = useState<any>(null)
  const [addons, setAddons]         = useState<any[]>([])
  const [payAmount, setPayAmount]   = useState(0)
  const [payMethod, setPayMethod]   = useState('cash')
  const [tendered, setTendered]     = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const [detailModal, setDetailModal] = useState<any>(null)
  const [detailAddons, setDetailAddons] = useState<any[]>([])
  const [detailPosOrders, setDetailPosOrders] = useState<any[]>([])
  const [payPosOrders, setPayPosOrders] = useState<any[]>([])


  async function load() {
    setLoading(true)
    const { data } = await supabase
  .from('invoices')
  .select('*, guests(full_name, phone), bookings(booking_number, subtotal, check_in_date, check_out_date, accommodation_type, rooms(room_number), cottages(name))')
  .order('created_at', { ascending: false })
setInvoices(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  async function openPay(inv: any) {
    const [{ data: addonData }, { data: posData }] = await Promise.all([
      supabase.from('booking_addons').select('*').eq('booking_id', inv.booking_id).order('created_at'),
      supabase.from('orders')
        .select('id, order_number, total, created_at, order_items(quantity, unit_price, subtotal, menu_items(name))')
        .eq('booking_id', inv.booking_id)
        .eq('order_type', 'room_service')
        .order('created_at'),
    ])
    setAddons(addonData ?? [])
    setPayPosOrders(posData ?? [])
    setPayModal(inv)
    setPayAmount(Math.max(0, Number(inv.balance)))
    setPayMethod('cash')
    setTendered(0)
  }

  async function openDetail(inv: any) {
    const [{ data: addonData }, { data: posData }] = await Promise.all([
      supabase.from('booking_addons').select('*').eq('booking_id', inv.booking_id).order('created_at'),
      supabase.from('orders')
        .select('id, order_number, total, created_at, order_items(quantity, unit_price, subtotal, menu_items(name))')
        .eq('booking_id', inv.booking_id)
        .eq('order_type', 'room_service')
        .order('created_at'),
    ])
    setDetailAddons(addonData ?? [])
    setDetailPosOrders(posData ?? [])
    setDetailModal(inv)
  }

  async function submitPayment() {
    if (!payModal || payAmount <= 0) return
    setSubmitting(true)

    try {
      const newPaid = Number(payModal.paid) + payAmount
      const newStatus = newPaid >= Number(payModal.total) ? 'paid' : 'partial'

      // Update invoice
      const { error: invError } = await supabase
        .from('invoices')
        .update({ paid: newPaid, status: newStatus })
        .eq('id', payModal.id)
      if (invError) throw invError

      // Record the transaction
      await supabase.from('transactions').insert({
        status: 'completed',
        txn_number: `TXN-${Date.now()}`,
        booking_id: payModal.booking_id,
        guest_id: payModal.guest_id,
        txn_type: 'room',
        description: `Billing payment — ${payModal.invoice_number}`,
        amount: payAmount,
        payment_method: payMethod,
      })

      // Keep booking in sync
      if (payModal.booking_id) {
        const { data: bk } = await supabase.from('bookings')
          .select('amount_paid, total_amount').eq('id', payModal.booking_id).single()
        if (bk) {
          const bkPaid = Number(bk.amount_paid) + payAmount
          await supabase.from('bookings').update({
            amount_paid: bkPaid,
            payment_status: bkPaid >= Number(bk.total_amount) ? 'paid' : 'partial',
          }).eq('id', payModal.booking_id)
        }
      }

      await logActivity(supabase, {
        action: 'BILLING_PAYMENT',
        details: `₱${payAmount.toLocaleString()} via ${payMethod} — Invoice ${payModal.invoice_number}`,
        table_name: 'invoices',
        record_id: payModal.id,
      })

      showToast(`₱${payAmount.toLocaleString()} recorded on ${payModal.invoice_number}.`)
      setPayModal(null)
      load()
    } catch (err: any) {
      showToast('Error: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }
  async function reprintReceipt(inv: any) {
  const [{ data: addons }, { data: posOrders }] = inv.booking_id
    ? await Promise.all([
        supabase.from('booking_addons').select('*').eq('booking_id', inv.booking_id).order('created_at'),
        supabase.from('orders')
          .select('id, order_number, total, created_at, order_items(quantity, unit_price, subtotal, menu_items(name))')
          .eq('booking_id', inv.booking_id)
          .eq('order_type', 'room_service')
          .order('created_at'),
      ])
    : [{ data: [] }, { data: [] }]

  const posLines = (posOrders ?? []).flatMap((o: any) =>
    (o.order_items ?? []).map((i: any) => ({
      label: (i.menu_items as any)?.name ?? 'Item',
      qty: i.quantity > 1 ? i.quantity : undefined,
      amount: Number(i.subtotal),
    }))
  )
  const addonLines = (addons ?? []).map((a: any) => ({
    label: a.name,
    qty: a.quantity > 1 ? a.quantity : undefined,
    amount: Number(a.total_price ?? a.unit_price * a.quantity),
  }))

  const isAccommodation = inv.bookings?.accommodation_type !== 'day_use'
  const roomLabel = inv.bookings?.rooms?.room_number
    ? `Room ${inv.bookings.rooms.room_number}`
    : inv.bookings?.cottages?.name ?? 'Accommodation'

  const lineItems = isAccommodation
  ? [
      { label: roomLabel, amount: Number(inv.subtotal) },
      ...posLines,
      ...addonLines,
    ]
  : (posLines.length > 0 || addonLines.length > 0)
      ? [...posLines, ...addonLines]
      : [{ label: 'Day/Night Pass Entry', amount: Number(inv.total) }]

  printReceipt({
    title: resortSettings.resort_name,
    subtitle: resortSettings.address,
    receiptNumber: inv.invoice_number,
    receiptType: isAccommodation ? 'Official Receipt' : 'Day/Night Pass Receipt',
    date: new Date(inv.created_at).toLocaleDateString('en-PH', { dateStyle: 'medium' }),
    guestName: inv.guests?.full_name ?? 'Guest',
    guestContact: inv.guests?.phone ?? undefined,
    checkindate: new Date(inv.bookings?.check_in_date).toLocaleDateString('en-PH', { dateStyle: 'medium' }) ?? 'Check in date',
    checkoutdate: new Date(inv.bookings?.check_out_date).toLocaleDateString('en-PH', { dateStyle: 'medium' }) ?? 'Check out date',
    lineItems,
    total: Number(inv.total),
    amountPaid: Number(inv.paid),
    balance: Number(inv.balance),
    paymentMethod: 'cash',
    footerNote: `Invoice: ${inv.invoice_number} · Reprinted: ${new Date().toLocaleDateString('en-PH', { dateStyle: 'medium' })}` ,
  } as any)
}


  const filtered = filter === 'all' ? invoices : invoices.filter(i => i.status === filter)

  const totals = {
    outstanding: invoices.filter(i => i.status !== 'paid' && i.status !== 'voided').reduce((s, i) => s + Number(i.balance), 0),
    collected: invoices.reduce((s, i) => s + Number(i.paid), 0),
    invoices: invoices.length,
  }

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50 max-w-xs">
          {toast}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-gray-100 rounded-xl p-3">
          <div className="text-xs text-gray-400 mb-0.5">Total Invoices</div>
          <div className="text-xl font-semibold text-gray-800">{totals.invoices}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-3">
          <div className="text-xs text-gray-400 mb-0.5">Outstanding</div>
          <div className="text-xl font-semibold text-red-600">₱{totals.outstanding.toLocaleString()}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-3">
          <div className="text-xs text-gray-400 mb-0.5">Collected</div>
          <div className="text-xl font-semibold text-green-600">₱{totals.collected.toLocaleString()}</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-1 w-fit">
        {(['all', 'unpaid', 'partial', 'paid'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-md text-xs capitalize ${filter === f ? 'bg-white font-medium shadow-sm' : 'text-gray-500'}`}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5">Invoice</th>
                <th className="text-left px-4 py-2.5">Guest</th>
                <th className="text-left px-4 py-2.5">Booking</th>
                <th className="text-left px-4 py-2.5">Accomodation Type</th>
                <th className="text-left px-4 py-2.5">Total</th>
                <th className="text-left px-4 py-2.5">Paid</th>
                <th className="text-left px-4 py-2.5">Balance</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-xs">No invoices found.</td></tr>
              ) : filtered.map(inv => (
                <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-blue-700">{inv.invoice_number}</td>
                  <td className="px-4 py-2.5">
                    <div className="text-gray-700">{inv.guests?.full_name ?? '—'}</div>
                    {inv.guests?.phone && <div className="text-xs text-gray-400">{inv.guests.phone}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{inv.bookings?.booking_number ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{inv.bookings?.accommodation_type ?? '—'}</td>
                  <td className="px-4 py-2.5">₱{Number(inv.total).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-green-600">₱{Number(inv.paid).toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <span className={Number(inv.balance) > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                      ₱{Number(inv.balance).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColor[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 flex gap-1.5">
                    <button onClick={() => openDetail(inv)}
                      className="px-2.5 py-1 border border-gray-200 hover:bg-gray-50 text-xs rounded-lg text-gray-600">
                      Details
                    </button>
                    <button onClick={() => reprintReceipt(inv)}
                      className="px-2.5 py-1 border border-gray-200 hover:bg-gray-50 text-xs rounded-lg text-gray-600">
                      🖨 Reprint
                    </button>
                    {Number(inv.balance) > 0 && (
                      <button onClick={() => openPay(inv)}
                        className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg">
                        Pay
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Details modal — view-only breakdown */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDetailModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-0.5">{detailModal.invoice_number}</div>
            <div className="text-xs text-gray-400 mb-3">
              {detailModal.guests?.full_name} · {detailModal.bookings?.booking_number}
            </div>

            <div className="text-sm space-y-1.5 bg-gray-50 rounded-lg p-3 mb-4">
              {detailModal.bookings?.rooms && (
                <div className="flex justify-between text-gray-600">
                  <span>Room {detailModal.bookings.rooms.room_number}</span>
                  <span>₱{Number(detailModal.subtotal).toLocaleString()}</span>
                </div>
              )}
             
              {detailPosOrders.length > 0 && (
                <>
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide pt-1">🍽️ Restaurant Orders</div>
                  {detailPosOrders.map((o: any) => (
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
              {detailAddons.map((a: any) => (
                <div key={a.id} className="flex justify-between text-gray-600">
                  <span>{a.name}{a.quantity > 1 ? ` × ${a.quantity}` : ''}</span>
                  <span>₱{Number(a.total_price ?? a.unit_price * a.quantity).toLocaleString()}</span>
                </div>
              ))}
              {detailAddons.length === 0 && detailPosOrders.length === 0 && !detailModal.bookings?.rooms && (
                <div className="text-xs text-gray-400 italic">No itemized breakdown available.</div>
              )}
              <div className="flex justify-between font-medium text-gray-800 border-t border-gray-200 pt-1.5 mt-1">
                <span>Total</span><span>₱{Number(detailModal.total).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>Paid</span><span>₱{Number(detailModal.paid).toLocaleString()}</span>
              </div>
              <div className={`flex justify-between font-medium ${Number(detailModal.balance) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                <span>Balance</span><span>₱{Number(detailModal.balance).toLocaleString()}</span>
              </div>
            </div>

            {detailModal.notes && (
              <div className="text-xs text-gray-400 mb-3">{detailModal.notes}</div>
            )}

            <div className="flex gap-2">
              {Number(detailModal.balance) > 0 && (
                <button onClick={() => { setDetailModal(null); openPay(detailModal) }}
                  className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-lg">
                  Record Payment
                </button>
              )}
              <button onClick={() => setDetailModal(null)}
                className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {payModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !submitting && setPayModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-0.5">Record Payment</div>
            <div className="text-xs text-gray-400 mb-3">
              {payModal.invoice_number} · {payModal.guests?.full_name}
            </div>

            {/* Compact breakdown */}
            <div className="text-xs space-y-1 bg-gray-50 rounded-lg p-3 mb-3">
              {payPosOrders.length > 0 && (
                <>
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">🍽️ Restaurant Orders</div>
                  {payPosOrders.map((o: any) => (
                    <div key={o.id}>
                      <div className="text-[10px] text-gray-400">{o.order_number}</div>
                      {(o.order_items ?? []).map((i: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-gray-500 pl-2">
                          <span>{(i.menu_items as any)?.name ?? 'Item'}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</span>
                          <span>₱{Number(i.subtotal).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}
              {addons.map((a: any) => (
                <div key={a.id} className="flex justify-between text-gray-500">
                  <span>{a.name}{a.quantity > 1 ? ` × ${a.quantity}` : ''}</span>
                  <span>₱{Number(a.total_price ?? a.unit_price * a.quantity).toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between font-medium text-gray-700 border-t border-gray-200 pt-1 mt-1">
                <span>Invoice Total</span><span>₱{Number(payModal.total).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>Already Paid</span><span>₱{Number(payModal.paid).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-medium text-red-600">
                <span>Balance Due</span><span>₱{Number(payModal.balance).toLocaleString()}</span>
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">Amount to Pay Now</label>
              <input type="number" value={payAmount}
                onChange={e => setPayAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>

            <PaymentCalculator
              totalDue={payAmount}
              method={payMethod}
              onMethodChange={setPayMethod}
              amountTendered={tendered}
              onAmountTenderedChange={setTendered}
            />

            {payAmount < Number(payModal.balance) && payAmount > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 text-xs text-amber-700 mt-3">
                Partial payment. Remaining balance after this: ₱{(Number(payModal.balance) - payAmount).toLocaleString()}
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button onClick={submitPayment} disabled={submitting || payAmount <= 0}
                className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm rounded-lg">
                {submitting ? 'Saving...' : 'Confirm Payment'}
              </button>
              <button onClick={() => setPayModal(null)} disabled={submitting}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
