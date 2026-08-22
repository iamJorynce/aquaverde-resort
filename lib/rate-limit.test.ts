import { describe, it, expect, beforeEach, vi } from 'vitest'
import { rateLimit, getClientIp } from './rate-limit'

describe('rateLimit', () => {
  it('allows requests up to the limit', () => {
    const key = `test-${Math.random()}`
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5, 60_000).allowed).toBe(true)
    }
  })

  it('blocks the request after the limit is reached', () => {
    const key = `test-${Math.random()}`
    for (let i = 0; i < 5; i++) rateLimit(key, 5, 60_000)
    const result = rateLimit(key, 5, 60_000)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('tracks separate keys independently', () => {
    const keyA = `test-a-${Math.random()}`
    const keyB = `test-b-${Math.random()}`
    for (let i = 0; i < 5; i++) rateLimit(keyA, 5, 60_000)
    // keyA is now exhausted, but keyB should be untouched
    expect(rateLimit(keyA, 5, 60_000).allowed).toBe(false)
    expect(rateLimit(keyB, 5, 60_000).allowed).toBe(true)
  })

  it('resets the count after the window elapses', () => {
    vi.useFakeTimers()
    try {
      const key = `test-${Math.random()}`
      for (let i = 0; i < 5; i++) rateLimit(key, 5, 1000)
      expect(rateLimit(key, 5, 1000).allowed).toBe(false)

      vi.advanceTimersByTime(1001)

      expect(rateLimit(key, 5, 1000).allowed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('getClientIp', () => {
  it('reads the first IP from x-forwarded-for', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    })
    expect(getClientIp(req)).toBe('203.0.113.5')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-real-ip': '203.0.113.9' },
    })
    expect(getClientIp(req)).toBe('203.0.113.9')
  })

  it("returns 'unknown' when neither header is present", () => {
    const req = new Request('https://example.com')
    expect(getClientIp(req)).toBe('unknown')
  })
})
