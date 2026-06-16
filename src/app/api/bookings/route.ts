import { NextRequest } from 'next/server'
import { getSupabaseAndUser, ok, err, unauthorized, forbidden, requireRole } from '@/lib/api-helpers'

// GET /api/bookings — list bookings (filtered by query params)
export async function GET_bookings(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()

  const { searchParams } = new URL(request.url)
  const status      = searchParams.get('status')
  const date        = searchParams.get('date')
  const guest_id    = searchParams.get('guest_id')
  const room_id     = searchParams.get('room_id')
  const from        = searchParams.get('from')
  const to          = searchParams.get('to')
  const limit       = parseInt(searchParams.get('limit') ?? '50')
  const page        = parseInt(searchParams.get('page') ?? '1')
  const offset      = (page - 1) * limit

  let query = supabase
    .from('bookings')
    .select(`
      *,
      guests ( id, full_name, phone, email, guest_code, loyalty_tier ),
      rooms ( id, room_number, room_types_config ( name, base_rate ) ),
      cottages ( id, cottage_code, name, type )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // Guests can only see their own bookings
  if (profile.role === 'guest') {
    const { data: guest } = await supabase
      .from('guests').select('id').eq('profile_id', profile.id).single()
    if (guest) query = query.eq('guest_id', guest.id)
  }

  if (status)   query = query.eq('status', status)
  if (guest_id) query = query.eq('guest_id', guest_id)
  if (room_id)  query = query.eq('room_id', room_id)
  if (date)     query = query.eq('check_in_date', date)
  if (from)     query = query.gte('check_in_date', from)
  if (to)       query = query.lte('check_in_date', to)

  const { data, error, count } = await query
  if (error) return err(error.message)

  return ok({ bookings: data, total: count, page, limit })
}

// POST /api/bookings — create new booking
export async function POST_bookings(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()

  const body = await request.json()
  const {
    guest_id, accommodation_type, room_id, cottage_id,
    check_in_date, check_out_date, num_adults = 1, num_children = 0,
    num_seniors = 0, num_pwd = 0, booking_type = 'online',
    special_requests, security_deposit = 0, addons = []
  } = body

  if (!guest_id || !check_in_date || !check_out_date || !accommodation_type) {
    return err('Missing required fields: guest_id, check_in_date, check_out_date, accommodation_type')
  }

  // Fetch rate
  let room_rate = 0
  if (room_id) {
    const { data: room } = await supabase
      .from('rooms')
      .select('room_types_config ( base_rate )')
      .eq('id', room_id).single()
    room_rate = (room?.room_types_config as any)?.base_rate ?? 0
  } else if (cottage_id) {
    const { data: cottage } = await supabase
      .from('cottages').select('day_rate').eq('id', cottage_id).single()
    room_rate = cottage?.day_rate ?? 0
  }

  const nights = Math.max(1,
    Math.ceil((new Date(check_out_date).getTime() - new Date(check_in_date).getTime()) / 86400000))
  const subtotal = room_rate * nights
  const addons_total = addons.reduce((s: number, a: any) => s + a.quantity * a.unit_price, 0)
  const total_amount = subtotal + addons_total + security_deposit

  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      guest_id, accommodation_type, room_id, cottage_id,
      check_in_date, check_out_date,
      num_adults, num_children, num_seniors, num_pwd,
      booking_type, room_rate, subtotal,
      extras_total: addons_total,
      total_amount, security_deposit,
      payment_status: 'unpaid',
      status: booking_type === 'walk_in' ? 'confirmed' : 'pending',
      special_requests,
      created_by: profile.id,
    })
    .select()
    .single()

  if (error) return err(error.message)

  // Insert add-ons
  if (addons.length && booking) {
    await supabase.from('booking_addons').insert(
      addons.map((a: any) => ({ ...a, booking_id: booking.id }))
    )
  }

  // Room/cottage → reserved
  if (room_id) await supabase.from('rooms').update({ status: 'reserved' }).eq('id', room_id)
  if (cottage_id) await supabase.from('cottages').update({ status: 'reserved' }).eq('id', cottage_id)

  // Auto-generate invoice
  await supabase.from('invoices').insert({
    invoice_number: `INV-${Date.now()}`,
    booking_id: booking!.id,
    guest_id,
    subtotal,
    total: total_amount,
    status: 'unpaid',
    due_date: check_in_date,
    created_by: profile.id,
  })

  // Audit log
  await supabase.from('audit_logs').insert({
    user_id: profile.id,
    action: 'CREATE_BOOKING',
    table_name: 'bookings',
    record_id: booking!.id,
    new_data: booking,
  })

  return ok(booking, 201)
}
