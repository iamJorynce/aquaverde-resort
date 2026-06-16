export async function GET_maintenance(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabase
    .from('maintenance_requests')
    .select('*, rooms(room_number), cottages(cottage_code), profiles!reported_by(full_name), profiles!assigned_to(full_name)')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (profile.role === 'maintenance') query = query.eq('assigned_to', profile.id)

  const { data, error } = await query
  if (error) return err(error.message)
  return ok(data)
}

export async function POST_maintenance(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()

  const body = await request.json()
  const ticketNumber = `MT-${Date.now().toString().slice(-6)}`

  const { data, error } = await supabase
    .from('maintenance_requests')
    .insert({ ...body, ticket_number: ticketNumber, reported_by: profile.id })
    .select()
    .single()

  if (error) return err(error.message)

  // If room, flag it for maintenance
  if (body.room_id && body.priority === 'urgent') {
    await supabase.from('rooms').update({ status: 'maintenance' }).eq('id', body.room_id)
  }

  return ok(data, 201)
}
