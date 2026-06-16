// =============================================================================
// supabase/functions/_shared/sms.ts  (Semaphore — Philippine SMS gateway)
// =============================================================================

export async function sendSMS({
  to, message,
}: { to: string; message: string }) {
  const params = new URLSearchParams({
    apikey:      Deno.env.get('SEMAPHORE_API_KEY') ?? '',
    number:      to.replace(/\D/g, ''),
    message,
    sendername:  'AQUAVERDE',
  })

  const res = await fetch('https://api.semaphore.co/api/v4/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`SMS send failed: ${error}`)
  }

  return res.json()
}