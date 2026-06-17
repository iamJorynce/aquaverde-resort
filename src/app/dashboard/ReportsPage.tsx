'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ReportsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [revenue, setRevenue] = useState({ total: 0, byType: {} as Record<string, number> })
  const [bookingStats, setBookingStats] = useState({ total: 0, byStatus: {} as Record<string, number> })
  const [occupancy, setOccupancy] = useState({ rate: 0, occupied: 0, total: 0 })
  const [topGuests, setTopGuests] = useState<any[]>([])
  const [from, setFrom] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))

  async function load() {
    setLoading(true)

    const [{ data: txns }, { data: bookings }, { data: rooms }, { data: guests }] = await Promise.all([
      supabase.from('transactions').select('amount, txn_type, created_at')
        .gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`).eq('voided', false),
      supabase.from('bookings').select('status, created_at')
        .gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`),
      supabase.from('rooms').select('status'),
      supabase.from('guests').select('full_name, loyalty_points, loyalty_tier').order('loyalty_points', { ascending: false }).limit(5),
    ])

    const totalRevenue = (txns ?? []).reduce((s, t) => s + Number(t.amount), 0)
    const byType = (txns ?? []).reduce((acc: Record<string, number>, t) => {
      acc[t.txn_type] = (acc[t.txn_type] ?? 0) + Number(t.amount)
      return acc
    }, {})

    const byStatus = (bookings ?? []).reduce((acc: Record<string, number>, b) => {
      acc[b.status] = (acc[b.status] ?? 0) + 1
      return acc
    }, {})

    const roomCount = (rooms ?? []).length
    const occupiedCount = (rooms ?? []).filter(r => r.status === 'occupied').length

    setRevenue({ total: totalRevenue, byType })
    setBookingStats({ total: bookings?.length ?? 0, byStatus })
    setOccupancy({
      rate: roomCount > 0 ? Math.round((occupiedCount / roomCount) * 100) : 0,
      occupied: occupiedCount,
      total: roomCount,
    })
    setTopGuests(guests ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [from, to])

  const maxTypeRevenue = Math.max(1, ...Object.values(revenue.byType))

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
        <span className="text-gray-400 text-sm">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">Total Revenue</div>
              <div className="text-2xl font-semibold text-gray-800">₱{revenue.total.toLocaleString()}</div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">Total Bookings</div>
              <div className="text-2xl font-semibold text-gray-800">{bookingStats.total}</div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">Occupancy Rate</div>
              <div className="text-2xl font-semibold text-gray-800">{occupancy.rate}%</div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">Occupied Rooms</div>
              <div className="text-2xl font-semibold text-gray-800">{occupancy.occupied}/{occupancy.total}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="text-sm font-medium text-gray-700 mb-3">Revenue by Category</div>
              {Object.keys(revenue.byType).length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-6">No revenue in this period.</div>
              ) : Object.entries(revenue.byType).map(([type, amt]) => (
                <div key={type} className="flex items-center gap-2 mb-2 text-xs">
                  <span className="w-20 text-gray-500 capitalize text-right">{type.replace('_', ' ')}</span>
                  <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                    <div className="h-full bg-blue-700 rounded" style={{ width: `${(amt / maxTypeRevenue) * 100}%` }} />
                  </div>
                  <span className="w-20 text-gray-600">₱{amt.toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="text-sm font-medium text-gray-700 mb-3">Bookings by Status</div>
              {Object.keys(bookingStats.byStatus).length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-6">No bookings in this period.</div>
              ) : Object.entries(bookingStats.byStatus).map(([status, count]) => (
                <div key={status} className="flex justify-between text-sm py-1.5 border-b border-gray-50">
                  <span className="text-gray-600 capitalize">{status.replace('_', ' ')}</span>
                  <span className="font-medium text-gray-700">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-sm font-medium text-gray-700 mb-3">Top Guests by Loyalty Points</div>
            <table className="w-full text-sm">
              <tbody>
                {topGuests.map((g, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 text-gray-700">{g.full_name}</td>
                    <td className="py-2 text-right text-gray-500 capitalize">{g.loyalty_tier}</td>
                    <td className="py-2 text-right font-medium text-blue-700">{g.loyalty_points} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
