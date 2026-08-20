import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ok, err } from '@/lib/api-helpers'

interface RoomLineInput {
  room_id: string
  amount: number       // this room line's total_amount for the stay
  is_primary: boolean
}

// POST /api/public/booking — used by the public-facing booking page.
// The visitor is never logged in, so this cannot run through the browser's
// anon Supabase client (blocked by RLS on `guests`/`bookings`). Instead the
// client uploads the payment proof to storage itself (that bucket already
// allows anon uploads), then posts everything else here.
export async function POST(request: NextRequest) {
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
  if (!check_in_date || !check_out_date) return err('Check-in and check-out dates are required')
  if (check_out_date <= check_in_date) return err('Check-out date must be after check-in date')
  if (!Array.isArray(room_lines) || room_lines.length === 0) return err('At least one room must be selected')
  if (!payment_proof_url) return err('Payment proof is required')
  if (!payment_reference) return err('Payment reference is required')

  const today = new Date().toISOString().slice(0, 10)
  if (check_in_date < today) return err('Check-in date cannot be in the past')

  const roomIds = room_lines.map((l: RoomLineInput) => l.room_id)
  if (roomIds.some((id: any) => typeof id !== 'string' || !id)) {
    return err('Invalid room selection')
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
  const guestCode = `G-${Date.now().toString().slice(-6)}`
  const { data: guest, error: guestError } = await supabase
    .from('guests')
    .insert({ full_name, email: email || null, phone: phone || null, guest_code: guestCode })
    .select('id')
    .single()

  if (guestError) return err(guestError.message)

  // ---- Create one booking per selected room ----
  const groupNumber = room_lines.length > 1 ? `GRP-${Date.now().toString().slice(-8)}` : null
  const createdBookings: any[] = []

  for (let i = 0; i < room_lines.length; i++) {
    const rl = room_lines[i] as RoomLineInput
    const isPrimary = i === 0

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        booking_number: `BK-${Date.now()}${i}`,
        guest_id: guest.id,
        room_id: rl.room_id,
        booking_type: 'online',
        accommodation_type: 'room',
        num_adults: isPrimary ? num_adults : 0,
        num_children: isPrimary ? num_children : 0,
        group_number: groupNumber,
        is_group_primary: isPrimary,
        check_in_date, check_out_date,
        subtotal: rl.amount,
        total_amount: rl.amount,
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
