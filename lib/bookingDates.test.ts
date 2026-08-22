import { describe, it, expect } from 'vitest'
import { nightsBetween, calendarDateToUTC, addCalendarDays, formatLocalDate } from './bookingDates'

describe('nightsBetween', () => {
  it('counts a single night correctly', () => {
    expect(nightsBetween('2026-09-01', '2026-09-02')).toBe(1)
  })

  it('counts a multi-night stay correctly', () => {
    expect(nightsBetween('2026-09-01', '2026-09-05')).toBe(4)
  })

  it('returns 0 for same-day check-in/check-out (invalid booking)', () => {
    expect(nightsBetween('2026-09-01', '2026-09-01')).toBe(0)
  })

  it('returns 0 (not negative) when check-out is before check-in', () => {
    // This matters because the public booking route multiplies this by
    // base_rate to get the authoritative price — a negative value here
    // would make it possible to insert a booking with negative total_amount.
    expect(nightsBetween('2026-09-05', '2026-09-01')).toBe(0)
  })

  it('handles a stay spanning a month boundary', () => {
    expect(nightsBetween('2026-08-30', '2026-09-02')).toBe(3)
  })

  it('handles a stay spanning a year boundary', () => {
    expect(nightsBetween('2026-12-30', '2027-01-02')).toBe(3)
  })

  it('returns 0 for malformed date strings instead of throwing', () => {
    expect(nightsBetween('not-a-date', '2026-09-02')).toBe(0)
    expect(nightsBetween('2026-09-01', '')).toBe(0)
  })
})

describe('calendarDateToUTC', () => {
  it('parses a valid YYYY-MM-DD string', () => {
    expect(calendarDateToUTC('2026-01-01')).toBe(Date.UTC(2026, 0, 1))
  })

  it('returns NaN for an invalid string', () => {
    expect(Number.isNaN(calendarDateToUTC('garbage'))).toBe(true)
  })
})

describe('addCalendarDays', () => {
  it('adds days without drifting across a month boundary', () => {
    const result = addCalendarDays(new Date(2026, 0, 30), 3)
    expect(result.getMonth()).toBe(1) // February
    expect(result.getDate()).toBe(2)
  })
})

describe('formatLocalDate', () => {
  it('formats a given date as YYYY-MM-DD', () => {
    expect(formatLocalDate(new Date(2026, 5, 7))).toBe('2026-06-07')
  })

  it('zero-pads single-digit month and day', () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
