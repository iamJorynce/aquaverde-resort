'use client'

import { useEffect, useState, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'

const STATUS_COLOR: Record<string, string> = {
  pending:     'bg-yellow-100 text-yellow-700',
  confirmed:   'bg-blue-100 text-blue-700',
  checked_in:  'bg-green-100 text-green-700',
  checked_out: 'bg-gray-100 text-gray-600',
  cancelled:   'bg-red-100 text-red-700',
  no_show:     'bg-orange-100 text-orange-700',
}

export default function BookingsPanel() {
  const supabase = createClient()
  const [tab, setTab] = useState<'pending' | 'confirmed' | 'all'>('pending')
  const [pendingGroups, setPendingGroups] = useState<any[]>([])
  const [confirmed, setConfirmed] = useState<any[]>([])
  const [all, setAll] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [imageModal, setImageModal] = useState<string | null>(null)
  const [approving, setApproving] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [refundDeposit, setRefundDeposit] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: pendingData }, { data: confirmedData }, { data: allData }] = await Promise.all([
      supabase.from('bookings')
        .select('*, guests(full_name, email, phone), rooms(room_number)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase.from('bookings')
        .select('*, guests(full_name, email, phone), rooms(room_number)')
        .eq('status', 'confirmed')
        .order('check_in_date', { ascending: true }),
      supabase.from('bookings')
        .select('*, guests(full_name, email, phone), rooms(room_number)')
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    setConfirmed(confirmedData ?? [])

    const groups: Record<string, any[]> = {}
    ;(pendingData ?? []).forEach((b: any) => {
      const key = b.group_number ?? b.id
      if (!groups[key]) groups[key] = []
      groups[key].push(b)
    })

    const groupCards = Object.values(groups).map(bookings => {
      const primary = bookings.find(b => b.is_group_primary !== false) ?? bookings[0]
      return {
        key: primary.group_number ?? primary.id,
        primary,
        allBookings: bookings,
        roomLabels: bookings.map((b: any) => b.rooms?.room_number ? `Room ${b.rooms.room_number}` : b.booking_number),
      }
    })

    setPendingGroups(groupCards)
    setAll(allData ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Auto-refresh whenever any booking row changes — new online booking
  // submissions, staff approving/rejecting elsewhere, etc. — so front
  // desk sees new pending bookings appear without manually refreshing.
  useEffect(() => {
    const channel = supabase
      .channel('bookings-panel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => load()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500) }

  async function approveGroup(group: any) {
    setApproving(group.key)

    // The group's total bill = sum of every room's total_amount.
    // The deposit actually collected = 50% of that total (matches the
    // formula used when the guest booked online). Verifying payment here
    // means crediting that deposit to amount_paid — without this, the
    // check-in balance screen will incorrectly ask for the FULL bill
    // again, since amount_paid stays 0 until this step.
    const groupTotal = group.allBookings.reduce((s: number, b: any) => s + Number(b.total_amount), 0)
    const depositAmount = Math.ceil(groupTotal * 0.5)

    // Distribute the deposit across each room proportionally to its share
    // of the group total, same approach used in the walk-in booking flow —
    // keeps each individual booking's own total_amount/amount_paid pair
    // internally consistent for later checkout/check-in balance math.
    for (const b of group.allBookings) {
      const share = groupTotal > 0
        ? Math.round((Number(b.total_amount) / groupTotal) * depositAmount)
        : 0
      const { error } = await supabase.from('bookings').update({
        status: 'confirmed',
        amount_paid: share,
        payment_status: share >= Number(b.total_amount) ? 'paid' : 'partial',
      }).eq('id', b.id)
      if (error) { showToast('Error: ' + error.message); setApproving(null); return }
    }

    // Record the verified deposit as a transaction so it shows up in
    // reports and remittance once collected.
    await supabase.from('transactions').insert({
      status: 'completed',
      txn_number: `TXN-${Date.now()}`,
      booking_id: group.primary.id,
      guest_id: group.primary.guest_id,
      txn_type: 'reservation_fee',
      description: `Deposit verified — ${group.roomLabels.join(', ')} (${group.primary.booking_number})`,
      amount: depositAmount,
      payment_method: group.primary.payment_method_used || 'gcash',
    })

    // Fire off the guest's confirmation email/SMS now that payment is
    // verified. One call per room in the group, since the edge function
    // builds its email around a single booking row. Best-effort: a failed
    // send here shouldn't undo the confirmation staff just made — the
    // booking stays confirmed either way, we just surface a toast. Only
    // the email channel matters for this toast — an SMS-only failure
    // (e.g. SMS provider not yet approved) shouldn't read as "email failed".
    const notifyResults = await Promise.allSettled(
      group.allBookings.map((b: any) =>
        supabase.functions.invoke('send-booking-confirmation', { body: { booking_id: b.id } })
      )
    )
    const emailFailed = notifyResults.some(r =>
      r.status === 'rejected' || (r as any).value?.error || (r as any).value?.data?.failures?.email
    )

    showToast(
      emailFailed
        ? `${group.roomLabels.join(', ')} confirmed. ₱${depositAmount.toLocaleString()} deposit credited. (Confirmation email failed to send — check manually.)`
        : `${group.roomLabels.join(', ')} confirmed. ₱${depositAmount.toLocaleString()} deposit credited. Confirmation email sent.`
    )
    setApproving(null)
    load()
  }

  async function rejectGroup(group: any) {
    if (!rejectReason) { showToast('Please enter a reason.'); return }
    for (const b of group.allBookings) {
      await supabase.from('bookings').update({
        status: 'cancelled',
        special_requests: (b.special_requests ? b.special_requests + '\n' : '') + `Rejected: ${rejectReason}`,
      }).eq('id', b.id)
    }
    showToast(`${group.roomLabels.join(', ')} rejected.`)
    setRejecting(null)
    setRejectReason('')
    load()
  }

  async function cancelConfirmedBooking(b: any) {
    if (!cancelReason) { showToast('Please enter a reason.'); return }

    // Cancel every room in the same group (matches how a group was
    // originally confirmed together), or just this booking if it's solo.
    const groupBookings = b.group_number
      ? confirmed.filter(c => c.group_number === b.group_number)
      : [b]

    for (const gb of groupBookings) {
      const update: Record<string, any> = {
        status: 'cancelled',
        special_requests: (gb.special_requests ? gb.special_requests + '\n' : '') + `Cancelled: ${cancelReason}`,
      }
      if (refundDeposit && Number(gb.amount_paid) > 0) {
        update.amount_paid = 0
        update.payment_status = 'refunded'
      }
      const { error } = await supabase.from('bookings').update(update).eq('id', gb.id)
      if (error) { showToast('Error: ' + error.message); return }
    }

    // Log the refund as a transaction so it's reflected in reports/remittance.
    if (refundDeposit) {
      const refundTotal = groupBookings.reduce((s: number, gb: any) => s + Number(gb.amount_paid || 0), 0)
      if (refundTotal > 0) {
        await supabase.from('transactions').insert({
          status: 'completed',
          txn_number: `TXN-${Date.now()}`,
          booking_id: b.id,
          guest_id: b.guest_id,
          txn_type: 'refund',
          description: `Deposit refund — booking cancelled (${b.booking_number}): ${cancelReason}`,
          amount: -refundTotal,
          payment_method: b.payment_method_used || 'cash',
        })
      }
    }

    showToast(`${b.booking_number} cancelled.`)
    setCancelling(null)
    setCancelReason('')
    setRefundDeposit(false)
    load()
  }

  const nights = (b: any) => Math.max(1, Math.ceil(
    (new Date(b.check_out_date).getTime() - new Date(b.check_in_date).getTime()) / 86400000
  ))

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50">
          {toast}
        </div>
      )}

      {imageModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setImageModal(null)}>
          <img src={imageModal} alt="Payment proof" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setTab('pending')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 ${tab === 'pending' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
          Pending Approval
          {pendingGroups.length > 0 && (
            <span className="bg-yellow-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{pendingGroups.length}</span>
          )}
        </button>
        <button onClick={() => setTab('confirmed')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 ${tab === 'confirmed' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
          Confirmed
          {confirmed.length > 0 && (
            <span className="bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{confirmed.length}</span>
          )}
        </button>
        <button onClick={() => setTab('all')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium ${tab === 'all' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
          All Bookings
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : (
        <>
          {tab === 'pending' && (
            <div className="space-y-3">
              {pendingGroups.length === 0 ? (
                <div className="text-center py-12 bg-white border border-gray-100 rounded-xl text-gray-400 text-sm">
                  No pending bookings — you're all caught up! 🎉
                </div>
              ) : pendingGroups.map(group => {
                const b = group.primary
                const hasProof = !!b.payment_proof_url
                const groupTotal = group.allBookings.reduce((s: number, gb: any) => s + Number(gb.total_amount), 0)
                const depositPreview = Math.ceil(groupTotal * 0.5)

                return (
                  <div key={group.key} className="bg-white border border-gray-100 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-semibold text-blue-700">
                          {group.roomLabels.join(', ')}
                          {group.allBookings.length > 1 && <span className="text-xs text-gray-400 ml-1">({group.allBookings.length} rooms)</span>}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Online booking · {new Date(b.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2.5 py-1 rounded-full font-medium">Pending</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="text-xs text-gray-400 mb-0.5">Guest</div>
                        <div className="font-medium text-gray-800">{(b.guests as any)?.full_name}</div>
                        <div className="text-xs text-gray-400">{(b.guests as any)?.phone || (b.guests as any)?.email}</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="text-xs text-gray-400 mb-0.5">Check-in</div>
                        <div className="font-medium text-gray-800">{new Date(b.check_in_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</div>
                        <div className="text-xs text-gray-400">{nights(b)} night{nights(b) > 1 ? 's' : ''}</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="text-xs text-gray-400 mb-0.5">Check-out</div>
                        <div className="font-medium text-gray-800">{new Date(b.check_out_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</div>
                        <div className="text-xs text-gray-400">{b.num_adults} adult{b.num_adults > 1 ? 's' : ''}{b.num_children > 0 ? `, ${b.num_children} child` : ''}</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="text-xs text-gray-400 mb-0.5">Total Bill</div>
                        <div className="font-semibold text-blue-700">₱{groupTotal.toLocaleString()}</div>
                        <div className="text-xs text-gray-400">Deposit: ₱{depositPreview.toLocaleString()}</div>
                      </div>
                    </div>

                    <div className={`rounded-lg p-3 mb-3 border ${hasProof ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Deposit Payment Proof</div>
                      {hasProof ? (
                        <div className="flex items-center gap-3">
                          <img
                            src={b.payment_proof_url}
                            alt="Payment proof"
                            onClick={() => setImageModal(b.payment_proof_url)}
                            className="w-20 h-20 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80"
                          />
                          <div className="text-sm flex-1">
                            <div><span className="text-gray-400">Method:</span> <span className="font-medium capitalize">{b.payment_method_used?.replace('_', ' ')}</span></div>
                            <div><span className="text-gray-400">Reference:</span> <span className="font-medium">{b.payment_reference}</span></div>
                            <div><span className="text-gray-400">Submitted:</span> <span className="font-medium">{b.payment_submitted_at ? new Date(b.payment_submitted_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
                          </div>
                          <button onClick={() => setImageModal(b.payment_proof_url)}
                            className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 px-2.5 py-1 rounded-lg">
                            View Full
                          </button>
                        </div>
                      ) : (
                        <div className="text-sm text-red-600">⚠ No payment proof submitted for this booking.</div>
                      )}
                    </div>

                    {b.special_requests && (
                      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5 mb-3">
                        {b.special_requests}
                      </div>
                    )}

                    {rejecting === group.key ? (
                      <div className="flex gap-2 mt-2">
                        <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                          placeholder="Reason for rejection (e.g. invalid proof, no matching payment)..."
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
                        <button onClick={() => rejectGroup(group)}
                          className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg">Confirm Reject</button>
                        <button onClick={() => { setRejecting(null); setRejectReason('') }}
                          className="px-3 py-2 border border-gray-200 text-gray-600 text-xs rounded-lg">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => approveGroup(group)} disabled={approving === group.key}
                          className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm rounded-lg font-medium">
                          {approving === group.key ? 'Confirming...' : `✓ Verify Payment & Confirm (₱${depositPreview.toLocaleString()} deposit)`}
                        </button>
                        <button onClick={() => setRejecting(group.key)} disabled={approving === group.key}
                          className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-sm rounded-lg">
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'confirmed' && (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5">Booking #</th>
                    <th className="text-left px-4 py-2.5">Guest</th>
                    <th className="text-left px-4 py-2.5">Room</th>
                    <th className="text-left px-4 py-2.5">Check-in</th>
                    <th className="text-left px-4 py-2.5">Check-out</th>
                    <th className="text-right px-4 py-2.5">Paid / Total</th>
                    <th className="text-right px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {confirmed.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-xs">No confirmed bookings.</td></tr>
                  ) : confirmed.map(b => (
                    <Fragment key={b.id}>
                    <tr className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-blue-700">{b.booking_number}</td>
                      <td className="px-4 py-2.5">
                        <div className="text-gray-700">{(b.guests as any)?.full_name ?? '—'}</div>
                        <div className="text-xs text-gray-400">{(b.guests as any)?.phone}</div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {(b.rooms as any)?.room_number ? `Room ${(b.rooms as any).room_number}` : '—'}
                        {b.group_number && <span className="text-xs text-blue-400 ml-1">· group</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{b.check_in_date}</td>
                      <td className="px-4 py-2.5 text-gray-500">{b.check_out_date}</td>
                      <td className="px-4 py-2.5 text-right font-medium">
                        ₱{Number(b.amount_paid).toLocaleString()} / ₱{Number(b.total_amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => { setCancelling(cancelling === b.id ? null : b.id); setCancelReason(''); setRefundDeposit(false) }}
                          className="px-3 py-1 border border-red-200 text-red-600 hover:bg-red-50 text-xs rounded-lg font-medium">
                          {cancelling === b.id ? 'Close' : 'Cancel'}
                        </button>
                      </td>
                    </tr>
                    {cancelling === b.id && (
                      <tr className="border-b border-gray-50 bg-red-50/40">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex flex-col gap-2">
                            <input value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                              placeholder="Reason for cancellation (e.g. guest requested, no-show, duplicate booking)..."
                              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full" />
                            {Number(b.amount_paid) > 0 && (
                              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                                <input type="checkbox" checked={refundDeposit}
                                  onChange={e => setRefundDeposit(e.target.checked)} />
                                Refund the ₱{Number(b.amount_paid).toLocaleString()} deposit already collected
                              </label>
                            )}
                            <div className="flex gap-2">
                              <button onClick={() => cancelConfirmedBooking(b)}
                                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg font-medium">
                                Confirm Cancellation
                              </button>
                              <button onClick={() => setCancelling(null)}
                                className="px-4 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs rounded-lg">
                                Never mind
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'all' && (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5">Booking #</th>
                    <th className="text-left px-4 py-2.5">Guest</th>
                    <th className="text-left px-4 py-2.5">Room</th>
                    <th className="text-left px-4 py-2.5">Check-in</th>
                    <th className="text-left px-4 py-2.5">Check-out</th>
                    <th className="text-left px-4 py-2.5">Status</th>
                    <th className="text-right px-4 py-2.5">Paid / Total</th>
                  </tr>
                </thead>
                <tbody>
                  {all.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-xs">No bookings yet.</td></tr>
                  ) : all.map(b => (
                    <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-blue-700">{b.booking_number}</td>
                      <td className="px-4 py-2.5">
                        <div className="text-gray-700">{(b.guests as any)?.full_name ?? '—'}</div>
                        <div className="text-xs text-gray-400">{(b.guests as any)?.phone}</div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {(b.rooms as any)?.room_number ? `Room ${(b.rooms as any).room_number}` : '—'}
                        {b.group_number && <span className="text-xs text-blue-400 ml-1">· group</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{b.check_in_date}</td>
                      <td className="px-4 py-2.5 text-gray-500">{b.check_out_date}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLOR[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {b.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">
                        ₱{Number(b.amount_paid).toLocaleString()} / ₱{Number(b.total_amount).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
