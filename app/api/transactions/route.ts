export async function GET_transactions(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin','resort_owner','front_desk','cashier']))
    return forbidden()

  const { searchParams } = new URL(request.url)
  const from   = searchParams.get('from')
  const to     = searchParams.get('to')
  const type   = searchParams.get('type')
  const limit  = parseInt(searchParams.get('limit') ?? '100')

  let query = supabase
    .from('transactions')
    .select('*, guests(full_name), bookings(booking_number), profiles!cashier_id(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (from)  query = query.gte('created_at', `${from}T00:00:00`)
  if (to)    query = query.lte('created_at', `${to}T23:59:59`)
  if (type)  query = query.eq('txn_type', type)

  const { data, error } = await query
  if (error) return err(error.message)
  return ok(data)
}

export async function POST_transaction(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin','resort_owner','front_desk','cashier']))
    return forbidden()

  const body = await request.json()

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      ...body,
      txn_number: `TXN-${Date.now()}`,
      cashier_id: profile.id,
    })
    .select()
    .single()

  if (error) return err(error.message)

  // Update booking amount_paid if applicable
  if (body.booking_id && body.txn_type !== 'refund') {
    const { data: booking } = await supabase
      .from('bookings').select('amount_paid, total_amount').eq('id', body.booking_id).single()

    if (booking) {
      const new_paid = booking.amount_paid + body.amount
      const new_status = new_paid >= booking.total_amount ? 'paid' :
        new_paid > 0 ? 'partial' : 'unpaid'
      await supabase.from('bookings')
        .update({ amount_paid: new_paid, payment_status: new_status })
        .eq('id', body.booking_id)
    }
  }

  return ok(data, 201)
}