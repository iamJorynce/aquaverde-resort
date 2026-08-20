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
import RemittancePage from './RemittancePage'
import BookingsPanel from './BookingsPanel'
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
  { id: 'remittance',  icon: '🧾', label: 'Remittance' },
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

interface TransactionCounts {
  pos: number
  checkin: number
  checkout: number
  dayuse: number
  booking: number
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

  // ✨ NEW: Transaction badge state
  const [transactionCounts, setTransactionCounts] = useState<TransactionCounts>({
    pos: 0,
    checkin: 0,
    checkout: 0,
    dayuse: 0,
    booking: 0,
  })
  const [hasUnprocessedTransactions, setHasUnprocessedTransactions] = useState(false)

  // Pending bookings awaiting staff approval — the "Bookings" nav badge
  // reflects this, not transactionCounts.booking. Nothing in the app ever
  // creates a transaction row with txn_type='booking' (online/staff
  // confirmation only touches the bookings table + a reservation_fee
  // transaction), so that counter could never clear once non-zero — it
  // was reading a source that no confirm action ever updates.
  const [pendingBookingsCount, setPendingBookingsCount] = useState(0)

  async function loadPendingBookingsCount() {
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    setPendingBookingsCount(count ?? 0)
  }

  // Same problem as bookings: "Check-in/Out" was counting
  // transactions.txn_type IN ('checkin','checkout'), but check-in/check-out
  // never create a transaction with those types (check-in records a
  // 'deposit' transaction, check-out records 'room'/'refund' — see
  // app/api/checkin/route.ts and app/api/checkout/route.ts). The real
  // pending counts live on the bookings table, matching what
  // CheckInOutPage.tsx itself queries: awaiting check-in = status
  // pending/confirmed with check_in_date already due; awaiting check-out =
  // checked_in with check_out_date already due. Day-use bookings have
  // their own module/badge, so both exclude accommodation_type='day_use'.
  const [pendingCheckinCount, setPendingCheckinCount] = useState(0)
  const [pendingCheckoutCount, setPendingCheckoutCount] = useState(0)

