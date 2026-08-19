export async function GET_reports(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin','resort_owner']))
    return forbidden()

  const { searchParams } = new URL(request.url)
  const type  = searchParams.get('type') ?? 'daily'
  const from  = searchParams.get('from') ?? new Date().toISOString().slice(0, 10)
  const to    = searchParams.get('to')   ?? new Date().toISOString().slice(0, 10)

  const [
    { data: revenue },
    { data: bookingStats },
    { data: occupancy },
    { data: topGuests },
  ] = await Promise.all([
    supabase.from('transactions')
      .select('amount, txn_type, created_at')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`)
      .eq('voided', false),
    supabase.from('bookings')
      .select('status, booking_type, total_amount, created_at')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`),
    supabase.from('rooms').select('status'),
    supabase.from('guests')
      .select('full_name, loyalty_points, loyalty_tier')
      .order('loyalty_points', { ascending: false })
      .limit(10),
  ])

  const totalRevenue = (revenue ?? []).reduce((s, t) => s + t.amount, 0)
  const byType = (revenue ?? []).reduce((acc: Record<string, number>, t) => {
    acc[t.txn_type] = (acc[t.txn_type] ?? 0) + t.amount
    return acc
  }, {})

  const roomCount   = (occupancy ?? []).length
  const occupiedCount = (occupancy ?? []).filter(r => r.status === 'occupied').length
  const occupancyRate = roomCount > 0 ? Math.round((occupiedCount / roomCount) * 100) : 0

  return ok({
    period: { from, to, type },
    revenue: { total: totalRevenue, by_type: byType },
    bookings: {
      total: bookingStats?.length ?? 0,
      by_status: (bookingStats ?? []).reduce((acc: Record<string, number>, b) => {
        acc[b.status] = (acc[b.status] ?? 0) + 1
        return acc
      }, {}),
      by_type: (bookingStats ?? []).reduce((acc: Record<string, number>, b) => {
        acc[b.booking_type] = (acc[b.booking_type] ?? 0) + 1
        return acc
      }, {}),
    },
    occupancy: { rate: occupancyRate, occupied: occupiedCount, total: roomCount },
    top_guests: topGuests,
  })
}