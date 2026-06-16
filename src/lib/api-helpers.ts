import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

export async function getSupabaseAndUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)),
      },
    }
  )
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase, user: null, profile: null }

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  return { supabase, user, profile }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status })
}

export function err(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}

export function unauthorized() {
  return err('Unauthorized', 401)
}

export function forbidden() {
  return err('Forbidden — insufficient permissions', 403)
}

type Role = 'super_admin'|'resort_owner'|'front_desk'|'cashier'|
            'staff'|'housekeeping'|'maintenance'|'restaurant'|'guest'

export function requireRole(profileRole: string | undefined, allowed: Role[]) {
  return allowed.includes(profileRole as Role)
}