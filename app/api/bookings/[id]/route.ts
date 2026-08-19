import { NextRequest } from 'next/server'
import { getSupabaseAndUser, ok, err, unauthorized, forbidden, requireRole } from '@/lib/api-helpers'

// =============================================================================
// src/app/api/bookings/[id]/route.ts
// =============================================================================

// GET /api/bookings/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
    .eq('id', id)
    .single()

  if (error) return err(error.message, 404)
  return ok(data)
}

// PATCH /api/bookings/[id] — update booking status, dates, etc.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin','resort_owner','front_desk','cashier']))
    return forbidden()

  const body = await request.json()
  const { data: old } = await supabase.from('bookings').select('*').eq('id', id).single()

  const { data, error } = await supabase
    .from('bookings')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return err(error.message)

  await supabase.from('audit_logs').insert({
    user_id: profile.id,
    action: 'UPDATE_BOOKING',
    table_name: 'bookings',
    record_id: id,
    old_data: old as any,
    new_data: data as any,
  })

  return ok(data)
}