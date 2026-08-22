import { describe, it, expect } from 'vitest'
import { isValidEmail, isValidPhone, sanitizeSearchTerm } from './validation'

describe('isValidEmail', () => {
  it('accepts a normal email', () => {
    expect(isValidEmail('guest@example.com')).toBe(true)
  })

  it('rejects a value with no @', () => {
    expect(isValidEmail('not-an-email')).toBe(false)
  })

  it('rejects a value with no TLD', () => {
    expect(isValidEmail('guest@example')).toBe(false)
  })

  it('rejects values containing a comma (PostgREST filter separator)', () => {
    expect(isValidEmail('x@x.com,phone.eq.*')).toBe(false)
  })

  it('rejects values containing parentheses (PostgREST filter grouping)', () => {
    expect(isValidEmail('x@x.com)or(id.neq.null')).toBe(false)
  })

  it('rejects non-string input', () => {
    expect(isValidEmail(12345)).toBe(false)
    expect(isValidEmail(null)).toBe(false)
    expect(isValidEmail(undefined)).toBe(false)
  })
})

describe('isValidPhone', () => {
  it('accepts common PH phone formats', () => {
    expect(isValidPhone('+63 912 345 6789')).toBe(true)
    expect(isValidPhone('09123456789')).toBe(true)
  })

  it('rejects a value containing letters', () => {
    expect(isValidPhone('call-me-maybe')).toBe(false)
  })

  it('rejects a value containing a comma or parens', () => {
    expect(isValidPhone('0912,phone.eq.*')).toBe(false)
    expect(isValidPhone('0912)or(1')).toBe(false)
  })

  it('rejects values that are too short or too long', () => {
    expect(isValidPhone('123')).toBe(false)
    expect(isValidPhone('1'.repeat(30))).toBe(false)
  })
})

describe('sanitizeSearchTerm', () => {
  it('leaves normal search terms untouched', () => {
    expect(sanitizeSearchTerm('Juan Dela Cruz')).toBe('Juan Dela Cruz')
  })

  it('strips commas and parentheses', () => {
    expect(sanitizeSearchTerm('x,full_name.ilike.*')).toBe('xfull_name.ilike.*')
    expect(sanitizeSearchTerm('x)or(id.neq.null')).toBe('xorid.neq.null')
  })
})
