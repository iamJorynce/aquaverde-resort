'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import WalkInPage from './WalkInPage'
import CheckInOutPage from './CheckInOutPage'
import POSPage from './POSPage'
import RoomsPage from './RoomsPage'
import CottagesPage from './CottagesPage'
import DayUsePage from './DayUsePage'
import RestaurantPage from './RestaurantPage'
import HousekeepingPage from './HousekeepingPage'
import MaintenancePage from './MaintenancePage'
import InventoryPage from './InventoryPage'
import EquipmentPage from './EquipmentPage'
import GuestsPage from './GuestsPage'
import StaffPage from './StaffPage'
import BillingPage from './BillingPage'
import ReportsPage from './ReportsPage'
import SettingsPage from './SettingsPage'
import { canAccess, getAccessibleModules, ROLE_LABELS } from './permissions'

const NAV = [
  { id: 'dashboard',    icon: '📊', label: 'Dashboard' },
  { id: 'bookings',     icon: '📅', label: 'Bookings' },
  { id: 'walkin',       icon: '🚶', label: 'Walk-in' },
  { id: 'checkinout',   icon: '🚪', label: 'Check-in/Out' },
  { id: 'rooms',        icon: '🏠', label: 'Rooms' },
  { id: 'cottages',     icon: '⛺', label: 'Cottages' },
  { id: 'dayuse',       icon: '☀️', label: 'Day Use' },
  { id: 'pos',          icon: '🧾', label: 'POS / Cashier' },
  { id: 'restaurant',   icon: '🍽️', label: 'Restaurant' },
  { id: 'housekeeping', icon: '✨', label: 'Housekeeping' },
  { id: 'maintenance',  icon: '🔧', label: 'Maintenance' },
  { id: 'inventory',    icon: '📦', label: 'Inventory' },
  { id: 'equipment',    icon: '🛶', label: 'Equipment' },
  { id: 'guests',       icon: '👥', label: 'Guests' },
  { id: 'staff',        icon: '👤', label: 'Staff' },
  { id: 'billing',      icon: '📄', label: 'Billing' },
  { id: 'reports',      icon: '📈', label: 'Reports' },
  { id: 'settings',     icon: '⚙️', label: 'Settings' },
]

