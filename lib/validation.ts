// Small validation helpers shared across API routes. Kept as plain
// functions (not zod schemas, even though zod is already a project
// dependency) so they're trivial to unit test and reuse — see
// lib/validation.test.ts.

// Deliberately rejects `,` `(` `)` — beyond being invalid-ish in a real
// email/phone, these are PostgREST filter-syntax characters. Some routes
// interpolate email/phone into a `.or()` filter (e.g. the rate-limit check
// in app/api/public/booking/route.ts); allowing these characters through
// would let a crafted "email" inject extra filter conditions.
const EMAIL_RE = /^[^\s@,()]+@[^\s@,()]+\.[^\s@,()]+$/
const PHONE_RE = /^[0-9+\-\s]{7,20}$/

export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && EMAIL_RE.test(value)
}

export function isValidPhone(value: unknown): value is string {
  return typeof value === 'string' && PHONE_RE.test(value)
}

// Strips characters that are structural in PostgREST's filter syntax
// (`,` separates OR conditions, `(`/`)` group them) from free-text search
// input before it's interpolated into a `.or()`/`.ilike()` filter string.
// See app/api/guests/route.ts.
export function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()]/g, '')
}
