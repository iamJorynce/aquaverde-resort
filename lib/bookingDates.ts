/**
 * Booking-date helpers.
 *
 * A booking date is a calendar date (YYYY-MM-DD), not a timestamp.
 * These helpers deliberately avoid new Date('YYYY-MM-DD') and toISOString()
 * so the result is identical on Philippine desktop/mobile browsers and
 * independent of the device timezone.
 */

// Returns today's calendar date AS OBSERVED IN THE PHILIPPINES (UTC+8, no
// DST — the offset is always exactly 8 hours), regardless of what timezone
// the code is actually running in.
//
// This matters because `new Date().toISOString().slice(0, 10)` — used
// throughout this codebase for "today" — returns the UTC calendar date.
// Vercel's serverless functions run in UTC by default, so on the server
// that's ALWAYS wrong by up to 8 hours; and even in a browser physically
// in the Philippines, toISOString() still converts to UTC before slicing.
// Concretely: every day between 12:00 AM and 7:59 AM Philippine time,
// `new Date().toISOString().slice(0,10)` silently returns YESTERDAY's
// date. For a resort system that affects walk-in check-in defaults,
// "is this booking active today" checks, past-date validation on the
// public booking form, and daily report date ranges — all real bugs
// during that window, not theoretical ones.
export function addDaysInManila(days: number): string {
  const manilaMs = Date.now() + 8 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000
  const d = new Date(manilaMs)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayInManila(): string {
  return addDaysInManila(0)
}

export function tomorrowInManila(): string {
  return addDaysInManila(1)
}

export function formatLocalDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function calendarDateToUTC(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return NaN
  return Date.UTC(year, month - 1, day)
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = calendarDateToUTC(checkIn)
  const end = calendarDateToUTC(checkOut)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.round((end - start) / 86400000))
}

export function formatBookingDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return date

  // Construct using local time so Safari/Chrome/Firefox don't reinterpret
  // YYYY-MM-DD as UTC and shift the displayed day.
  const localDate = new Date(year, month - 1, day)
  return localDate.toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