interface Stats {
  total_bookings: number
  todays_checkins: number
  todays_checkouts: number
  occupied_rooms: number
  available_rooms: number
  occupied_cottages: number
  revenue_today: number
  revenue_this_month: number
}

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [page, setPage] = useState('dashboard')
  const [stats, setStats] = useState<Stats | null>(null)
  const [rooms, setRooms] = useState<any[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [
        { data: prof },
        { data: st },
        { data: rm },
        { data: bk },
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('vw_dashboard_stats').select('*').single(),
        supabase.from('rooms').select('*, room_types_config(name, base_rate)').order('room_number').limit(20),
        supabase.from('bookings').select('*, guests(full_name)').order('created_at', { ascending: false }).limit(8),
      ])

      setProfile(prof)
      setStats(st)
      setRooms(rm ?? [])
      setBookings(bk ?? [])
      setLoading(false)

      // Guard: if this user somehow lands on a page they can't access
      // (e.g. browser back button, stale state), bounce to dashboard.
      if (!canAccess(prof?.role, page)) {
        setPage('dashboard')
      }
    }
    load()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const statusColor: Record<string, string> = {
    available:   'bg-green-100 text-green-700',
    occupied:    'bg-red-100 text-red-700',
    reserved:    'bg-blue-100 text-blue-700',
    cleaning:    'bg-yellow-100 text-yellow-700',
    maintenance: 'bg-gray-100 text-gray-700',
  }

  const bookingStatusColor: Record<string, string> = {
    pending:     'bg-yellow-100 text-yellow-700',
    confirmed:   'bg-blue-100 text-blue-700',
    checked_in:  'bg-green-100 text-green-700',
    checked_out: 'bg-gray-100 text-gray-600',
    cancelled:   'bg-red-100 text-red-700',
    no_show:     'bg-orange-100 text-orange-700',
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-30 w-56 bg-white border-r border-gray-100
        flex flex-col transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌊</span>
            <div>
              <div className="text-sm font-semibold text-gray-800">AquaVerde</div>
              <div className="text-xs text-gray-400">Beach Resort</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.filter(n => canAccess(profile?.role, n.id)).map(n => (
            <button
              key={n.id}
              onClick={() => { setPage(n.id); setSidebarOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors
                ${page === n.id
                  ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                }`}
            >
              <span className="text-base">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        {/* Profile */}
        <div className="p-4 border-t border-gray-100">
          <div className="text-xs font-medium text-gray-700 truncate">{profile?.full_name ?? 'User'}</div>
          <div className="text-xs text-gray-400 mb-2">{ROLE_LABELS[profile?.role] ?? profile?.role ?? ''}</div>
          <button onClick={handleLogout} className="text-xs text-red-500 hover:text-red-700">Sign out</button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <button className="md:hidden text-gray-500" onClick={() => setSidebarOpen(true)}>☰</button>
          <h1 className="text-sm font-semibold text-gray-800 flex-1 capitalize">
            {NAV.find(n => n.id === page)?.label ?? 'Dashboard'}
          </h1>
          <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
            {ROLE_LABELS[profile?.role] ?? profile?.role ?? ''}
          </span>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
          ) : !canAccess(profile?.role, page) ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="text-4xl mb-3">🔒</div>
              <div className="text-base font-medium text-gray-700 mb-1">Access restricted</div>
              <div className="text-sm text-gray-400">Your role ({ROLE_LABELS[profile?.role] ?? profile?.role}) doesn't have access to this module.</div>
              <button onClick={() => setPage('dashboard')} className="mt-4 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-lg">
                Back to Dashboard
              </button>
            </div>
          ) : (
            <>
              {/* DASHBOARD */}
              {page === 'dashboard' && (
                <div className="space-y-6">
                  {/* Quick Actions */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {[
                      { icon:'🚶', label:'Walk-in', page:'walkin' },
                      { icon:'📅', label:'New Booking', page:'bookings' },
                      { icon:'🚪', label:'Check In', page:'checkinout' },
                      { icon:'🏠', label:'Rooms', page:'rooms' },
                      { icon:'🧾', label:'Open POS', page:'pos' },
                      { icon:'✨', label:'Housekeeping', page:'housekeeping' },
                    ].filter(a => canAccess(profile?.role, a.page)).map(a => (
                      <button key={a.label} onClick={() => setPage(a.page)}
                        className="bg-white border border-gray-200 rounded-xl p-3 text-center hover:border-blue-300 hover:bg-blue-50 transition-colors">
                        <div className="text-xl mb-1">{a.icon}</div>
                        <div className="text-xs text-gray-600">{a.label}</div>
                      </button>
                    ))}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: "Total Bookings",      value: stats?.total_bookings ?? 0,        sub: 'all time' },
                      { label: "Today's Check-ins",   value: stats?.todays_checkins ?? 0,       sub: 'today' },
                      { label: "Occupied Rooms",       value: stats?.occupied_rooms ?? 0,        sub: `${stats?.available_rooms ?? 0} available` },
                      { label: "Revenue Today",        value: `₱${(stats?.revenue_today ?? 0).toLocaleString()}`, sub: 'today' },
                    ].map(s => (
                      <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-4">
                        <div className="text-xs text-gray-500 mb-1">{s.label}</div>
                        <div className="text-2xl font-semibold text-gray-800">{s.value}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{s.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Revenue month */}
                  <div className="bg-white border border-gray-100 rounded-xl p-4">
                    <div className="text-xs text-gray-500 mb-1">Revenue This Month</div>
                    <div className="text-3xl font-semibold text-blue-700">
                      ₱{(stats?.revenue_this_month ?? 0).toLocaleString()}
                    </div>
                  </div>

                  {/* Recent Bookings */}
                  <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <div className="text-sm font-medium text-gray-700">Recent Bookings</div>
                      <button onClick={() => setPage('bookings')} className="text-xs text-blue-600 hover:text-blue-800">View all</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 border-b border-gray-100">
                            <th className="text-left px-4 py-2.5 font-medium">Booking #</th>
                            <th className="text-left px-4 py-2.5 font-medium">Guest</th>
                            <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Check-in</th>
                            <th className="text-left px-4 py-2.5 font-medium">Status</th>
                            <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bookings.length === 0 ? (
                            <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 text-xs">No bookings yet</td></tr>
                          ) : bookings.map(b => (
                            <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="px-4 py-2.5 font-medium text-blue-700">{b.booking_number}</td>
                              <td className="px-4 py-2.5 text-gray-700">{(b.guests as any)?.full_name ?? '—'}</td>
                              <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{b.check_in_date}</td>
                              <td className="px-4 py-2.5">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bookingStatusColor[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                  {b.status.replace('_', ' ')}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-gray-700 hidden md:table-cell">₱{Number(b.total_amount).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ROOMS */}
              {page === 'rooms' && <RoomsPage />}

              {/* BOOKINGS */}
              {page === 'bookings' && (
                <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">All Bookings</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                          <th className="text-left px-4 py-2.5 font-medium">Booking #</th>
                          <th className="text-left px-4 py-2.5 font-medium">Guest</th>
                          <th className="text-left px-4 py-2.5 font-medium">Check-in</th>
                          <th className="text-left px-4 py-2.5 font-medium">Check-out</th>
                          <th className="text-left px-4 py-2.5 font-medium">Status</th>
                          <th className="text-left px-4 py-2.5 font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bookings.length === 0 ? (
                          <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-xs">No bookings yet</td></tr>
                        ) : bookings.map(b => (
                          <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-blue-700">{b.booking_number}</td>
                            <td className="px-4 py-2.5">{(b.guests as any)?.full_name ?? '—'}</td>
                            <td className="px-4 py-2.5 text-gray-500">{b.check_in_date}</td>
                            <td className="px-4 py-2.5 text-gray-500">{b.check_out_date}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bookingStatusColor[b.status] ?? ''}`}>
                                {b.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">₱{Number(b.total_amount).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* WALK-IN */}
              {page === 'walkin' && <WalkInPage />}

              {/* CHECK-IN / CHECK-OUT */}
              {page === 'checkinout' && <CheckInOutPage />}

              {/* POS / CASHIER */}
              {page === 'pos' && <POSPage />}

              {/* COTTAGES */}
              {page === 'cottages' && <CottagesPage />}

              {/* DAY USE */}
              {page === 'dayuse' && <DayUsePage />}

              {/* RESTAURANT */}
              {page === 'restaurant' && <RestaurantPage />}

              {/* HOUSEKEEPING */}
              {page === 'housekeeping' && <HousekeepingPage />}

              {/* MAINTENANCE */}
              {page === 'maintenance' && <MaintenancePage />}

              {/* INVENTORY */}
              {page === 'inventory' && <InventoryPage />}

              {/* EQUIPMENT */}
              {page === 'equipment' && <EquipmentPage />}

              {/* GUESTS */}
              {page === 'guests' && <GuestsPage />}

              {/* STAFF */}
              {page === 'staff' && <StaffPage />}

              {/* BILLING */}
              {page === 'billing' && <BillingPage />}

              {/* REPORTS */}
              {page === 'reports' && <ReportsPage />}

              {/* SETTINGS */}
              {page === 'settings' && <SettingsPage />}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
