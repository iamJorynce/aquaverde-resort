// =============================================================================
// supabase/functions/send-promo/index.ts
// Bulk promo SMS blast to all opted-in guests
// =============================================================================

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  try {
    const { promo_id, dry_run = false } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: promo } = await supabase
      .from('promotions').select('*').eq('id', promo_id).single()

    if (!promo) return new Response('Promo not found', { status: 404 })

    const { data: guests } = await supabase
      .from('guests')
      .select('phone, email, full_name')
      .eq('is_blacklisted', false)
      .not('phone', 'is', null)

    if (dry_run) {
      return new Response(JSON.stringify({
        success: true,
        dry_run: true,
        would_send: guests?.length ?? 0,
        promo: promo.title,
      }), { headers: { 'Content-Type': 'application/json' } })
    }

    const message = smsTemplates.promoAlert(
      promo.title,
      promo.promo_code ?? 'N/A',
      new Date(promo.valid_until).toLocaleDateString('en-PH')
    )

    let sent = 0
    for (const guest of guests ?? []) {
      if (!guest.phone) continue
      try {
        await sendSMS({ to: guest.phone, message })
        sent++
        // Rate limit: 5 SMS per second (Semaphore limit)
        await new Promise(r => setTimeout(r, 200))
      } catch (e) {
        console.error(`Failed to send to ${guest.phone}:`, e)
      }
    }

    await supabase.from('audit_logs').insert({
      action: 'PROMO_BLAST_SENT',
      table_name: 'promotions',
      record_id: promo_id,
      new_data: { sent, total: guests?.length },
    })

    return new Response(JSON.stringify({ success: true, sent, total: guests?.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})