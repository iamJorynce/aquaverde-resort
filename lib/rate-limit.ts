// Simple in-memory sliding-window rate limiter for public, unauthenticated
// API routes (guest booking, contact, etc).
//
// CAVEAT — read before relying on this in production: this state lives in
// the Node.js process, so it only works as a real limiter on a
// long-running server or a single serverless instance under low traffic.
// On Vercel, each concurrent invocation can land on a different instance
// (and cold starts reset this Map entirely), so a determined attacker
// spreading requests across instances will not be reliably throttled.
// It still stops the common case — a script hammering one endpoint in a
// tight loop, which mostly lands on the same warm instance — but for
// guaranteed protection at scale, swap this for Upstash Redis
// (@upstash/ratelimit) or Vercel's Edge Config / Firewall rate limiting.

const buckets = new Map<string, { count: number; resetAt: number }>()

// Prevent unbounded memory growth from unique IPs over a long-lived instance.
const MAX_TRACKED_KEYS = 5000

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now >= bucket.resetAt) {
    if (buckets.size >= MAX_TRACKED_KEYS) buckets.clear()
    const resetAt = now + windowMs
    buckets.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: limit - 1, resetAt }
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt }
  }

  bucket.count += 1
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt }
}

// Vercel/most proxies set x-forwarded-for; NextRequest doesn't expose a raw
// socket IP in the serverless runtime, so this is the standard way to get it.
export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}
