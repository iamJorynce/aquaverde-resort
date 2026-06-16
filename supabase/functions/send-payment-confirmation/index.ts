// =============================================================================
// supabase/functions/send-payment-confirmation/index.ts
// =============================================================================

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  try {
    const { transaction_id } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: txn } = await supabase
      .from('transactions')
      .select('*, guests ( full_name, email, phone ), bookings ( booking_number, total_amount, amount_paid )')
      .eq('id', transaction_id)
      .single()

    if (!txn) return new Response('Transaction not found', { status: 404 })

    const guest   = txn.guests as any
    const booking = txn.bookings as any
    const balance = Math.max(0, (booking?.total_amount ?? 0) - (booking?.amount_paid ?? 0))
    const results: Record<string, unknown> = {}

    if (guest?.email) {
      results.email = await sendEmail({
        to: guest.email,
        subject: `Payment Confirmed – ${booking?.booking_number} | AquaVerde Resort`,
        html: emailTemplates.paymentConfirmation({
          guestName:        guest.full_name,
          bookingNumber:    booking?.booking_number ?? '',
          amount:           txn.amount,
          paymentMethod:    txn.payment_method,
          reference:        txn.reference_number ?? '',
          remainingBalance: balance,
        }),
      })
    }

    if (guest?.phone) {
      results.sms = await sendSMS({
        to: guest.phone,
        message: smsTemplates.paymentConfirmation(
          booking?.booking_number ?? '', txn.amount, balance
        ),
      })
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})