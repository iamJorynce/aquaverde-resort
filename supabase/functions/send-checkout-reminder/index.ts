// =============================================================================
// supabase/functions/send-checkout-reminder/index.ts
// (Daily cron: 8AM PHT = 0AM UTC — runs on checkout day)
// Schedule: cron(0 0 * * *)
// =============================================================================

serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const today = new Date().toISOString().slice(0, 10)

    const { data: bookings } = await supabase
      .from('bookings')
      .select('*, guests ( full_name, phone )')
      .eq('check_out_date', today)
      .eq('status', 'checked_in')

    const results = []
    for (const booking of bookings ?? []) {
      const guest = booking.guests as any
      if (!guest?.phone) continue

      const checkOutDate = new Date(booking.check_out_date).toLocaleDateString('en-PH', { dateStyle: 'long' })
      await sendSMS({
        to: guest.phone,
        message: smsTemplates.checkOutReminder(guest.full_name, checkOutDate),
      })
      results.push(booking.id)
    }

    return new Response(JSON.stringify({ success: true, reminded: results.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})