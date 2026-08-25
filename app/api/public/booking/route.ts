import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { ok, err } from '@/lib/api-helpers'
import { nightsBetween, todayInManila } from '@/lib/bookingDates'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { isValidEmail, isValidPhone } from '@/lib/validation'

interface RoomLineInput {
  room_id: string
  amount: number       // client's displayed estimate — NOT used for pricing;
                       // the server recomputes the authoritative amount from
                       // room_types_config.base_rate × nights below.
  is_primary: boolean
}

// POST /api/public/booking — used by the public-facing booking page.
// The visitor is never logged in, so this cannot run through the browser's
// anon Supabase client (blocked by RLS on `guests`/`bookings`). Instead the
// client uploads the payment proof to storage itself (that bucket already
// allows anon uploads), then posts everything else here.
export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const limit = rateLimit(`public-booking:${ip}`, 5, 10 * 60 * 1000) // 5 per 10 min
  if (!limit.allowed) {
    return err('Too many booking attempts from this connection. Please wait a few minutes and try again.', 429)
  }

  const supabase = createServiceClient()

  let body: any
  try {
    body = await request.json()
  } catch {
    return err('Invalid JSON body')
  }

  const {
    full_name, email, phone,
    check_in_date, check_out_date,
    num_adults = 1, num_children = 0,
    room_lines,               // RoomLineInput[]
    special_requests,
    payment_proof_url, payment_reference, payment_method,
  } = body

  // ---- Basic validation (mirrors the client-side checks, don't trust them) ----
  if (!full_name || typeof full_name !== 'string') return err('Full name is required')
  if (!email && !phone) return err('An email or phone number is required')
  if (email && !isValidEmail(email)) return err('Invalid email address')
  if (phone && !isValidPhone(phone)) return err('Invalid phone number')
  if (!check_in_date || !check_out_date) return err('Check-in and check-out dates are required')
  if (check_out_date <= check_in_date) return err('Check-out date must be after check-in date')
  if (!Array.isArray(room_lines) || room_lines.length === 0) return err('At least one room must be selected')
  if (!payment_proof_url) return err('Payment proof is required')
  if (!payment_reference) return err('Payment reference is required')

  const today = todayInManila()
  if (check_in_date < today) return err('Check-in date cannot be in the past')

  // ---- Rate limit: this endpoint is unauthenticated, so anyone can call it
  // repeatedly. A per-instance in-memory limiter isn't reliable on Vercel's
  // serverless runtime (each invocation can land on a different instance),
  // so this checks the DB instead: reject if the same email/phone has
  // already created several bookings in the last few minutes. This is a
  // stopgap — for real abuse protection, put this behind Vercel's Edge
  // Config / WAF rate limiting or a shared store like Upstash Redis. ----
  const rateLimitWindowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { count: recentGuestCount } = await supabase
    .from('guests')
    .select('id', { count: 'exact', head: true })
    .or([email && `email.eq.${email}`, phone && `phone.eq.${phone}`].filter(Boolean).join(','))
    .gte('created_at', rateLimitWindowStart)

  if ((recentGuestCount ?? 0) >= 3) {
    return err('Too many booking attempts. Please wait a few minutes and try again, or contact us directly.', 429)
  }

  const roomIds = room_lines.map((l: RoomLineInput) => l.room_id)
  if (roomIds.some((id: any) => typeof id !== 'string' || !id)) {
    return err('Invalid room selection')
  }

  // Note: the email/phone regex checks above also double as protection for
  // the .or() filter built below — PostgREST treats `,` and `(`/`)` as
  // filter-syntax characters, so an unvalidated email like
  // `x@x.com,phone.eq.*` could otherwise inject extra OR conditions into
  // that query. Rejecting those characters up front closes that off.

  const nights = nightsBetween(check_in_date, check_out_date)
  if (nights < 1) return err('Invalid check-in/check-out dates')

  // ---- Recompute the price server-side — never trust rl.amount from the
  // client. Without this, anyone can open devtools and submit whatever
  // number they want for a room's price. ----
  const { data: roomRows, error: roomFetchError } = await supabase
    .from('rooms')
    .select('id, room_types_config ( base_rate )')
    .in('id', roomIds)

  if (roomFetchError || !roomRows || roomRows.length !== roomIds.length) {
    return err('Unable to verify room pricing. Please try again.')
  }

  const verifiedAmountByRoomId = new Map<string, number>()
  for (const r of roomRows as any[]) {
    const baseRate = Number(r.room_types_config?.base_rate ?? 0)
    if (!baseRate || baseRate <= 0) return err('One of the selected rooms is not available for booking.')
    verifiedAmountByRoomId.set(r.id, baseRate * nights)
  }

  // ---- Re-check for overlapping bookings server-side (fail closed) ----
  const { data: overlaps, error: overlapError } = await supabase
    .from('vw_room_booking_ranges')
    .select('room_id')
    .in('room_id', roomIds)
    .lt('check_in_date', check_out_date)
    .gt('check_out_date', check_in_date)

  if (overlapError) return err('Unable to verify room availability. Please try again.')
  if (overlaps && overlaps.length > 0) {
    return err('One of your selected rooms was just booked by someone else. Please go back and reselect.', 409)
  }

  // ---- Create the guest record ----
  // Previously `G-${Date.now().toString().slice(-6)}` — truncating to the
  // last 6 digits of a millisecond timestamp repeats every ~16.7 minutes,
  // so two guests signing up within the same window could get identical
  // guest_code values. randomUUID() gives effectively-unique codes even
  // under concurrent requests.
  const guestCode = `G-${randomUUID().slice(0, 8).toUpperCase()}`
  const { data: guest, error: guestError } = await supabase
    .from('guests')
    .insert({ full_name, email: email || null, phone: phone || null, guest_code: guestCode })
    .select('id')
    .single()

  if (guestError) return err(guestError.message)

  // ---- Create one booking per selected room ----
  const groupNumber = room_lines.length > 1 ? `GRP-${randomUUID().slice(0, 8).toUpperCase()}` : null
  const createdBookings: any[] = []

  for (let i = 0; i < room_lines.length; i++) {
    const rl = room_lines[i] as RoomLineInput
    const isPrimary = i === 0

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        booking_number: `BK-${randomUUID().slice(0, 8).toUpperCase()}`,
        guest_id: guest.id,
        room_id: rl.room_id,
        booking_type: 'online',
        accommodation_type: 'room',
        num_adults: isPrimary ? num_adults : 0,
        num_children: isPrimary ? num_children : 0,
        group_number: groupNumber,
        is_group_primary: isPrimary,
        check_in_date, check_out_date,
        subtotal: verifiedAmountByRoomId.get(rl.room_id),
        total_amount: verifiedAmountByRoomId.get(rl.room_id),
        amount_paid: 0,
        payment_status: 'unpaid',
        status: 'pending',
        payment_proof_url: isPrimary ? payment_proof_url : null,
        payment_reference: isPrimary ? payment_reference : null,
        payment_method_used: isPrimary ? payment_method : null,
        payment_submitted_at: isPrimary ? new Date().toISOString() : null,
        special_requests: [
          special_requests || null,
          groupNumber ? `Group booking: ${groupNumber} (${room_lines.length} rooms)` : null,
        ].filter(Boolean).join(' | ') || null,
      })
      .select()
      .single()

    if (bookingError) {
      // Best-effort cleanup so a partial failure doesn't leave orphaned rows.
      if (createdBookings.length > 0) {
        await supabase.from('bookings').delete().in('id', createdBookings.map(b => b.id))
      }
      await supabase.from('guests').delete().eq('id', guest.id)

      // 23P01 = exclusion_violation — the bookings_no_overlap constraint
      // caught two guests racing for the same room/dates faster than the
      // earlier in-app overlap check could see. This is the DB-level
      // backstop for that race, so surface it as a normal booking
      // conflict, not a raw Postgres error.
      if ((bookingError as any).code === '23P01') {
        return err('One of your selected rooms was just booked by someone else. Please go back and reselect.', 409)
      }
      return err(bookingError.message)
    }
    createdBookings.push(booking)
  }

  return ok({
    bookings: createdBookings,
    group_number: groupNumber,
    primary_booking_id: createdBookings[0].id,
  }, 201)
}
