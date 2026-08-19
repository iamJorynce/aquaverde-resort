export async function GET_rooms(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()

  const { searchParams } = new URL(request.url)
  const status  = searchParams.get('status')
  const type_id = searchParams.get('type_id')

  let query = supabase
    .from('rooms')
    .select('*, room_types_config(*)')
    .order('room_number')

  if (status)  query = query.eq('status', status)
  if (type_id) query = query.eq('room_type_id', type_id)

  const { data, error } = await query
  if (error) return err(error.message)
  return ok(data)
}

export async function PATCH_room_status(request: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin','resort_owner','front_desk']))
    return forbidden()

  const { status, notes } = await request.json()

  const { data, error } = await supabase
    .from('rooms')
    .update({ status, notes, last_cleaned_at: status === 'available' ? new Date().toISOString() : undefined })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return err(error.message)

  await supabase.from('audit_logs').insert({
    user_id: profile.id,
    action: 'UPDATE_ROOM_STATUS',
    table_name: 'rooms',
    record_id: params.id,
    new_data: { status },
  })

  return ok(data)
}
