// =============================================================================
// src/app/api/bookings/[id]/route.ts
// =============================================================================

// GET /api/bookings/[id]
export async function GET_booking_by_id(request: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      guests ( * ),
      rooms ( *, room_types_config ( * ) ),
      cottages ( * ),
      booking_addons ( * ),
      payment_proofs ( * ),
      transactions ( * ),
      invoices ( * )
    `)
    .eq('id', params.id)
    .single()

  if (error) return err(error.message, 404)
  return ok(data)
}

// PATCH /api/bookings/[id] — update booking status, dates, etc.
export async function PATCH_booking(request: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin','resort_owner','front_desk','cashier']))
    return forbidden()

  const body = await request.json()
  const { data: old } = await supabase.from('bookings').select('*').eq('id', params.id).single()

  const { data, error } = await supabase
    .from('bookings')
    .update(body)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return err(error.message)

  await supabase.from('audit_logs').insert({
    user_id: profile.id,
    action: 'UPDATE_BOOKING',
    table_name: 'bookings',
    record_id: params.id,
    old_data: old,
    new_data: data,
  })

  return ok(data)
}