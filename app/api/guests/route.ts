import { NextRequest } from 'next/server'
import { getSupabaseAndUser, ok, err, unauthorized, forbidden, requireRole } from '@/lib/api-helpers'
import { sanitizeSearchTerm } from '@/lib/validation'

export async function GET(request: NextRequest) {
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
    // Strip characters that are structural in PostgREST's filter syntax
    // (`,` separates OR conditions, `(`/`)` group them) so a search term
    // like `x,full_name.ilike.*` can't inject extra conditions into the
    // query below. Legitimate guest-name/phone/email searches never need
    // these characters.
    const safeSearch = sanitizeSearchTerm(search)
    query = query.or(`full_name.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,guest_code.ilike.%${safeSearch}%`)
  }

  const { data, error } = await query
  if (error) return err(error.message)
  return ok(data)
}

export async function POST(request: NextRequest) {
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
