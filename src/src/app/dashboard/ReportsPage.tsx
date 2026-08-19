'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type ReportSection = 'dashboard' | 'financial' | 'bookings' | 'inventory' | 'staff' | 'audit'

export default function ReportsPage() {
  const supabase = createClient()
  const [section, setSection] = useState<ReportSection>('dashboard')
  const [from, setFrom] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(false)

  // ---- Dashboard Summary ----
  const [summary, setSummary] = useState<any>(null)

  // ---- Financial ----
  const [dailySales, setDailySales]   = useState<any[]>([])
  const [byCategory, setByCategory]  = useState<any[]>([])
  const [byMethod, setByMethod]       = useState<any[]>([])

  // ---- Bookings ----
  const [reservations, setReservations] = useState<any[]>([])
  const [occupancy, setOccupancy]       = useState<any[]>([])
  const [guestHistory, setGuestHistory] = useState<any[]>([])

  // ---- Inventory ----
  const [stockLevels, setStockLevels]   = useState<any[]>([])
  const [stockMovements, setStockMovements] = useState<any[]>([])

  // ---- Staff / Activity ----
  const [userActivities, setUserActivities] = useState<any[]>([])

  // ---- Audit Trail ----
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditFilter, setAuditFilter] = useState('')

  useEffect(() => { loadSection() }, [section, from, to])

  async function loadSection() {
    setLoading(true)
    try {
      if (section === 'dashboard') await loadDashboard()
      else if (section === 'financial') await loadFinancial()
      else if (section === 'bookings') await loadBookings()
      else if (section === 'inventory') await loadInventory()
      else if (section === 'staff') await loadStaff()
      else if (section === 'audit') await loadAudit()
    } finally {
      setLoading(false)
    }
  }

  async function loadDashboard() {
    const [
      { data: txns },
      { data: bookings },
      { data: rooms },
      { data: dayUse },
      { data: guests },
    ] = await Promise.all([
      supabase.from('transactions').select('amount, txn_type').gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`).eq('voided', false),
      supabase.from('bookings').select('status').gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`),
      supabase.from('rooms').select('status'),
      supabase.from('day_use_entries').select('total_amount').gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`),
      supabase.from('guests').select('id').gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`),
    ])
    const totalRevenue  = (txns ?? []).reduce((s, t) => s + Number(t.amount), 0)
    const dayUseRevenue = (dayUse ?? []).reduce((s, d) => s + Number(d.total_amount), 0)
    const occupied      = (rooms ?? []).filter(r => r.status === 'occupied').length
    const totalRooms    = (rooms ?? []).length
    setSummary({
      totalRevenue,
      dayUseRevenue,
      totalBookings: bookings?.length ?? 0,
      checkedIn: (bookings ?? []).filter(b => b.status === 'checked_in').length,
      occupancyRate: totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0,
      newGuests: guests?.length ?? 0,
    })
  }

  async function loadFinancial() {
    const { data: txns } = await supabase
      .from('transactions')
      .select('amount, txn_type, payment_method, created_at')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`)
      .eq('voided', false)
      .order('created_at')

    // Daily sales — group by date
    const byDate: Record<string, number> = {}
    ;(txns ?? []).forEach(t => {
      const d = t.created_at.slice(0, 10)
      byDate[d] = (byDate[d] ?? 0) + Number(t.amount)
    })
    setDailySales(Object.entries(byDate).map(([date, total]) => ({ date, total })))

    // By category
    const byCat: Record<string, number> = {}
    ;(txns ?? []).forEach(t => { byCat[t.txn_type] = (byCat[t.txn_type] ?? 0) + Number(t.amount) })
    setByCategory(Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([type, total]) => ({ type, total })))

    // By payment method
    const byM: Record<string, number> = {}
    ;(txns ?? []).forEach(t => { byM[t.payment_method] = (byM[t.payment_method] ?? 0) + Number(t.amount) })
    setByMethod(Object.entries(byM).sort((a, b) => b[1] - a[1]).map(([method, total]) => ({ method, total })))
  }

  async function loadBookings() {
    const [{ data: bkData }, { data: rooms }] = await Promise.all([
      supabase.from('bookings')
        .select('booking_number, status, check_in_date, check_out_date, total_amount, guests(full_name), rooms(room_number), cottages(name)')
        .gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`)
        .order('created_at', { ascending: false }),
      supabase.from('rooms').select('status, room_number'),
    ])
    setReservations(bkData ?? [])

    // Occupancy by room
    const occ = (rooms ?? []).map(r => ({
      room: r.room_number,
      status: r.status,
    }))
    setOccupancy(occ)

    // Guest history — top guests by total spend
    const { data: topGuests } = await supabase
      .from('guests')
      .select('full_name, loyalty_points, loyalty_tier')
      .order('loyalty_points', { ascending: false })
      .limit(20)
    setGuestHistory(topGuests ?? [])
  }

  async function loadInventory() {
    const [{ data: items }, { data: movements }] = await Promise.all([
      supabase.from('inventory_items').select('name, current_stock, reorder_level, unit, inventory_categories(name)').eq('is_active', true).order('name'),
      supabase.from('inventory_movements').select('*, inventory_items(name)').gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`).order('created_at', { ascending: false }),
    ])
    setStockLevels(items ?? [])
    setStockMovements(movements ?? [])
  }

  async function loadStaff() {
    const { data } = await supabase
      .from('activity_logs')
      .select('user_name, user_role, action, details, created_at')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`)
      .order('created_at', { ascending: false })
      .limit(200)
    setUserActivities(data ?? [])
  }

  async function loadAudit() {
    let query = supabase
      .from('activity_logs')
      .select('user_name, user_role, action, details, table_name, created_at')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`)
      .order('created_at', { ascending: false })
      .limit(500)
    if (auditFilter) query = query.ilike('action', `%${auditFilter}%`)
    const { data } = await query
    setAuditLogs(data ?? [])
  }

  function formatCurrency(n: number) { return `₱${Number(n).toLocaleString()}` }
  function formatDate(s: string)     { return new Date(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) }
  function formatDateTime(s: string) { return new Date(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }

  const maxDailySales = Math.max(1, ...dailySales.map(d => d.total))
  const maxCatRevenue = Math.max(1, ...byCategory.map(c => c.total))

  const NAV: { id: ReportSection; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard Summary', icon: '📊' },
    { id: 'financial', label: 'Financial Reports',  icon: '💰' },
    { id: 'bookings',  label: 'Booking Reports',    icon: '📅' },
    { id: 'inventory', label: 'Inventory Reports',  icon: '📦' },
    { id: 'staff',     label: 'Staff Activities',   icon: '👥' },
    { id: 'audit',     label: 'Audit Trail',        icon: '🔍' },
  ]

  const statusColor: Record<string, string> = {
    available:   'bg-green-100 text-green-700',
    occupied:    'bg-red-100 text-red-700',
    reserved:    'bg-blue-100 text-blue-700',
    cleaning:    'bg-yellow-100 text-yellow-700',
    maintenance: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="flex gap-4">
      {/* Sidebar nav */}
      <div className="w-44 flex-shrink-0">
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          {NAV.map(n => (
            <button key={n.id} onClick={() => setSection(n.id)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left transition-colors border-b border-gray-50 last:border-0
                ${section === n.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Date range filter — shown for all sections */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
          {section === 'audit' && (
            <input value={auditFilter} onChange={e => { setAuditFilter(e.target.value); }}
              placeholder="Filter by action..."
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white w-44" />
          )}
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
        ) : (
          <>
            {/* ===== DASHBOARD SUMMARY ===== */}
            {section === 'dashboard' && summary && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Total Revenue',    value: formatCurrency(summary.totalRevenue),  sub: 'transactions' },
                    { label: 'Day Use Revenue',  value: formatCurrency(summary.dayUseRevenue), sub: 'entries' },
                    { label: 'New Bookings',     value: summary.totalBookings,                  sub: 'this period' },
                    { label: 'Currently Checked In', value: summary.checkedIn,                 sub: 'guests' },
                    { label: 'Occupancy Rate',   value: `${summary.occupancyRate}%`,            sub: 'of rooms' },
                    { label: 'New Guests',       value: summary.newGuests,                      sub: 'registered' },
                  ].map(s => (
                    <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-4">
                      <div className="text-xs text-gray-400 mb-0.5">{s.label}</div>
                      <div className="text-2xl font-semibold text-gray-800">{s.value}</div>
                      <div className="text-xs text-gray-400">{s.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ===== FINANCIAL ===== */}
            {section === 'financial' && (
              <div className="space-y-4">
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <div className="text-sm font-medium text-gray-700 mb-3">Daily Sales</div>
                  {dailySales.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">No transactions in this period.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {dailySales.map(d => (
                        <div key={d.date} className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 w-24">{formatDate(d.date)}</span>
                          <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                            <div className="h-full bg-blue-600 rounded" style={{ width: `${(d.total / maxDailySales) * 100}%` }} />
                          </div>
                          <span className="text-xs font-medium text-gray-700 w-24 text-right">{formatCurrency(d.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white border border-gray-100 rounded-xl p-4">
                    <div className="text-sm font-medium text-gray-700 mb-3">Revenue by Category</div>
                    {byCategory.length === 0 ? (
                      <div className="text-center py-4 text-gray-400 text-xs">No data.</div>
                    ) : byCategory.map(c => (
                      <div key={c.type} className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-gray-500 capitalize w-24">{c.type.replace('_', ' ')}</span>
                        <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                          <div className="h-full bg-green-600 rounded" style={{ width: `${(c.total / maxCatRevenue) * 100}%` }} />
                        </div>
                        <span className="text-xs font-medium text-gray-700 w-20 text-right">{formatCurrency(c.total)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-semibold text-gray-700 border-t border-gray-100 pt-2 mt-2">
                      <span>Total</span>
                      <span>{formatCurrency(byCategory.reduce((s, c) => s + c.total, 0))}</span>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-100 rounded-xl p-4">
                    <div className="text-sm font-medium text-gray-700 mb-3">Payment Methods</div>
                    {byMethod.length === 0 ? (
                      <div className="text-center py-4 text-gray-400 text-xs">No data.</div>
                    ) : byMethod.map(m => (
                      <div key={m.method} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                        <span className="text-gray-600 capitalize">{m.method.replace('_', ' ')}</span>
                        <span className="font-medium text-gray-700">{formatCurrency(m.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ===== BOOKINGS ===== */}
            {section === 'bookings' && (
              <div className="space-y-4">
                <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  <div className="text-sm font-medium text-gray-700 p-4 border-b border-gray-100">
                    Reservations ({reservations.length})
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2">Booking #</th>
                        <th className="text-left px-4 py-2">Guest</th>
                        <th className="text-left px-4 py-2">Room</th>
                        <th className="text-left px-4 py-2">Check-in</th>
                        <th className="text-left px-4 py-2">Check-out</th>
                        <th className="text-left px-4 py-2">Status</th>
                        <th className="text-right px-4 py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reservations.length === 0 ? (
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-xs">No bookings in this period.</td></tr>
                      ) : reservations.map(b => (
                        <tr key={b.booking_number} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2 text-blue-700 font-medium">{b.booking_number}</td>
                          <td className="px-4 py-2">{b.guests?.full_name ?? '—'}</td>
                          <td className="px-4 py-2 text-gray-500">{b.rooms?.room_number ? `Room ${b.rooms.room_number}` : b.cottages?.name ?? '—'}</td>
                          <td className="px-4 py-2 text-gray-500">{b.check_in_date}</td>
                          <td className="px-4 py-2 text-gray-500">{b.check_out_date}</td>
                          <td className="px-4 py-2 capitalize">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{b.status.replace('_', ' ')}</span>
                          </td>
                          <td className="px-4 py-2 text-right font-medium">{formatCurrency(b.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white border border-gray-100 rounded-xl p-4">
                    <div className="text-sm font-medium text-gray-700 mb-3">Room Occupancy Status</div>
                    <div className="grid grid-cols-3 gap-2">
                      {occupancy.map(r => (
                        <div key={r.room} className={`px-2 py-1.5 rounded-lg text-xs font-medium text-center ${statusColor[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          Room {r.room}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                    <div className="text-sm font-medium text-gray-700 p-4 border-b border-gray-100">Top Guests by Loyalty Points</div>
                    <table className="w-full text-sm">
                      <tbody>
                        {guestHistory.slice(0, 10).map((g, i) => (
                          <tr key={i} className="border-b border-gray-50">
                            <td className="px-4 py-2 text-gray-700">{g.full_name}</td>
                            <td className="px-4 py-2 text-gray-400 capitalize">{g.loyalty_tier}</td>
                            <td className="px-4 py-2 text-right text-blue-700 font-medium">{g.loyalty_points} pts</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ===== INVENTORY ===== */}
            {section === 'inventory' && (
              <div className="space-y-4">
                <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  <div className="text-sm font-medium text-gray-700 p-4 border-b border-gray-100">Stock Levels</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2">Item</th>
                        <th className="text-left px-4 py-2">Category</th>
                        <th className="text-right px-4 py-2">Current</th>
                        <th className="text-right px-4 py-2">Reorder Level</th>
                        <th className="text-left px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockLevels.length === 0 ? (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-xs">No inventory items.</td></tr>
                      ) : stockLevels.map((item: any) => {
                        const low = item.current_stock <= item.reorder_level
                        return (
                          <tr key={item.name} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium text-gray-700">{item.name}</td>
                            <td className="px-4 py-2 text-gray-400">{item.inventory_categories?.name ?? '—'}</td>
                            <td className="px-4 py-2 text-right">{item.current_stock} {item.unit}</td>
                            <td className="px-4 py-2 text-right text-gray-400">{item.reorder_level} {item.unit}</td>
                            <td className="px-4 py-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${low ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {low ? 'Low Stock' : 'OK'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  <div className="text-sm font-medium text-gray-700 p-4 border-b border-gray-100">
                    Stock Movements ({stockMovements.length})
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2">Item</th>
                        <th className="text-left px-4 py-2">Type</th>
                        <th className="text-right px-4 py-2">Quantity</th>
                        <th className="text-left px-4 py-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockMovements.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-xs">No movements in this period.</td></tr>
                      ) : stockMovements.map((m: any, i: number) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-700">{m.inventory_items?.name ?? '—'}</td>
                          <td className="px-4 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.movement_type === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {m.movement_type === 'in' ? 'Stock In' : 'Stock Out'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-medium">{m.quantity}</td>
                          <td className="px-4 py-2 text-gray-400 text-xs">{formatDateTime(m.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ===== STAFF ACTIVITIES ===== */}
            {section === 'staff' && (
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="text-sm font-medium text-gray-700 p-4 border-b border-gray-100">
                  User Activities ({userActivities.length})
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2">User</th>
                      <th className="text-left px-4 py-2">Role</th>
                      <th className="text-left px-4 py-2">Action</th>
                      <th className="text-left px-4 py-2">Details</th>
                      <th className="text-left px-4 py-2">Date/Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userActivities.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-xs">No activity in this period.</td></tr>
                    ) : userActivities.map((a, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-700">{a.user_name}</td>
                        <td className="px-4 py-2 text-gray-400 capitalize text-xs">{a.user_role?.replace('_', ' ')}</td>
                        <td className="px-4 py-2">
                          <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">{a.action}</span>
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-xs max-w-xs truncate">{a.details ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-400 text-xs whitespace-nowrap">{formatDateTime(a.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ===== AUDIT TRAIL ===== */}
            {section === 'audit' && (
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="text-sm font-medium text-gray-700 p-4 border-b border-gray-100">
                  Audit Trail ({auditLogs.length} entries)
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2">Date/Time</th>
                      <th className="text-left px-4 py-2">User</th>
                      <th className="text-left px-4 py-2">Role</th>
                      <th className="text-left px-4 py-2">Action</th>
                      <th className="text-left px-4 py-2">Details</th>
                      <th className="text-left px-4 py-2">Table</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-xs">No audit logs in this period.</td></tr>
                    ) : auditLogs.map((a, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">{formatDateTime(a.created_at)}</td>
                        <td className="px-4 py-2 text-gray-700">{a.user_name}</td>
                        <td className="px-4 py-2 text-gray-400 text-xs capitalize">{a.user_role?.replace('_', ' ')}</td>
                        <td className="px-4 py-2">
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-mono">{a.action}</span>
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-xs max-w-xs truncate">{a.details ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-400 text-xs">{a.table_name ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
