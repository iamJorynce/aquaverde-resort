export async function GET_inventory(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin','resort_owner','front_desk','cashier']))
    return forbidden()

  const { searchParams } = new URL(request.url)
  const low_stock = searchParams.get('low_stock') === 'true'
  const category_id = searchParams.get('category_id')

  let query = supabase
    .from('inventory_items')
    .select('*, inventory_categories(name), suppliers(name)')
    .eq('is_active', true)
    .order('name')

  if (low_stock) query = query.lte('current_stock', supabase.raw('reorder_level'))
  if (category_id) query = query.eq('category_id', category_id)

  const { data, error } = await query
  if (error) return err(error.message)
  return ok(data)
}

export async function POST_inventory_movement(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin','resort_owner','front_desk']))
    return forbidden()

  const body = await request.json()
  const { data, error } = await supabase
    .from('inventory_movements')
    .insert({ ...body, created_by: profile.id })
    .select()
    .single()

  if (error) return err(error.message)
  return ok(data, 201)
}