'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { todayInManila, calendarDateToUTC } from '@/lib/bookingDates'

type ViewMode = 'month' | 'week'

// ---- Date helpers (UTC-based, same convention as lib/bookingDates.ts, so
// grid math never drifts a day depending on the device's timezone) ----
function utcToDateStr(ms: number): string {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function addDays(dateStr: string, days: number): string {
  return utcToDateStr(calendarDateToUTC(dateStr) + days * 86400000)
}
function weekdayOf(dateStr: string): number {
  return new Date(calendarDateToUTC(dateStr)).getUTCDay() // 0 = Sunday
}
// 42 days (6 full weeks) starting on the Sunday on/before the 1st of the
// month containing `anchor` — a fixed 6-row grid so the layout doesn't
// jump between 5 and 6 rows as you page through months.
function getMonthGridDays(anchor: string): string[] {
  const [y, m] = anchor.split('-').map(Number)
  const firstOfMonth = utcToDateStr(Date.UTC(y, m - 1, 1))
  const start = addDays(firstOfMonth, -weekdayOf(firstOfMonth))
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}
function getWeekDays(anchor: string): string[] {
  const start = addDays(anchor, -weekdayOf(anchor))
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}
function monthLabel(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function dayLabel(dateStr: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-PH', { ...opts, timeZone: 'UTC' })
}

const STATUS_STYLE: Record<string, { chip: string; dot: string }> = {
  pending:     { chip: 'bg-yellow-100 text-yellow-700', dot: '#ca8a04' },
  confirmed:   { chip: 'bg-blue-100 text-blue-700',     dot: '#2563eb' },
  checked_in:  { chip: 'bg-green-100 text-green-700',   dot: '#16a34a' },
  checked_out: { chip: 'bg-gray-100 text-gray-500',     dot: '#6b7280' },
  cancelled:   { chip: 'bg-red-100 text-red-700',       dot: '#dc2626' },
  no_show:     { chip: 'bg-orange-100 text-orange-700', dot: '#ea580c' },
}
const ALL_STATUSES = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show']
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarPage() {
  const supabase = createClient()
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [anchor, setAnchor] = useState(todayInManila())
  const [bookings, setBookings] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [cottages, setCottages] = useState<any[]>([])
  const [cottageNameById, setCottageNameById] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  // Cancelled/no-show hidden by default — they clutter the grid and staff
  // mainly want to see what's confirmed or currently in-house.
  const [visibleStatuses, setVisibleStatuses] = useState<Set<string>>(
    new Set(['pending', 'confirmed', 'checked_in', 'checked_out'])
  )
  const today = todayInManila()

  const monthDays = getMonthGridDays(anchor)
  const weekDays = getWeekDays(anchor)
  const rangeDays = viewMode === 'month' ? monthDays : weekDays

  useEffect(() => { load() }, [viewMode, anchor])

  async function load() {
    setLoading(true)
    const rangeStart = rangeDays[0]
    const rangeEnd = addDays(rangeDays[rangeDays.length - 1], 1) // exclusive upper bound

    const [{ data: bk }, { data: allCottages }] = await Promise.all([
      // Standard overlap query: a booking is visible if its stay touches
      // the grid at all, even if it starts/ends outside the visible range.
      supabase.from('bookings')
        .select('id, booking_number, status, check_in_date, check_out_date, total_amount, room_id, cottage_id, cottage_ids, group_number, is_group_primary, guests(full_name), rooms(room_number)')
        .neq('accommodation_type', 'day_use')
        .lt('check_in_date', rangeEnd)
        .gt('check_out_date', rangeStart)
        .order('check_in_date'),
      supabase.from('cottages').select('id, name, cottage_code').order('name'),
    ])

    setBookings(bk ?? [])
    setCottages(allCottages ?? [])
    setCottageNameById(Object.fromEntries((allCottages ?? []).map((c: any) => [c.id, c.name])))

    if (viewMode === 'week' && rooms.length === 0) {
      const { data: allRooms } = await supabase.from('rooms').select('id, room_number').order('room_number')
      setRooms(allRooms ?? [])
    }
    setLoading(false)
  }

  function bookingLabel(b: any): string {
    const parts: string[] = []
    if (b.rooms) parts.push(`Room ${(b.rooms as any).room_number}`)
    const cids: string[] = b.cottage_ids?.length ? b.cottage_ids : (b.cottage_id ? [b.cottage_id] : [])
    cids.forEach(id => { const n = cottageNameById[id]; if (n && !parts.includes(n)) parts.push(n) })
    return parts.length > 0 ? parts.join(' + ') : b.booking_number
  }

  const visibleBookings = bookings.filter(b => visibleStatuses.has(b.status))

  function bookingsOnDay(day: string) {
    return visibleBookings.filter(b => b.check_in_date <= day && day <= b.check_out_date)
  }

  function toggleStatus(status: string) {
    setVisibleStatuses(prev => {
      const next = new Set(prev)
      next.has(status) ? next.delete(status) : next.add(status)
      return next
    })
  }

  function stepAnchor(dir: 1 | -1) {
    setAnchor(prev => {
      if (viewMode === 'week') return addDays(prev, dir * 7)
      const [y, m, d] = prev.split('-').map(Number)
      return utcToDateStr(Date.UTC(y, m - 1 + dir, Math.min(d, 28)))
    })
  }

  // Bar span (in day-columns) for the week timeline — nights only, so a
  // checkout-day / check-in-day turnover on the same room doesn't visually
  // overlap. Returns null if the booking doesn't touch the visible week.
  function weekBarSpan(b: any): { startIdx: number; endIdx: number } | null {
    let startIdx = -1, endIdx = -1
    weekDays.forEach((day, i) => {
      if (day >= b.check_in_date && day < b.check_out_date) {
        if (startIdx === -1) startIdx = i
        endIdx = i
      }
    })
    return startIdx === -1 ? null : { startIdx, endIdx }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {(['month', 'week'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium capitalize transition-colors ${viewMode === v ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {v}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => stepAnchor(-1)} className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">‹</button>
          <button onClick={() => setAnchor(today)} className="px-3 h-8 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">Today</button>
          <button onClick={() => stepAnchor(1)} className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">›</button>
        </div>

        <div className="text-sm font-semibold text-gray-800">
          {viewMode === 'month' ? monthLabel(anchor) : `${dayLabel(weekDays[0], { month: 'short', day: 'numeric' })} – ${dayLabel(weekDays[6], { month: 'short', day: 'numeric', year: 'numeric' })}`}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          {ALL_STATUSES.map(s => (
            <button key={s} onClick={() => toggleStatus(s)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium capitalize border transition-opacity ${visibleStatuses.has(s) ? 'border-transparent ' + STATUS_STYLE[s].chip : 'border-gray-200 text-gray-300 opacity-60'}`}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: STATUS_STYLE[s].dot }} />
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : viewMode === 'month' ? (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-100">
            {WEEKDAY_NAMES.map(w => (
              <div key={w} className="px-2 py-2 text-[11px] font-medium text-gray-400 text-center">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map(day => {
              const inMonth = day.slice(0, 7) === anchor.slice(0, 7)
              const isToday = day === today
              const dayBookings = bookingsOnDay(day)
              const visible = dayBookings.slice(0, 3)
              const overflow = dayBookings.length - visible.length
              return (
                <button key={day} onClick={() => setSelectedDay(day)}
                  className={`min-h-[92px] border-b border-r border-gray-200 p-1.5 text-left align-top hover:bg-blue-50/40 transition-colors ${inMonth ? 'bg-white' : 'bg-gray-50/60'}`}>
                  <div className={`text-xs mb-1 inline-flex items-center justify-center w-5 h-5 rounded-full ${isToday ? 'bg-blue-700 text-white font-semibold' : inMonth ? 'text-gray-600' : 'text-gray-300'}`}>
                    {Number(day.slice(8, 10))}
                  </div>
                  <div className="space-y-0.5">
                    {visible.map(b => (
                      <div key={b.id} className={`text-[10px] px-1 py-0.5 rounded truncate ${STATUS_STYLE[b.status]?.chip ?? 'bg-gray-100 text-gray-500'}`}>
                        {(b.guests as any)?.full_name ?? b.booking_number}
                      </div>
                    ))}
                    {overflow > 0 && <div className="text-[10px] text-gray-400 px-1">+{overflow} more</div>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          {/* Week header */}
          <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: '120px repeat(7, 1fr)' }}>
            <div className="px-3 py-2 text-[11px] font-medium text-gray-400">Room / Cottage</div>
            {weekDays.map(day => (
              <div key={day} className={`px-2 py-2 text-center border-l border-gray-200 ${day === today ? 'bg-blue-50' : ''}`}>
                <div className="text-[11px] text-gray-400">{WEEKDAY_NAMES[weekdayOf(day)]}</div>
                <div className={`text-xs font-medium ${day === today ? 'text-blue-700' : 'text-gray-700'}`}>{Number(day.slice(8, 10))}</div>
              </div>
            ))}
          </div>

          {/* Rows: rooms, then cottages */}
          <div className="max-h-[560px] overflow-y-auto">
            {[
              ...rooms.map(r => ({ key: `room-${r.id}`, label: `Room ${r.room_number}`, match: (b: any) => b.room_id === r.id })),
              ...cottages.map(c => ({ key: `cottage-${c.id}`, label: c.name, match: (b: any) => b.cottage_id === c.id || b.cottage_ids?.includes(c.id) })),
            ].map(row => {
              const rowBookings = visibleBookings.filter(row.match)
              return (
                <div key={row.key} className="grid border-b border-gray-200" style={{ gridTemplateColumns: '120px repeat(7, 1fr)', minHeight: 40 }}>
                  <div className="px-3 py-2 text-xs text-gray-600 flex items-center truncate">{row.label}</div>
                  <div className="col-span-7 grid relative" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
                    {weekDays.map(day => (
                      <div key={day} className={`border-l border-gray-200 ${day === today ? 'bg-blue-50/40' : ''}`} />
                    ))}
                    {rowBookings.map(b => {
                      const span = weekBarSpan(b)
                      if (!span) return null
                      return (
                        <button key={b.id} onClick={() => setSelectedDay(b.check_in_date)}
                          title={`${(b.guests as any)?.full_name ?? b.booking_number} · ${b.check_in_date} → ${b.check_out_date}`}
                          className={`absolute top-1 bottom-1 mx-0.5 rounded-md px-1.5 flex items-center text-[10px] font-medium truncate ${STATUS_STYLE[b.status]?.chip ?? 'bg-gray-100 text-gray-500'}`}
                          style={{
                            left: `calc(${(span.startIdx / 7) * 100}% )`,
                            width: `calc(${((span.endIdx - span.startIdx + 1) / 7) * 100}% - 4px)`,
                          }}>
                          {(b.guests as any)?.full_name ?? b.booking_number}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {rooms.length === 0 && cottages.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-xs">No rooms or cottages configured.</div>
            )}
          </div>
        </div>
      )}

      {/* Day detail modal */}
      {selectedDay && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectedDay(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-800">{dayLabel(selectedDay, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
              <button onClick={() => setSelectedDay(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>
            {bookingsOnDay(selectedDay).length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No bookings covering this day.</div>
            ) : (
              <div className="space-y-2">
                {bookingsOnDay(selectedDay).map(b => (
                  <div key={b.id} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-800">{(b.guests as any)?.full_name ?? '—'}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLE[b.status]?.chip ?? 'bg-gray-100 text-gray-500'}`}>
                        {b.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">{bookingLabel(b)} · {b.booking_number}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {b.check_in_date} → {b.check_out_date}
                      {b.check_in_date === selectedDay && <span className="text-green-600 ml-1">(check-in)</span>}
                      {b.check_out_date === selectedDay && <span className="text-amber-600 ml-1">(check-out)</span>}
                    </div>
                    <div className="text-xs text-gray-600 mt-1 font-medium">₱{Number(b.total_amount ?? 0).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
