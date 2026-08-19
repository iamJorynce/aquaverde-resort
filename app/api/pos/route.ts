export async function POST_pos_order(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin','resort_owner','front_desk','cashier','restaurant']))
    return forbidden()

  const {
    items,              // [{ menu_item_id, quantity, unit_price, notes }]
    booking_id,         // optional — charge to room
    table_number,
    order_type = 'dine_in',
    payment_method = 'cash',
    discount = 0,
    notes,
  } = await request.json()

  if (!items?.length) return err('No items in order')

  const subtotal = items.reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0)
  const total = subtotal - discount

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_number: `ORD-${Date.now()}`,
      booking_id,
      table_number,
      order_type,
      status: 'pending',
      subtotal,
      discount,
      total,
      payment_method: booking_id ? 'room_charge' : payment_method,
      notes,
      created_by: profile.id,
    })
    .select()
    .single()

  if (orderError) return err(orderError.message)

  // Insert order items
  await supabase.from('order_items').insert(
    items.map((item: any) => ({ ...item, order_id: order.id }))
  )

  // If room charge, add to booking extras
  if (booking_id) {
    await supabase.from('bookings')
      .update({ extras_total: supabase.rpc('add_extras', { booking_id, amount: total }) })
      .eq('id', booking_id)

    await supabase.from('booking_addons').insert({
      booking_id,
      name: `Restaurant Order #${order.order_number}`,
      quantity: 1,
      unit_price: total,
    })
  } else {
    // Direct payment transaction
    await supabase.from('transactions').insert({
      txn_number: `TXN-${Date.now()}`,
      txn_type: 'pos',
      description: `POS Order #${order.order_number}`,
      amount: total,
      payment_method,
      cashier_id: profile.id,
    })
  }

  return ok(order, 201)
}

// GET /api/pos/orders — active kitchen orders
export async function GET_pos_orders(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? undefined

  let query = supabase
    .from('orders')
    .select('*, order_items(*, menu_items(name))')
    .order('created_at', { ascending: true })

  if (status) query = query.eq('status', status)
  else query = query.in('status', ['pending', 'preparing', 'ready'])

  const { data, error } = await query
  if (error) return err(error.message)
  return ok(data)
}
