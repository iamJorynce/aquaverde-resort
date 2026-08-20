/**
 * Booking-date helpers.
 *
 * A booking date is a calendar date (YYYY-MM-DD), not a timestamp.
 * These helpers deliberately avoid new Date('YYYY-MM-DD') and toISOString()
 * so the result is identical on Philippine desktop/mobile browsers and
 * independent of the device timezone.
 */

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
