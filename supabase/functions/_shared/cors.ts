// =============================================================================
// supabase/functions/_shared/cors.ts
// =============================================================================
// Browsers send a preflight OPTIONS request before any cross-origin POST.
// Without these headers (and without handling OPTIONS explicitly), the
// browser blocks the real request before it's even sent — this is why
// calls from the dashboard/booking page fail with no useful error client-side,
// while the function logs show a 405 on an OPTIONS request.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
