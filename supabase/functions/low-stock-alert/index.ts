// =============================================================================
// supabase/functions/low-stock-alert/index.ts
// Daily cron to notify admin of low stock items
// Schedule: cron(0 22 * * *)  ← 6AM PHT = 10PM UTC
// =============================================================================

serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: lowItems } = await supabase
      .from('vw_low_stock_items')
      .select('*')

    if (!lowItems?.length) {
      return new Response(JSON.stringify({ success: true, message: 'No low stock items' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Get admin emails
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['super_admin', 'resort_owner'])

    // Get linked auth emails for admins (via service role)
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const adminIds = new Set((admins ?? []).map(a => a.id))
    const adminEmails = users
      .filter(u => adminIds.has(u.id) && u.email)
      .map(u => u.email!)

    const itemList = lowItems
      .map(i => `<tr><td>${i.name}</td><td style="color:red;font-weight:600">${i.current_stock} ${i.unit}</td><td>${i.reorder_level} ${i.unit}</td></tr>`)
      .join('')

    const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:Arial,sans-serif}table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}
</style></head><body>
<h2>⚠️ Low Stock Alert — AquaVerde Beach Resort</h2>
<p>${lowItems.length} item(s) are below reorder level:</p>
<table><thead><tr><th>Item</th><th>Current Stock</th><th>Reorder Level</th></tr></thead>
<tbody>${itemList}</tbody></table>
<p style="color:#888;font-size:12px">Generated: ${new Date().toLocaleString('en-PH')}</p>
</body></html>`

    for (const email of adminEmails) {
      await sendEmail({
        to: email,
        subject: `⚠️ Low Stock Alert – ${lowItems.length} item(s) need reordering`,
        html,
      })
    }

    return new Response(JSON.stringify({
      success: true,
      low_items: lowItems.length,
      notified: adminEmails.length,
    }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})