export async function POST_checkout(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin','resort_owner','front_desk','cashier']))
    return forbidden()

  const {
    booking_id,
    additional_charges = [],
    damage_charge = 0,
    damage_notes,
    discount_amount = 0,
    discount_reason,
    payment_method = 'cash',
    return_deposit = true,
  } = await request.json()

  if (!booking_id) return err('booking_id required')

  const { data: booking } = await supabase
    .from('bookings').select('*').eq('id', booking_id).single()

  if (!booking) return err('Booking not found', 404)
  if (booking.status !== 'checked_in') return err('Booking is not checked in')

  // Calculate final bill
  const extras = additional_charges.reduce((s: number, c: any) => s + c.amount, 0) + damage_charge
  const final_total = booking.total_amount + extras - discount_amount
  const balance = final_total - booking.amount_paid
  const deposit_refund = return_deposit ? booking.security_deposit : 0

  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'checked_out',
      actual_check_out: new Date().toISOString(),
      extras_total: booking.extras_total + extras,
      discount_amount: booking.discount_amount + discount_amount,
      discount_reason,
      total_amount: final_total,
      payment_status: balance <= 0 ? 'paid' : 'partial',
      deposit_returned: return_deposit,
    })
    .eq('id', booking_id)
    .select()
    .single()

  if (error) return err(error.message)

  // Final payment transaction
  if (balance > 0) {
    await supabase.from('transactions').insert({
      txn_number: `TXN-${Date.now()}`,
      booking_id,
      guest_id: booking.guest_id,
      txn_type: 'room',
      description: 'Final payment on check-out',
      amount: balance,
      payment_method,
      cashier_id: profile.id,
    })
  }

  // Deposit refund transaction
  if (deposit_refund > 0) {
    await supabase.from('transactions').insert({
      txn_number: `TXN-${Date.now() + 1}`,
      booking_id,
      guest_id: booking.guest_id,
      txn_type: 'refund',
      description: 'Security deposit refund',
      amount: -deposit_refund,
      payment_method,
      cashier_id: profile.id,
    })
  }

  await supabase.from('audit_logs').insert({
    user_id: profile.id,
    action: 'CHECK_OUT',
    table_name: 'bookings',
    record_id: booking_id,
    new_data: { checked_out_at: new Date().toISOString(), final_total, balance },
  })

  return ok({ booking: data, balance, deposit_refund })
}
