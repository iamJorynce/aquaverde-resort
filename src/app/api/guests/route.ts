export async function GET_guests(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin','resort_owner','front_desk','cashier']))
    return forbidden()

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')
  const limit  = parseInt(searchParams.get('limit') ?? '50')

  let query = supabase
    .from('guests')
    .select('*, bookings(count)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,guest_code.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) return err(error.message)
  return ok(data)
}

export async function POST_guest(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()

  const body = await request.json()
  const guestCode = `G-${Date.now().toString().slice(-6)}`

  const { data, error } = await supabase
    .from('guests')
    .insert({ ...body, guest_code: guestCode })
    .select()
    .single()

  if (error) return err(error.message)
  return ok(data, 201)
}
