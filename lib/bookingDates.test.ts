import { describe, it, expect, vi, afterEach } from 'vitest'
import { nightsBetween, calendarDateToUTC, addCalendarDays, formatLocalDate, todayInManila, tomorrowInManila } from './bookingDates'

afterEach(() => {
  vi.useRealTimers()
})

describe('todayInManila', () => {
  it('returns the Manila calendar date even when the system clock is UTC just after midnight PHT', () => {
    // 2026-08-24 00:30 in Manila (UTC+8) = 2026-08-23 16:30 UTC.
    // A naive `new Date().toISOString().slice(0,10)` at this instant would
    // wrongly return "2026-08-23" — yesterday from Manila's perspective.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-23T16:30:00.000Z'))
    expect(todayInManila()).toBe('2026-08-24')
  })

  it('returns the same date as the naive UTC approach during Philippine daytime hours', () => {
    // 2026-08-24 14:00 in Manila (UTC+8) = 2026-08-24 06:00 UTC — both the
    // UTC date and the Manila date agree here, unlike the midnight case above.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T06:00:00.000Z'))
    expect(todayInManila()).toBe('2026-08-24')
  })

  it('rolls over at exactly 16:00 UTC (midnight in Manila)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-23T15:59:59.000Z'))
    expect(todayInManila()).toBe('2026-08-23')

    vi.setSystemTime(new Date('2026-08-23T16:00:00.000Z'))
    expect(todayInManila()).toBe('2026-08-24')
  })
})

describe('tomorrowInManila', () => {
  it('is always exactly one calendar day ahead of todayInManila', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-23T16:30:00.000Z')) // 2026-08-24 00:30 Manila
    expect(todayInManila()).toBe('2026-08-24')
    expect(tomorrowInManila()).toBe('2026-08-25')
  })

  it('correctly rolls over a month boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T10:00:00.000Z')) // 2026-08-31 18:00 Manila
    expect(tomorrowInManila()).toBe('2026-09-01')
  })
})

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