  async function loadPendingCheckInOutCounts() {
    const today = new Date().toISOString().slice(0, 10)
    const [{ count: checkinCount }, { count: checkoutCount }] = await Promise.all([
      supabase.from('bookings')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'confirmed'])
        .lte('check_in_date', today)
        .not('accommodation_type', 'eq', 'day_use'),
      supabase.from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'checked_in')
        .lte('check_out_date', today)
        .not('accommodation_type', 'eq', 'day_use'),
    ])
    setPendingCheckinCount(checkinCount ?? 0)
    setPendingCheckoutCount(checkoutCount ?? 0)
  }

  // Housekeeping had no badge/notification at all before — this adds one,
  // matching how HousekeepingPage.tsx itself defines "pending": tasks in
  // housekeeping_tasks with status='pending' (not yet started; in_progress
  // tasks are already being handled so they're excluded, same as the
  // other modules only counting the not-yet-actioned state).
  const [pendingHousekeepingCount, setPendingHousekeepingCount] = useState(0)

  async function loadPendingHousekeepingCount() {
    const { count } = await supabase
      .from('housekeeping_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    setPendingHousekeepingCount(count ?? 0)
  }

  // The "unprocessed" banner combines all sources — POS/day-use
  // transactions plus pending bookings, check-in/check-out, and
  // housekeeping — so it needs to re-derive whenever any one changes.
  useEffect(() => {
    const hasUnprocessed =
      Object.values(transactionCounts).some(count => count > 0) ||
      pendingBookingsCount > 0 ||
      pendingCheckinCount > 0 ||
      pendingCheckoutCount > 0 ||
      pendingHousekeepingCount > 0
    setHasUnprocessedTransactions(hasUnprocessed)
  }, [transactionCounts, pendingBookingsCount, pendingCheckinCount, pendingCheckoutCount, pendingHousekeepingCount])

  // Shift prompt — shown to cashier/front_desk on login if no active shift
  const [showShiftPrompt, setShowShiftPrompt] = useState(false)
  const [shiftOpeningFund, setShiftOpeningFund] = useState(0)
  const [shiftType, setShiftType] = useState('AM')
  const [openingShift, setOpeningShift] = useState(false)

  // ✨ NEW: Load transaction counts
  async function loadTransactionCounts() {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('txn_type, id')
        .eq('status', 'pending')
      
      if (error) throw error

      const counts: TransactionCounts = {
        pos: 0,
        checkin: 0,
        checkout: 0,
        dayuse: 0,
        booking: 0,
      }

      data?.forEach(txn => {
        if (txn.txn_type === 'pos') counts.pos++
        else if (txn.txn_type === 'checkin') counts.checkin++
        else if (txn.txn_type === 'checkout') counts.checkout++
        else if (txn.txn_type === 'dayuse') counts.dayuse++
        else if (txn.txn_type === 'booking') counts.booking++
      })

      setTransactionCounts(counts)
    } catch (err) {
      console.error('Error loading transaction counts:', err)
    }
  }

  // ✨ NEW: Get badge count for module
  function getModuleBadgeCount(moduleId: string): number {
    switch (moduleId) {
      case 'pos':
        return transactionCounts.pos
      case 'checkinout':
        return pendingCheckinCount + pendingCheckoutCount
      case 'dayuse':
        return transactionCounts.dayuse
      case 'bookings':
        return pendingBookingsCount
      case 'housekeeping':
        return pendingHousekeepingCount
      default:
        return 0
    }
  }

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

      if (!canAccess(prof?.role, page)) {
        setPage('dashboard')
      }

      const shiftRoles = ['cashier', 'front_desk']
      if (prof?.role && shiftRoles.includes(prof.role)) {
        const { data: activeShift } = await supabase
          .from('shifts')
          .select('id')
          .eq('cashier_id', user.id)
          .eq('status', 'open')
          .maybeSingle()

        if (!activeShift) {
          const hour = new Date().getHours()
          const autoShiftType = hour < 12 ? 'AM' : hour < 18 ? 'PM' : 'Night'
          setShiftType(autoShiftType)
          setShowShiftPrompt(true)
        }
      }

      // ✨ NEW: Load transaction counts
      await loadTransactionCounts()
      await loadPendingBookingsCount()
      await loadPendingCheckInOutCounts()
      await loadPendingHousekeepingCount()
    }
    load()

    // ✨ NEW: Real-time subscription
    const subscription = supabase
      .channel('transactions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => loadTransactionCounts()
      )
      .subscribe()

    // Keep the Bookings and Check-in/Out nav badges in sync whenever a
    // booking's status changes (e.g. staff confirms/checks in/checks out
    // in another tab), not just on this page's own initial load.
    const bookingsSubscription = supabase
      .channel('bookings-badge')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => {
          loadPendingBookingsCount()
          loadPendingCheckInOutCounts()
        }
      )
      .subscribe()

    // Keep the Housekeeping nav badge in sync whenever a task is created,
    // started, or completed elsewhere.
    const housekeepingSubscription = supabase
      .channel('housekeeping-badge')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'housekeeping_tasks' },
        () => loadPendingHousekeepingCount()
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
      bookingsSubscription.unsubscribe()
      housekeepingSubscription.unsubscribe()
    }
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

  async function openShift() {
    if (!profile) return
    setOpeningShift(true)
    const shiftNumber = `SHF-${Date.now().toString().slice(-8)}`
    const { error } = await supabase.from('shifts').insert({
      shift_number: shiftNumber,
      cashier_id: profile.id,
      cashier_name: profile.full_name,
      shift_type: shiftType,
      opening_fund: shiftOpeningFund,
    })
    if (error) {
      setOpeningShift(false)
      return
    }
    setShowShiftPrompt(false)
    setOpeningShift(false)
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ✨ NEW: Toast notification for pending transactions */}
      {hasUnprocessedTransactions && (
        <div className="fixed bottom-4 right-4 z-40 bg-amber-50 border border-amber-200 rounded-lg p-4 shadow-lg max-w-sm">
          <div className="flex items-start gap-3">
            <div className="text-lg">⚠️</div>
            <div>
              <div className="font-semibold text-amber-900 text-sm">Pending Transactions</div>
              <div className="text-xs text-amber-700 mt-1">
                You have unprocessed transactions:
              </div>
              <div className="mt-2 space-y-1 text-xs text-amber-700">
                {transactionCounts.pos > 0 && <div>• POS: {transactionCounts.pos} pending</div>}
                {pendingCheckinCount > 0 && <div>• Check-in: {pendingCheckinCount} pending</div>}
                {pendingCheckoutCount > 0 && <div>• Check-out: {pendingCheckoutCount} pending</div>}
                {pendingHousekeepingCount > 0 && <div>• Housekeeping: {pendingHousekeepingCount} pending</div>}
                {transactionCounts.dayuse > 0 && <div>• Day Use: {transactionCounts.dayuse} pending</div>}
                {pendingBookingsCount > 0 && <div>• Bookings: {pendingBookingsCount} pending</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shift opening prompt modal */}
      {showShiftPrompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <div className="text-base font-semibold text-gray-800 mb-1">Start Your Shift</div>
            <div className="text-xs text-gray-400 mb-4">
              You don't have an active shift yet. Please confirm your opening fund to begin.
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">Shift Type</label>
              <select value={shiftType} onChange={e => setShiftType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                <option value="AM">AM Shift</option>
                <option value="PM">PM Shift</option>
                <option value="Night">Night Shift</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">Opening Fund (₱)</label>
              <input
                type="number"
                value={shiftOpeningFund || ''}
                onChange={e => setShiftOpeningFund(parseFloat(e.target.value) || 0)}
                placeholder="Enter amount received from manager"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
                autoFocus
              />
              <div className="text-xs text-gray-400 mt-1">
                This is the starting cash given to you by management. Enter 0 if none.
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={openShift}
                disabled={openingShift}
                className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg"
              >
                {openingShift ? 'Opening...' : 'Confirm & Start Shift'}
              </button>
              <button
                onClick={() => setShowShiftPrompt(false)}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm"
              >
                Skip
              </button>
            </div>

            <div className="text-xs text-gray-400 text-center mt-3">
              You can also open a shift later from the Remittance module.
            </div>
          </div>
        </div>
      )}

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
          {NAV.filter(n => canAccess(profile?.role, n.id)).map(n => {
            const count = getModuleBadgeCount(n.id)
            const hasTransactions = count > 0
            return (
              <button
                key={n.id}
                onClick={() => { setPage(n.id); setSidebarOpen(false) }}
                className={`w-full flex items-center justify-between gap-2.5 px-4 py-2 text-sm transition-colors
                  ${page === n.id
                    ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">{n.icon}</span>
                  {n.label}
                </div>
                {/* ✨ NEW: Badge */}
                {hasTransactions && (
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {count}
                    </span>
                  </div>
                )}
              </button>
            )
          })}
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
                    ].filter(a => canAccess(profile?.role, a.page)).map(a => {
                      const count = getModuleBadgeCount(a.page)
                      return (
                        <button key={a.label} onClick={() => setPage(a.page)}
                          className={`relative bg-white border border-gray-200 rounded-xl p-3 text-center hover:border-blue-300 hover:bg-blue-50 transition-colors ${
                            count > 0 ? 'ring-2 ring-red-300' : ''
                          }`}>
                          <div className="text-xl mb-1">{a.icon}</div>
                          <div className="text-xs text-gray-600">{a.label}</div>
                          {/* ✨ NEW: Badge on quick actions */}
                          {count > 0 && (
                            <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg">
                              {count}
                            </div>
                          )}
                        </button>
                      )
                    })}
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
                <BookingsPanel />
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

              {/* REMITTANCE */}
              {page === 'remittance' && <RemittancePage />}
            </>
          )}
        </main>
      </div>
    </div>
  )
}