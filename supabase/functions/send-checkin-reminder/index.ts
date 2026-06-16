// =============================================================================
// supabase/functions/send-checkin-reminder/index.ts
// (Triggered by a Supabase Database Cron — runs daily at 10AM)
// Schedule: cron(0 2 * * *)  ← 10AM PHT = 2AM UTC
// =============================================================================

serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get all bookings checking in tomorrow
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().slice(0, 10)

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        *,
        guests ( full_name, email, phone ),
        rooms ( room_number, room_types_config ( name ) ),
        cottages ( name )
      `)
      .eq('check_in_date', tomorrowStr)
      .in('status', ['confirmed', 'pending'])

    if (error) throw error

    const results = []
    for (const booking of bookings ?? []) {
      const guest = booking.guests as any
      const roomName = booking.rooms
        ? `Room ${(booking.rooms as any).room_number}`
        : (booking.cottages as any)?.name ?? 'Your accommodation'
      const checkInDate = new Date(booking.check_in_date).toLocaleDateString('en-PH', { dateStyle: 'long' })

      const sent: Record<string, unknown> = {}

      if (guest?.email) {
        sent.email = await sendEmail({
          to: guest.email,
          subject: `Check-in Tomorrow – ${booking.booking_number} | AquaVerde Resort`,
          html: emailTemplates.checkInReminder({
            guestName:     guest.full_name,
            bookingNumber: booking.booking_number,
            roomName,
            checkInDate,
          }),
        })
      }

      if (guest?.phone) {
        sent.sms = await sendSMS({
          to: guest.phone,
          message: smsTemplates.checkInReminder(guest.full_name, checkInDate),
        })
      }

      results.push({ booking_id: booking.id, ...sent })
    }

    return new Response(JSON.stringify({ success: true, sent: results.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})