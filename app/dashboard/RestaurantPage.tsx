'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from './permissions'

const statusColor: Record<string, string> = {
  pending:   'bg-blue-100 text-blue-700',
  preparing: 'bg-yellow-100 text-yellow-700',
  ready:     'bg-purple-100 text-purple-700',
  served:    'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const nextStatus: Record<string, string> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'served',
}

const nextLabel: Record<string, string> = {
  pending: 'Start Preparing',
  preparing: 'Mark Ready',
  ready: 'Mark Served',
}

export default function RestaurantPage() {
  const supabase = createClient()
  const { can } = usePermissions()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, menu_items(name)), bookings(booking_number, rooms(room_number))')
      .in('status', ['pending', 'preparing', 'ready'])
      .order('created_at', { ascending: true })
    setOrders(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function advanceStatus(order: any) {
    const newStatus = nextStatus[order.status]
    if (!newStatus) return

    const updates: any = { status: newStatus }
    if (newStatus === 'served') updates.paid_at = order.paid_at ?? null

    const { error } = await supabase.from('orders').update(updates).eq('id', order.id)
    if (error) { showToast('Error: ' + error.message); return }
    showToast(`Order ${order.order_number} → ${newStatus}`)
    load()
  }

  async function cancelOrder(order: any) {
    const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
    if (error) { showToast('Error: ' + error.message); return }
    showToast(`Order ${order.order_number} cancelled.`)
    load()
  }

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50">
          {toast}
        </div>
      )}

      <div className="text-sm font-medium text-gray-700 mb-4">{orders.length} Active Orders</div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-400 text-sm">
              No active orders right now. Create one from the POS module.
            </div>
          ) : orders.map(o => (
            <div key={o.id} className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-gray-400">
                  {o.bookings ? `Room ${(o.bookings as any)?.rooms?.room_number}` : o.table_number ? `Table ${o.table_number}` : 'Walk-in'}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[o.status]}`}>
                  {o.status}
                </span>
              </div>
              <div className="text-sm font-medium text-gray-800 mb-2">{o.order_number}</div>
              <div className="text-xs text-gray-500 mb-3 space-y-0.5">
                {(o.order_items ?? []).map((it: any) => (
                  <div key={it.id}>{it.quantity}× {it.menu_items?.name}</div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">₱{Number(o.total).toLocaleString()}</span>
                {can('canManageKitchenOrders') ? (
                  <div className="flex gap-2">
                    {o.status !== 'cancelled' && nextStatus[o.status] && (
                      <button onClick={() => advanceStatus(o)}
                        className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg">
                        {nextLabel[o.status]}
                      </button>
                    )}
                    <button onClick={() => cancelOrder(o)}
                      className="px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-xs rounded-lg">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 italic">View only</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
