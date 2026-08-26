import { NextRequest } from 'next/server'
import { getSupabaseAndUser, ok, err, unauthorized, forbidden, requireRole } from '@/lib/api-helpers'

export async function GET() {
  const { supabase } = await getSupabaseAndUser()
  // No auth check here on purpose: resort_name/check-in-out/contact info is
  // public (shown on the login page, guest receipts, confirmation emails,
  // the public site, etc.). The resort_settings_select RLS policy already
  // grants SELECT to both `anon` and `authenticated`, so this just lets the
  // API route match what the database already allows. PATCH below stays
  // restricted to super_admin/resort_owner.

  const { data, error } = await supabase
    .from('resort_settings')
    .select('*')
    .eq('id', 1)
    .single()

  if (error) return err(error.message)
  return ok(data)
}

export async function PATCH(request: NextRequest) {
  const { supabase, profile, user } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin', 'resort_owner']))
    return forbidden()

  const body = await request.json()
  const { resort_name, contact, email, address, check_in_time, check_out_time, gcash_number, bank_name, bank_account_number, facebook_url } = body

  const { data, error } = await supabase
    .from('resort_settings')
    .update({
      resort_name,
      contact,
      email,
      address,
      check_in_time,
      check_out_time,
      gcash_number,
      bank_name,
      bank_account_number,
      facebook_url,
      updated_at: new Date().toISOString(),
      updated_by: user?.id,
    })
    .eq('id', 1)
    .select()
    .single()

  if (error) return err(error.message)
  return ok(data)
}