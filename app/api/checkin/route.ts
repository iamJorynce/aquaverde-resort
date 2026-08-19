export async function POST_checkin(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin','resort_owner','front_desk']))
    return forbidden()

  const { booking_id, wristband_number, security_deposit_paid } = await request.json()
  if (!booking_id) return err('booking_id required')

  const { data: booking } = await supabase
    .from('bookings').select('*').eq('id', booking_id).single()

  if (!booking) return err('Booking not found', 404)
  if (booking.status !== 'confirmed' && booking.status !== 'pending')
    return err(`Cannot check in booking with status: ${booking.status}`)

  const wristband = wristband_number ?? `WB-${Date.now().toString().slice(-6)}`

  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'checked_in',
      actual_check_in: new Date().toISOString(),
      wristband_number: wristband,
      security_deposit: security_deposit_paid ?? booking.security_deposit,
    })
    .eq('id', booking_id)
    .select()
    .single()

  if (error) return err(error.message)

  // Record deposit transaction
  if (security_deposit_paid > 0) {
    await supabase.from('transactions').insert({
      txn_number: `TXN-${Date.now()}`,
      booking_id,
      guest_id: booking.guest_id,
      txn_type: 'deposit',
      description: 'Security Deposit',
      amount: security_deposit_paid,
      payment_method: 'cash',
      cashier_id: profile.id,
    })
  }

  await supabase.from('audit_logs').insert({
    user_id: profile.id,
    action: 'CHECK_IN',
    table_name: 'bookings',
    record_id: booking_id,
    new_data: { wristband, checked_in_at: new Date().toISOString() },
  })

  return ok({ booking: data, wristband_number: wristband })
}
