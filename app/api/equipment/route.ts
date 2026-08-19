export async function POST_equipment_rental(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin','resort_owner','front_desk','cashier']))
    return forbidden()

  const {
    equipment_id, booking_id, guest_id,
    quantity = 1, rate_type = 'hourly', expected_return,
  } = await request.json()

  const { data: equip } = await supabase
    .from('equipment').select('*').eq('id', equipment_id).single()

  if (!equip) return err('Equipment not found', 404)
  if (equip.available_qty < quantity) return err(`Only ${equip.available_qty} unit(s) available`)

  const rate = rate_type === 'hourly' ? equip.hourly_rate : equip.daily_rate

  const { data, error } = await supabase
    .from('equipment_rentals')
    .insert({
      rental_number: `RNT-${Date.now()}`,
      equipment_id, booking_id, guest_id,
      quantity, rate_type, rate_amount: rate ?? 0,
      rental_start: new Date().toISOString(),
      expected_return,
      deposit_paid: equip.deposit_amount * quantity,
      created_by: profile.id,
    })
    .select()
    .single()

  if (error) return err(error.message)

  await supabase.from('equipment')
    .update({ available_qty: equip.available_qty - quantity })
    .eq('id', equipment_id)

  return ok(data, 201)
}