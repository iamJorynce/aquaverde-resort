export async function POST_dayuse(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin','resort_owner','front_desk','cashier']))
    return forbidden()

  const {
    num_adults = 0, num_children = 0, num_seniors = 0,
    num_pwd = 0, num_infants = 0,
    with_parking = false, cottage_id,
    payment_method = 'cash', notes,
  } = await request.json()

  // Fetch rates
  const { data: rates } = await supabase.from('day_use_rates').select('*').eq('is_active', true)
  const rateMap = Object.fromEntries((rates ?? []).map(r => [r.guest_type, r.rate]))

  let total =
    num_adults   * (rateMap['adult']  ?? 150) +
    num_children * (rateMap['child']  ?? 80)  +
    num_seniors  * (rateMap['senior'] ?? 120) +
    num_pwd      * (rateMap['pwd']    ?? 120)

  if (with_parking) total += 100

  if (cottage_id) {
    const { data: cottage } = await supabase.from('cottages').select('day_rate').eq('id', cottage_id).single()
    total += cottage?.day_rate ?? 0
  }

  const total_pax = num_adults + num_children + num_seniors + num_pwd + num_infants
  const wristbands = Array.from({ length: total_pax }, (_, i) =>
    `WB-${Date.now().toString().slice(-4)}-${String(i + 1).padStart(2, '0')}`)

  const entryNumber = `DU-${Date.now()}`

  const { data, error } = await supabase
    .from('day_use_entries')
    .insert({
      entry_number: entryNumber,
      num_adults, num_children, num_seniors, num_pwd, num_infants,
      with_parking, cottage_id,
      total_amount: total,
      payment_method,
      wristbands,
      notes,
      created_by: profile.id,
    })
    .select()
    .single()

  if (error) return err(error.message)

  // Transaction record
  await supabase.from('transactions').insert({
    txn_number: `TXN-${Date.now()}`,
    day_use_id: data.id,
    txn_type: 'day_use',
    description: `Day Use Entry – ${total_pax} guest(s)`,
    amount: total,
    payment_method,
    cashier_id: profile.id,
  })

  if (cottage_id) {
    await supabase.from('cottages').update({ status: 'occupied' }).eq('id', cottage_id)
  }

  return ok({ entry: data, wristbands, total }, 201)
}
