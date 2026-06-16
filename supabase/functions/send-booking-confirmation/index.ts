// =============================================================================
// supabase/functions/send-booking-confirmation/index.ts
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmail } from '../_shared/email.ts'
import { sendSMS } from '../_shared/sms.ts'
import { emailTemplates, smsTemplates } from '../_shared/templates.ts'

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  try {
    const { booking_id } = await req.json()
    if (!booking_id) return new Response('booking_id required', { status: 400 })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        *,
        guests ( full_name, email, phone ),
        rooms ( room_number, room_types_config ( name ) ),
        cottages ( name )
      `)
      .eq('id', booking_id)
      .single()

    if (error || !booking) return new Response('Booking not found', { status: 404 })

    const guest = booking.guests as any
    const roomName = booking.rooms
      ? `Room ${booking.rooms.room_number} – ${(booking.rooms.room_types_config as any)?.name}`
      : (booking.cottages as any)?.name ?? 'Accommodation'

    const checkInDate  = new Date(booking.check_in_date).toLocaleDateString('en-PH', { dateStyle: 'long' })
    const checkOutDate = new Date(booking.check_out_date).toLocaleDateString('en-PH', { dateStyle: 'long' })

    const results: Record<string, unknown> = {}

    // Send email
    if (guest?.email) {
      results.email = await sendEmail({
        to: guest.email,
        subject: `Booking Confirmed – ${booking.booking_number} | AquaVerde Beach Resort`,
        html: emailTemplates.bookingConfirmation({
          guestName:     guest.full_name,
          bookingNumber: booking.booking_number,
          roomName,
          checkIn:       checkInDate,
          checkOut:      checkOutDate,
          numNights:     booking.num_nights,
          totalAmount:   booking.total_amount,
          paymentStatus: booking.payment_status,
        }),
      })
    }

    // Send SMS
    if (guest?.phone) {
      results.sms = await sendSMS({
        to: guest.phone,
        message: smsTemplates.bookingConfirmation(
          booking.booking_number, checkInDate, roomName
        ),
      })
    }

    // Log notification
    await supabase.from('audit_logs').insert({
      action: 'NOTIFICATION_SENT',
      table_name: 'bookings',
      record_id: booking_id,
      new_data: { type: 'booking_confirmation', channels: Object.keys(results) },
    })

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})