import { NextRequest } from 'next/server'
import { getSupabaseAndUser, ok, err, unauthorized, forbidden, requireRole } from '@/lib/api-helpers'
import { todayInManila } from '@/lib/bookingDates'

export async function GET(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()

  const { searchParams } = new URL(request.url)
  const status      = searchParams.get('status')
  const assigned_to = searchParams.get('assigned_to')

  let query = supabase
    .from('housekeeping_tasks')
    .select('*, rooms(room_number), cottages(cottage_code, name), profiles!assigned_to(full_name)')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })

  if (status)      query = query.eq('status', status as 'pending' | 'cancelled' | 'in_progress' | 'completed')
  if (assigned_to) query = query.eq('assigned_to', assigned_to)
  else if (profile.role === 'housekeeping')
    query = query.eq('assigned_to', profile.id)

  const { data, error } = await query
  if (error) return err(error.message)
  return ok(data)
}

export async function POST(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin','resort_owner','front_desk','housekeeping']))
    return forbidden()

  const body = await request.json()

  const taskNumber = `HK-${todayInManila().replace(/-/g,'')}-${Date.now().toString().slice(-4)}`

  const { data, error } = await supabase
    .from('housekeeping_tasks')
    .insert({ ...body, task_number: taskNumber, created_by: profile.id })
    .select()
    .single()

  if (error) return err(error.message)
  return ok(data, 201)
}

export async function PATCH(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()

  const body = await request.json()
  const { id, ...rest } = body
  if (!id) return err('Missing required field: id')
  const updates: Record<string, any> = { ...rest }

  if (body.status === 'in_progress' && !body.started_at) updates.started_at = new Date().toISOString()
  if (body.status === 'completed' && !body.completed_at) updates.completed_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('housekeeping_tasks')
    .update(updates as any)
    .eq('id', id)
    .select()
    .single()

  if (error) return err(error.message)

  // If completed, set room to available
  if (body.status === 'completed' && data.room_id) {
    await supabase.from('rooms').update({ status: 'available', last_cleaned_at: new Date().toISOString() })
      .eq('id', data.room_id)
  }

  return ok(data)
}