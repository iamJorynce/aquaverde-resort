// =============================================================================
// supabase/functions/send-booking-confirmation/index.ts
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmail } from '../_shared/email.ts'
import { sendSMS } from '../_shared/sms.ts'
import { emailTemplates, smsTemplates } from '../_shared/templates.ts'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  // Browser preflight — must return 200 with CORS headers, not 405.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })

  try {
    const { booking_id } = await req.json()
    if (!booking_id) return new Response('booking_id required', { status: 400, headers: corsHeaders })

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

    if (error || !booking) return new Response('Booking not found', { status: 404, headers: corsHeaders })

    const guest = booking.guests as any
    const roomName = booking.rooms
      ? `Room ${booking.rooms.room_number} – ${(booking.rooms.room_types_config as any)?.name}`
      : (booking.cottages as any)?.name ?? 'Accommodation'

    const checkInDate  = new Date(booking.check_in_date).toLocaleDateString('en-PH', { dateStyle: 'long' })
    const checkOutDate = new Date(booking.check_out_date).toLocaleDateString('en-PH', { dateStyle: 'long' })

    const results: Record<string, unknown> = {}
    const failures: Record<string, string> = {}

    // Send email and SMS independently — a failure in one (e.g. SMS
    // provider not yet approved) must not mask or cancel the other, since
    // previously both were awaited under one try/catch and a single
    // failure made the whole request return 500 even when the email had
    // already gone out successfully.
    if (guest?.email) {
      try {
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
      } catch (emailErr) {
        console.error('Email send failed:', emailErr)
        failures.email = String(emailErr)
      }
    }

    if (guest?.phone) {
      // SMS is optional — skip quietly until SMS_ENABLED=true is set as a
      // secret (e.g. once the Semaphore account is approved/topped up).
      // Without this flag we'd otherwise log an "SMS send failed" error
      // on every single confirmation, which just adds noise while SMS
      // isn't actually in use yet.
      if (Deno.env.get('SMS_ENABLED') === 'true') {
        try {
          results.sms = await sendSMS({
            to: guest.phone,
            message: smsTemplates.bookingConfirmation(
              booking.booking_number, checkInDate, roomName
            ),
          })
        } catch (smsErr) {
          console.error('SMS send failed:', smsErr)
          failures.sms = String(smsErr)
        }
      }
    }

    // Log notification
    await supabase.from('audit_logs').insert({
      action: 'NOTIFICATION_SENT',
      table_name: 'bookings',
      record_id: booking_id,
      new_data: { type: 'booking_confirmation', channels: Object.keys(results), failed: Object.keys(failures) },
    })

    return new Response(JSON.stringify({ success: Object.keys(results).length > 0, results, failures }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})