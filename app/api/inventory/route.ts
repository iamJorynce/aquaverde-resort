import { NextRequest } from 'next/server'
import { getSupabaseAndUser, ok, err, unauthorized, forbidden, requireRole } from '@/lib/api-helpers'

export async function GET(request: NextRequest) {
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

  if (category_id) query = query.eq('category_id', category_id)

  const { data, error } = await query
  if (error) return err(error.message)

  // Column-to-column comparison isn't expressible via PostgREST filters,
  // so low-stock filtering happens client-side after fetch.
  const result = low_stock
    ? (data ?? []).filter((item: any) => (item.current_stock ?? 0) <= (item.reorder_level ?? 0))
    : data

  return ok(result)
}

export async function POST(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin','resort_owner']))
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