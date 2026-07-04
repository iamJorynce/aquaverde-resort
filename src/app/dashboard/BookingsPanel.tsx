'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const STATUS_COLOR: Record<string, string> = {
  pending:     'bg-yellow-100 text-yellow-700',
  confirmed:   'bg-blue-100 text-blue-700',
  reserved:    'bg-purple-100 text-purple-700',
  checked_in:  'bg-green-100 text-green-700',
  checked_out: 'bg-gray-100 text-gray-600',
  cancelled:   'bg-red-100 text-red-700',
  no_show:     'bg-orange-100 text-orange-700',
}

export default function BookingsPanel() {
  const supabase = createClient()
  const [tab, setTab] = useState<'pending' | 'all'>('pending')
  const [pending, setPending] = useState<any[]>([])
  const [all, setAll] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  async function load() {
    setLoading(true)
    const [{ data: pendingData }, { data: allData }] = await Promise.all([
      supabase.from('bookings')
        .select('*, guests(full_name, email, phone), rooms(room_number)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase.from('bookings')
        .select('*, guests(full_name, email, phone), rooms(room_number)')
        .order('created_at', { ascending: false })
        .limit(100),
    ])
    setPending(pendingData ?? [])
    setAll(allData ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500) }

  async function approveBooking(b: any) {
    const { error } = await supabase.from('bookings').update({
      status: 'confirmed',
    }).eq('id', b.id)
    if (error) { showToast('Error: ' + error.message); return }
    showToast(`${b.booking_number} confirmed.`)
    load()
  }

  async function rejectBooking(b: any) {
    if (!rejectReason) { showToast('Please enter a reason.'); return }
    const { error } = await supabase.from('bookings').update({
      status: 'cancelled',
      special_requests: (b.special_requests ? b.special_requests + '\n' : '') + `Rejected: ${rejectReason}`,
    }).eq('id', b.id)
    if (error) { showToast('Error: ' + error.message); return }
    showToast(`${b.booking_number} rejected.`)
    setRejecting(null)
    setRejectReason('')
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

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setTab('pending')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 ${tab === 'pending' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
          Pending Approval
          {pending.length > 0 && (
            <span className="bg-yellow-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{pending.length}</span>
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
          {/* Pending tab */}
          {tab === 'pending' && (
            <div className="space-y-3">
              {pending.length === 0 ? (
                <div className="text-center py-12 bg-white border border-gray-100 rounded-xl text-gray-400 text-sm">
                  No pending bookings — you're all caught up! 🎉
                </div>
              ) : pending.map(b => (
                <div key={b.id} className="bg-white border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-semibold text-blue-700">{b.booking_number}</div>
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
                      <div className="font-semibold text-blue-700">₱{Number(b.total_amount).toLocaleString()}</div>
                      <div className="text-xs text-gray-400">Res. fee on arrival</div>
                    </div>
                  </div>

                  {b.special_requests && (
                    <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5 mb-3">
                      Request: {b.special_requests}
                    </div>
                  )}

                  {rejecting === b.id ? (
                    <div className="flex gap-2 mt-2">
                      <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                        placeholder="Reason for rejection..."
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
                      <button onClick={() => rejectBooking(b)}
                        className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg">Confirm Reject</button>
                      <button onClick={() => { setRejecting(null); setRejectReason('') }}
                        className="px-3 py-2 border border-gray-200 text-gray-600 text-xs rounded-lg">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => approveBooking(b)}
                        className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium">
                        ✓ Approve & Confirm
                      </button>
                      <button onClick={() => setRejecting(b.id)}
                        className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-sm rounded-lg">
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* All bookings tab */}
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
                    <th className="text-right px-4 py-2.5">Amount</th>
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
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{b.check_in_date}</td>
                      <td className="px-4 py-2.5 text-gray-500">{b.check_out_date}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLOR[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {b.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">₱{Number(b.total_amount).toLocaleString()}</td>
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
