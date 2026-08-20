import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Service-role Supabase client. Bypasses Row Level Security entirely.
 *
 * NEVER import this into any 'use client' file or expose it to the browser —
 * the service role key has full read/write access to every table. Only use
 * it inside app/api/**\/route.ts handlers, after you've validated the
 * request yourself (this client does none of that for you).
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars — service client cannot be created.'
    )
  }

  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
