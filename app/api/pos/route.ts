import { NextRequest } from 'next/server'
import { getSupabaseAndUser, ok, err, unauthorized, forbidden, requireRole } from '@/lib/api-helpers'

export async function POST(request: NextRequest) {
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

  // Stock check — a menu item can be tied to inventory in one of two ways,
  // and unlinked items skip this check entirely:
  //   1. Recipe (menu_item_ingredients) — food/prepared items, one or more
  //      ingredients each with their own quantity_per_unit.
  //   2. Direct stock (menu_items.direct_inventory_item_id) — merchandise,
  //      always exactly 1:1 (order 10 pcs -> deduct 10 pcs), no recipe rows.
  const menuItemIds = Array.from(new Set(items.map((i: any) => i.menu_item_id)))

  // Cast: menu_item_ingredients / direct_inventory_item_id aren't in the
  // generated Database types yet — run `npx supabase gen types typescript`
  // after applying the migrations to pick them up, then these casts can be
  // removed.
  const [{ data: recipeRows }, { data: directRows }] = await Promise.all([
    (supabase as any)
      .from('menu_item_ingredients')
      .select('menu_item_id, inventory_item_id, quantity_per_unit, inventory_items(name, current_stock, unit)')
      .in('menu_item_id', menuItemIds),
    (supabase as any)
      .from('menu_items')
      .select('id, direct_inventory_item_id, inventory_items(name, current_stock, unit)')
      .in('id', menuItemIds)
      .not('direct_inventory_item_id', 'is', null),
  ])

  const required: Record<string, { qty: number; name: string; unit: string; available: number }> = {}

  function addRequirement(key: string, need: number, name: string, unit: string, available: number) {
    if (!required[key]) required[key] = { qty: 0, name, unit, available }
    required[key].qty += need
  }

  for (const item of items) {
    // Recipe ingredients (food/prepared items — may be several, fractional quantities).
    const ingredients = (recipeRows ?? []).filter((r: any) => r.menu_item_id === item.menu_item_id)
    for (const ing of ingredients as any[]) {
      addRequirement(
        ing.inventory_item_id,
        ing.quantity_per_unit * item.quantity,
        ing.inventory_items?.name ?? 'item',
        ing.inventory_items?.unit ?? '',
        ing.inventory_items?.current_stock ?? 0
      )
    }

    // Direct stock link (merchandise — always exactly 1:1).
    const direct = (directRows ?? []).find((r: any) => r.id === item.menu_item_id)
    if (direct?.direct_inventory_item_id) {
      addRequirement(
        direct.direct_inventory_item_id,
        item.quantity,
        direct.inventory_items?.name ?? 'item',
        direct.inventory_items?.unit ?? '',
        direct.inventory_items?.current_stock ?? 0
      )
    }
  }

  const insufficient = Object.values(required).filter(r => r.qty > r.available)
  if (insufficient.length > 0) {
    return err(
      `Not enough stock — ${insufficient.map(r => `${r.name} (need ${r.qty}${r.unit}, have ${r.available}${r.unit})`).join(', ')}`
    )
  }

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

  // Auto-deduct inventory stock — covers both recipe ingredients and
  // direct-stock (merchandise) links consumed by this order.
  const movementRows = Object.entries(required).map(([inventory_item_id, r]) => ({
    item_id: inventory_item_id,
    movement_type: 'out' as const,
    quantity: r.qty,
    reference: order.order_number,
    notes: `POS sale — ${order.order_number}`,
    created_by: profile.id,
  }))
  if (movementRows.length > 0) {
    await supabase.from('inventory_movements').insert(movementRows)
  }

  // If room charge, add to booking extras (RPC not available — read then increment)
  if (booking_id) {
    const { data: bookingRow } = await supabase
      .from('bookings').select('extras_total').eq('id', booking_id).single()
    await supabase.from('bookings')
      .update({ extras_total: (bookingRow?.extras_total ?? 0) + total })
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
      status: 'completed',
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
export async function GET(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? undefined

  let query = supabase
    .from('orders')
    .select('*, order_items(*, menu_items(name))')
    .order('created_at', { ascending: true })

  if (status) query = query.eq('status', status as 'pending' | 'cancelled' | 'preparing' | 'ready' | 'served')
  else query = query.in('status', ['pending', 'preparing', 'ready'])

  const { data, error } = await query
  if (error) return err(error.message)
  return ok(data)
}
