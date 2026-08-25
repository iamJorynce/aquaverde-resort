// Returns today's calendar date as observed in the Philippines (UTC+8, no
// DST), regardless of the runtime's own timezone (Supabase Edge Functions
// run in UTC). Mirrors todayInManila() in lib/bookingDates.ts on the
// Next.js side — kept as a separate copy here because Deno functions run
// in an isolated runtime and can't import from that project directly.
export function todayInManila(): string {
  const manilaMs = Date.now() + 8 * 60 * 60 * 1000
  const d = new Date(manilaMs)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function tomorrowInManila(): string {
  const manilaMs = Date.now() + 8 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000
  const d = new Date(manilaMs)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
