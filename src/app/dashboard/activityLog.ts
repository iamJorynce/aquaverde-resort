import type { SupabaseClient } from '@supabase/supabase-js'

interface LogActivityParams {
  action: string          // e.g. 'PAYMENT_RECEIVED', 'TASK_ASSIGNED', 'CHECK_IN', 'EQUIPMENT_RENTED'
  details?: string        // human-readable summary, e.g. "₱500 cash for booking BK-2026-1042"
  table_name?: string
  record_id?: string
}

// Records who performed an action and when, into the activity_logs table.
// This is intentionally "fire and forget" — logging failures should never
// block the actual business operation (a payment going through matters
// more than the log entry succeeding). Errors are swallowed and only
// logged to the console for debugging.
export async function logActivity(supabase: SupabaseClient, params: LogActivityParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .single()

    await supabase.from('activity_logs').insert({
      user_id: user.id,
      user_name: profile?.full_name ?? 'Unknown',
      user_role: profile?.role ?? 'unknown',
      action: params.action,
      details: params.details ?? null,
      table_name: params.table_name ?? null,
      record_id: params.record_id ?? null,
    })
  } catch (err) {
    console.error('Activity log failed (non-blocking):', err)
  }
}
