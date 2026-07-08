'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PaymentCalculator, { isPaymentValid, paymentValidationMessage } from './PaymentCalculator'
import { logActivity } from './activityLog'
import { usePermissions } from './permissions'
import { printReceipt } from './receipt'
import { createOrUpdateInvoice } from './invoiceUtils'

interface RateRow { id: string; name: string; guest_type: string; area: string; rate: number }
interface CottageOption { id: string; name: string; cottage_code: string; day_rate: number; status: string }
interface EquipmentOption { id: string; name: string; hourly_rate: number | null; daily_rate: number | null; available_qty: number }

// Per-area guest counts
interface AreaCounts { adult: number; child: number; senior: number; pwd: number }

export default function DayUsePage() {
  const supabase = createClient()
  const { role } = usePermissions()
  const isAdmin = role === 'super_admin' || role === 'resort_owner'

  const [rates, setRates] = useState<RateRow[]>([])
  const [cottages, setCottages] = useState<CottageOption[]>([])
  const [equipment, setEquipment] = useState<EquipmentOption[]>([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<{ entryNumber: string; wristbands: string[] } | null>(null)
  const [error, setError] = useState('')

  // Rates management
  const [editingRates, setEditingRates] = useState(false)
  const [rateForm, setRateForm] = useState<Record<string, { name: string; guest_type: string; area: string; rate: number }>>({})
  const [newRate, setNewRate] = useState({ name: '', guest_type: 'adult', area: '', rate: 0 })

  // Per-area guest counts — key is area name
  const [areaCounts, setAreaCounts] = useState<Record<string, AreaCounts>>({})

  const [form, setForm] = useState({
    guest_name: '', guest_phone: '',
    with_parking: false,
    cottage_ids: [] as string[],
    equipment_selections: {} as Record<string, { selected: boolean; quantity: number; rateType: 'hourly' | 'daily'; units: number }>,
  })

  const [payment, setPayment] = useState({ method: 'cash', amountTendered: 0 })

  async function load() {
    const [{ data: rateData }, { data: cottageData }, { data: eqData }] = await Promise.all([
      supabase.from('day_use_rates').select('*').eq('is_active', true).order('area').order('guest_type'),
      supabase.from('cottages').select('id, name, cottage_code, day_rate, status').eq('status', 'available').order('cottage_code'),
      supabase.from('equipment').select('id, name, hourly_rate, daily_rate, available_qty').eq('is_active', true).gt('available_qty', 0).order('name'),
    ])
    setRates(rateData ?? [])
    setRateForm({})
    setCottages(cottageData ?? [])
    setEquipment(eqData ?? [])
  }

  useEffect(() => { load() }, [])

  const areas = Array.from(new Set(rates.map(r => r.area)))

  function getRate(area: string, type: string) {
    return rates.find(r => r.area === area && r.guest_type === type)?.rate ?? 0
  }

  function setCount(area: string, type: keyof AreaCounts, value: number) {
    setAreaCounts(p => ({
      ...p,
      [area]: { ...(p[area] ?? { adult: 0, child: 0, senior: 0, pwd: 0 }), [type]: Math.max(0, value) },
    }))
  }

  function getCount(area: string, type: keyof AreaCounts) {
    return areaCounts[area]?.[type] ?? 0
  }

  // Area fee = sum of (count × rate) for each guest type
  function areaFee(area: string) {
    const c = areaCounts[area] ?? { adult: 0, child: 0, senior: 0, pwd: 0 }
    return c.adult   * getRate(area, 'adult')
         + c.child   * getRate(area, 'child')
         + c.senior  * getRate(area, 'senior')
         + c.pwd     * getRate(area, 'pwd')
  }

  const totalAreaFees = areas.reduce((s, a) => s + areaFee(a), 0)
  const totalPax = areas.reduce((s, a) => {
    const c = areaCounts[a] ?? { adult: 0, child: 0, senior: 0, pwd: 0 }
    return s + c.adult + c.child + c.senior + c.pwd
  }, 0)

  const parkingFee = form.with_parking ? 100 : 0
  const selectedCottages = cottages.filter(c => form.cottage_ids.includes(c.id))
  const cottageFee = selectedCottages.reduce((s, c) => s + Number(c.day_rate), 0)

  const equipmentLines = Object.entries(form.equipment_selections)
    .filter(([, s]) => s.selected)
    .map(([id, s]) => {
      const item = equipment.find(e => e.id === id)
      if (!item) return null
      const r = s.rateType === 'hourly' ? item.hourly_rate ?? 0 : item.daily_rate ?? 0
      return { id, name: item.name, quantity: s.quantity, units: s.units, rateType: s.rateType, amount: r * s.quantity * s.units }
    }).filter(Boolean) as any[]

  const equipmentFee = equipmentLines.reduce((s, l) => s + l.amount, 0)
  const total = totalAreaFees + parkingFee + cottageFee + equipmentFee

  function toggleCottage(id: string) {
    setForm(p => ({
      ...p,
      cottage_ids: p.cottage_ids.includes(id) ? p.cottage_ids.filter(c => c !== id) : [...p.cottage_ids, id],
    }))
  }

  function toggleEquipment(id: string, item: EquipmentOption) {
    setForm(p => {
      const cur = p.equipment_selections[id]
      return {
        ...p,
        equipment_selections: {
          ...p.equipment_selections,
          [id]: { selected: !cur?.selected, quantity: cur?.quantity ?? 1, rateType: cur?.rateType ?? (item.hourly_rate ? 'hourly' : 'daily'), units: cur?.units ?? 1 },
        },
      }
    })
  }

  function updateEqField(id: string, field: 'quantity' | 'units' | 'rateType', value: any) {
    setForm(p => ({
      ...p,
      equipment_selections: { ...p.equipment_selections, [id]: { ...p.equipment_selections[id], [field]: value } },
    }))
  }

  // ---- Rates CRUD ----
  async function saveRates(e: React.FormEvent) {
    e.preventDefault()
    for (const r of rates) {
      const u = rateForm[r.id]
      if (u) await supabase.from('day_use_rates').update({ name: u.name ?? r.name, guest_type: u.guest_type ?? r.guest_type, area: u.area ?? r.area, rate: u.rate ?? r.rate }).eq('id', r.id)
    }
    setEditingRates(false)
    load()
  }

  async function addNewRate() {
    if (!newRate.name || !newRate.area || newRate.rate <= 0) return
    await supabase.from('day_use_rates').insert({ ...newRate, is_active: true })
    setNewRate({ name: '', guest_type: 'adult', area: '', rate: 0 })
    load()
  }

  async function deleteRate(id: string) {
    if (!confirm('Delete this rate?')) return
    await supabase.from('day_use_rates').delete().eq('id', id)
    load()
  }

  // ---- Submit ----
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (totalPax === 0) { setError('Please enter the number of guests.'); return }
    setLoading(true)
    setError('')

    const paymentError = paymentValidationMessage(payment.method, total, payment.amountTendered)
    if (paymentError) { setError(paymentError); setLoading(false); return }

    try {
      const entryNumber = `DU-${Date.now()}`
      const wristbands = Array.from({ length: totalPax }, (_, i) =>
        `WB-${Date.now().toString().slice(-4)}-${String(i + 1).padStart(2, '0')}`)

      // Build area summary for notes
      const areaSummary = areas
        .filter(a => areaFee(a) > 0)
        .map(a => {
          const c = areaCounts[a] ?? { adult: 0, child: 0, senior: 0, pwd: 0 }
          const parts = []
          if (c.adult)  parts.push(`${c.adult} adult`)
          if (c.child)  parts.push(`${c.child} child`)
          if (c.senior) parts.push(`${c.senior} senior`)
          if (c.pwd)    parts.push(`${c.pwd} pwd`)
          return `${a}: ${parts.join(', ')}`
        }).join(' | ')

      const activeAreas = areas.filter(a => areaFee(a) > 0)

      const { data: entry, error: insertError } = await supabase.from('day_use_entries').insert({
        entry_number: entryNumber,
        guest_name: form.guest_name || null,
        guest_phone: form.guest_phone || null,
        area: activeAreas.join(', '),
        num_adults: areas.reduce((s, a) => s + (areaCounts[a]?.adult ?? 0), 0),
        num_children: areas.reduce((s, a) => s + (areaCounts[a]?.child ?? 0), 0),
        num_seniors: areas.reduce((s, a) => s + (areaCounts[a]?.senior ?? 0), 0),
        num_pwd: areas.reduce((s, a) => s + (areaCounts[a]?.pwd ?? 0), 0),
        with_parking: form.with_parking,
        cottage_id: selectedCottages[0]?.id ?? null,
        total_amount: total,
        payment_method: payment.method,
        wristbands,
        notes: [
          areaSummary,
          selectedCottages.length > 1 ? `Cottages: ${selectedCottages.map(c => c.cottage_code).join(', ')}` : null,
        ].filter(Boolean).join(' | ') || null,
      }).select().single()

      if (insertError) throw insertError

      // Create a booking record for the day use entry so it appears in
      // check-in/out flow and equipment auto-return works on check-out
      // Compute total pax per type across all areas
const totalAdults   = areas.reduce((s, a) => s + (areaCounts[a]?.adult  ?? 0), 0)
const totalChildren = areas.reduce((s, a) => s + (areaCounts[a]?.child  ?? 0), 0)
const totalSeniors  = areas.reduce((s, a) => s + (areaCounts[a]?.senior ?? 0), 0)
const totalPwd      = areas.reduce((s, a) => s + (areaCounts[a]?.pwd    ?? 0), 0)

// Day use needs a guest record — create/upsert a walk-in guest
const guestCode = `DU-${Date.now().toString().slice(-6)}`
const { data: duGuest, error: duGuestError } = await supabase
  .from('guests')
  .insert({
    full_name: form.guest_name || 'Day Use Guest',
    phone: form.guest_phone || null,
    guest_code: guestCode,
  })
  .select('id')
  .single()

if (duGuestError) throw new Error('Guest insert failed: ' + duGuestError.message)

const { data: dayUseBooking, error: bookingError } = await supabase.from('bookings').insert({
  guest_id: duGuest.id,  // ← TAMA na
  booking_type: 'walk_in',
  accommodation_type: 'day_use',
  cottage_id: selectedCottages[0]?.id ?? null,
  cottage_ids: selectedCottages.map(c => c.id),
  num_adults:   totalAdults,
  num_children: totalChildren,
  num_seniors:  totalSeniors,
  num_pwd:      totalPwd,
  check_in_date: new Date().toISOString().slice(0, 10),
  check_out_date: new Date().toISOString().slice(0, 10),
  total_amount: total,
  amount_paid: total,
  payment_status: 'paid',
  status: 'checked_in',
  special_requests: form.guest_name ? `Day Use Guest: ${form.guest_name}${form.guest_phone ? ` (${form.guest_phone})` : ''}` : null,
}).select().single()

if (bookingError) throw new Error('Booking insert failed: ' + bookingError.message)

      await supabase.from('transactions').insert({
        txn_number: `TXN-${Date.now()}`,
        day_use_id: entry.id,
        txn_type: 'day_use',
        description: `Day Use (${activeAreas.join(', ')}) — ${totalPax} guest(s)`,
        amount: total,
        payment_method: payment.method,
      })

      for (const c of selectedCottages) {
        await supabase.from('cottages').update({ status: 'occupied' }).eq('id', c.id)
      }

      for (const line of equipmentLines) {
        const item = equipment.find(e => e.id === line.id)
        if (!item) continue
        await supabase.from('equipment_rentals').insert({
          rental_number: `RNT-${Date.now()}-${line.id.slice(0, 4)}`,
          equipment_id: line.id,
          booking_id: dayUseBooking?.id ?? null,  // link to day use booking for auto-return
          quantity: line.quantity,
          rate_type: line.rateType,
          rate_amount: line.rateType === 'hourly' ? item.hourly_rate : item.daily_rate,
          total_amount: line.amount,
          rental_start: new Date().toISOString(),
        })
        await supabase.from('equipment').update({ available_qty: item.available_qty - line.quantity }).eq('id', line.id)
      }

      await logActivity(supabase, {
        action: 'DAY_USE_ENTRY',
        details: `${entryNumber}${form.guest_name ? ` — ${form.guest_name}` : ''}, ${totalPax} pax, ₱${total.toLocaleString()} via ${payment.method}`,
        table_name: 'day_use_entries',
        record_id: entry.id,
      })
      // Generate receipt
const areaBreakdown = areas
  .filter(a => areaFee(a) > 0)
  .map(a => {
    const c = areaCounts[a] ?? { adult: 0, child: 0, senior: 0, pwd: 0 }
    const lines = []
    if (c.adult  > 0) lines.push({ label: `${a} — Adult × ${c.adult}`,   amount: c.adult   * getRate(a, 'adult') })
    if (c.child  > 0) lines.push({ label: `${a} — Child × ${c.child}`,   amount: c.child   * getRate(a, 'child') })
    if (c.senior > 0) lines.push({ label: `${a} — Senior × ${c.senior}`, amount: c.senior  * getRate(a, 'senior') })
    if (c.pwd    > 0) lines.push({ label: `${a} — PWD × ${c.pwd}`,       amount: c.pwd     * getRate(a, 'pwd') })
    return lines
  }).flat()

const cottageLines = selectedCottages.map(c => ({ label: `Cottage — ${c.name}`, amount: Number(c.day_rate) }))
const equipLines   = equipmentLines.map(l => ({ label: `${l.name} × ${l.quantity}`, amount: l.amount }))
const parkingLine  = form.with_parking ? [{ label: 'Parking', amount: 100 }] : []

printReceipt({
  title: 'AquaVerde Beach Resort',
  receiptNumber: entryNumber,
  receiptType: 'Day Use Receipt',
  date: new Date().toLocaleDateString('en-PH', { dateStyle: 'medium' }),
  guestName: form.guest_name || 'Walk-in Guest',
  guestContact: form.guest_phone || undefined,
  lineItems: [...areaBreakdown, ...cottageLines, ...equipLines, ...parkingLine],
  total,
  amountPaid: total,
  paymentMethod: payment.method,
  footerNote: `Wristbands: ${wristbands.join(', ')}`,
})

// Create invoice for billing module
if (dayUseBooking) {
  await createOrUpdateInvoice(supabase, {
    booking_id: dayUseBooking.id,
    guest_id: duGuest.id,
    subtotal: total,
    total,
    amount_paid: total,
    notes: `Day Use Entry — ${entryNumber}`,
  })
  // Store day use line items as booking_addons for itemized receipt
if (dayUseBooking) {
  const dayUseLineItems = [
    ...areaBreakdown.map(l => ({ 
      booking_id: dayUseBooking.id, 
      name: l.label, 
      quantity: 1, 
      unit_price: l.amount 
    })),
    ...selectedCottages.map(c => ({ 
      booking_id: dayUseBooking.id, 
      name: `Cottage — ${c.name}`, 
      quantity: 1, 
      unit_price: Number(c.day_rate) 
    })),
    ...equipmentLines.map(l => ({ 
      booking_id: dayUseBooking.id, 
      name: `${l.name} × ${l.quantity}`, 
      quantity: 1, 
      unit_price: l.amount 
    })),
    ...(form.with_parking ? [{ 
      booking_id: dayUseBooking.id, 
      name: 'Parking', 
      quantity: 1, 
      unit_price: 100 
    }] : []),
  ]
  
  if (dayUseLineItems.length > 0) {
    await supabase.from('booking_addons').insert(dayUseLineItems)
  }
}
}



      setSuccess({ entryNumber, wristbands })
      setAreaCounts({})
      setForm({ guest_name: '', guest_phone: '', with_parking: false, cottage_ids: [], equipment_selections: {} })
      setPayment({ method: 'cash', amountTendered: 0 })
      load()

    } catch (err: any) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl">
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4 flex items-start justify-between">
          <div>
            <div className="text-sm font-medium text-green-800">✅ Entry recorded! {success.entryNumber}</div>
            <div className="text-xs text-green-600 mt-1">Wristbands: {success.wristbands.join(', ')}</div>
          </div>
          <button onClick={() => setSuccess(null)} className="text-green-500 text-lg">×</button>
        </div>
      )}
      {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* LEFT: Rates + cottages + equipment */}
        <div className="space-y-4">

          {/* Rates panel */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-700">Day Use Rates</div>
              {isAdmin && (
                <button onClick={() => setEditingRates(!editingRates)}
                  className={`text-xs px-2.5 py-1 rounded-lg ${editingRates ? 'bg-blue-700 text-white' : 'border border-gray-200 text-gray-600'}`}>
                  {editingRates ? '✓ Done' : 'Manage Rates'}
                </button>
              )}
            </div>

            {editingRates ? (
              <form onSubmit={saveRates} className="space-y-3">
                {areas.map(area => (
                  <div key={area}>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{area}</div>
                    {rates.filter(r => r.area === area).map(r => (
                      <div key={r.id} className="flex items-center gap-1.5 mb-1.5">
                        <input value={rateForm[r.id]?.name ?? r.name}
                          onChange={e => setRateForm(p => ({ ...p, [r.id]: { ...p[r.id], name: e.target.value, guest_type: p[r.id]?.guest_type ?? r.guest_type, area: p[r.id]?.area ?? r.area, rate: p[r.id]?.rate ?? r.rate } }))}
                          className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white" />
                        <select value={rateForm[r.id]?.guest_type ?? r.guest_type}
                          onChange={e => setRateForm(p => ({ ...p, [r.id]: { ...p[r.id], guest_type: e.target.value, name: p[r.id]?.name ?? r.name, area: p[r.id]?.area ?? r.area, rate: p[r.id]?.rate ?? r.rate } }))}
                          className="w-18 px-1 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white">
                          <option value="adult">adult</option>
                          <option value="child">child</option>
                          <option value="senior">senior</option>
                          <option value="pwd">pwd</option>
                        </select>
                        <input type="number" value={rateForm[r.id]?.rate ?? r.rate}
                          onChange={e => setRateForm(p => ({ ...p, [r.id]: { ...p[r.id], rate: parseFloat(e.target.value) || 0, name: p[r.id]?.name ?? r.name, guest_type: p[r.id]?.guest_type ?? r.guest_type, area: p[r.id]?.area ?? r.area } }))}
                          className="w-20 px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white text-right" />
                        <button type="button" onClick={() => deleteRate(r.id)} className="text-xs text-red-400 hover:text-red-600">Del</button>
                      </div>
                    ))}
                  </div>
                ))}
                <button type="submit" className="w-full py-1.5 bg-blue-700 text-white text-xs rounded-lg">Save Changes</button>
                <div className="border-t border-gray-100 pt-3">
                  <div className="text-xs font-medium text-gray-600 mb-2">Add New Rate</div>
                  <div className="space-y-2">
                    <input value={newRate.name} onChange={e => setNewRate(p => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Beach Access — Adult"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white" />
                    <input value={newRate.area} onChange={e => setNewRate(p => ({ ...p, area: e.target.value }))}
                      placeholder="Area/Package name" list="area-list"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white" />
                    <datalist id="area-list">{areas.map(a => <option key={a} value={a} />)}</datalist>
                    <div className="flex gap-2">
                      <select value={newRate.guest_type} onChange={e => setNewRate(p => ({ ...p, guest_type: e.target.value }))}
                        className="flex-1 px-2 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white">
                        <option value="adult">Adult</option>
                        <option value="child">Child</option>
                        <option value="senior">Senior</option>
                        <option value="pwd">PWD</option>
                      </select>
                      <input type="number" value={newRate.rate || ''} onChange={e => setNewRate(p => ({ ...p, rate: parseFloat(e.target.value) || 0 }))}
                        placeholder="₱" className="flex-1 px-2 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white" />
                      <button type="button" onClick={addNewRate} className="px-3 py-2 bg-green-600 text-white text-xs rounded-lg">+ Add</button>
                    </div>
                  </div>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                {areas.map(area => (
                  <div key={area}>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{area}</div>
                    <div className="flex flex-wrap gap-2">
                      {rates.filter(r => r.area === area).map(r => (
                        <span key={r.id} className="text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded-lg capitalize">
                          {r.guest_type}: ₱{r.rate}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cottages */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Cottages (optional)</div>
            {cottages.length === 0 ? <div className="text-xs text-gray-400">No available cottages.</div>
            : cottages.map(c => (
              <label key={c.id} className="flex items-center justify-between gap-2 text-sm cursor-pointer py-1">
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={form.cottage_ids.includes(c.id)} onChange={() => toggleCottage(c.id)} />
                  <span className="text-gray-700">{c.name}</span>
                </span>
                <span className="text-xs text-gray-400">₱{Number(c.day_rate).toLocaleString()}/day</span>
              </label>
            ))}
          </div>

          {/* Equipment */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Equipment Rental (optional)</div>
            {equipment.length === 0 ? <div className="text-xs text-gray-400">No available equipment.</div>
            : equipment.map(item => {
              const sel = form.equipment_selections[item.id]
              return (
                <div key={item.id} className="border border-gray-100 rounded-lg p-2 mb-2">
                  <label className="flex items-center justify-between gap-2 text-sm cursor-pointer">
                    <span className="flex items-center gap-2">
                      <input type="checkbox" checked={sel?.selected ?? false} onChange={() => toggleEquipment(item.id, item)} />
                      <span className="text-gray-700">{item.name}</span>
                    </span>
                    <span className="text-xs text-gray-400">{item.hourly_rate ? `₱${item.hourly_rate}/hr` : `₱${item.daily_rate}/day`}</span>
                  </label>
                  {sel?.selected && (
                    <div className="flex items-center gap-2 mt-2 pl-6">
                      <div><label className="block text-xs text-gray-400">Qty</label>
                        <input type="number" min={1} max={item.available_qty} value={sel.quantity}
                          onChange={e => updateEqField(item.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-14 px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white" /></div>
                      <div><label className="block text-xs text-gray-400">{sel.rateType === 'hourly' ? 'Hours' : 'Days'}</label>
                        <input type="number" min={1} value={sel.units}
                          onChange={e => updateEqField(item.id, 'units', Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-14 px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white" /></div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* RIGHT: Entry form */}
        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
            <div className="text-sm font-medium text-gray-700">Guest Info</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Guest Name</label>
                <input value={form.guest_name} onChange={e => setForm(p => ({ ...p, guest_name: e.target.value }))}
                  placeholder="Juan Dela Cruz"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phone (optional)</label>
                <input value={form.guest_phone} onChange={e => setForm(p => ({ ...p, guest_phone: e.target.value }))}
                  placeholder="+63 9XX XXX XXXX"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
            </div>
          </div>

          {/* Per-area guest counts */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-sm font-medium text-gray-700 mb-3">
              Guest Counts per Area
              <span className="text-xs text-gray-400 font-normal ml-2">— enter 0 if none for that area</span>
            </div>
            <div className="space-y-4">
              {areas.map(area => (
                <div key={area}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">{area}</span>
                    <span className="text-xs text-gray-400">
                      Subtotal: ₱{areaFee(area).toLocaleString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {(['adult', 'child', 'senior', 'pwd'] as const).map(type => (
                      <div key={type}>
                        <label className="block text-xs text-gray-400 mb-1 capitalize">
                          {type}
                          {getRate(area, type) > 0 && <span className="text-gray-300 ml-1">₱{getRate(area, type)}</span>}
                        </label>
                        <input
                          type="number" min={0}
                          value={getCount(area, type) || ''}
                          placeholder="0"
                          onChange={e => setCount(area, type, parseInt(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white text-center"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer mt-4 pt-3 border-t border-gray-100">
              <input type="checkbox" checked={form.with_parking}
                onChange={e => setForm(p => ({ ...p, with_parking: e.target.checked }))} />
              With parking (+₱100)
            </label>
          </div>

          {/* Bill summary */}
          <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
            <div className="text-sm font-medium text-gray-700">Bill Summary</div>
            <div className="text-sm space-y-1 bg-gray-50 rounded-lg p-3">
              {areas.map(area => {
                const fee = areaFee(area)
                if (fee === 0) return null
                const c = areaCounts[area] ?? { adult: 0, child: 0, senior: 0, pwd: 0 }
                return (
                  <div key={area}>
                    <div className="text-xs font-medium text-gray-500 mt-1">{area}</div>
                    {c.adult  > 0 && <div className="flex justify-between text-gray-600 pl-2"><span>{c.adult} adult × ₱{getRate(area, 'adult')}</span><span>₱{(c.adult * getRate(area, 'adult')).toLocaleString()}</span></div>}
                    {c.child  > 0 && <div className="flex justify-between text-gray-600 pl-2"><span>{c.child} child × ₱{getRate(area, 'child')}</span><span>₱{(c.child * getRate(area, 'child')).toLocaleString()}</span></div>}
                    {c.senior > 0 && <div className="flex justify-between text-gray-600 pl-2"><span>{c.senior} senior × ₱{getRate(area, 'senior')}</span><span>₱{(c.senior * getRate(area, 'senior')).toLocaleString()}</span></div>}
                    {c.pwd    > 0 && <div className="flex justify-between text-gray-600 pl-2"><span>{c.pwd} pwd × ₱{getRate(area, 'pwd')}</span><span>₱{(c.pwd * getRate(area, 'pwd')).toLocaleString()}</span></div>}
                  </div>
                )
              })}
              {form.with_parking && <div className="flex justify-between text-gray-600"><span>Parking</span><span>₱100</span></div>}
              {selectedCottages.map(c => <div key={c.id} className="flex justify-between text-gray-600"><span>{c.name}</span><span>₱{Number(c.day_rate).toLocaleString()}</span></div>)}
              {equipmentLines.map(l => <div key={l.id} className="flex justify-between text-gray-600"><span>{l.name} × {l.quantity}</span><span>₱{l.amount.toLocaleString()}</span></div>)}
              <div className="flex justify-between font-semibold text-blue-700 border-t border-blue-200 pt-1 mt-1">
                <span>Total ({totalPax} pax)</span><span>₱{total.toLocaleString()}</span>
              </div>
            </div>

            <PaymentCalculator
              totalDue={total}
              method={payment.method}
              onMethodChange={m => setPayment(p => ({ ...p, method: m }))}
              amountTendered={payment.amountTendered}
              onAmountTenderedChange={a => setPayment(p => ({ ...p, amountTendered: a }))}
            />

            <button type="submit" disabled={loading || totalPax === 0 || !isPaymentValid(payment.method, total, payment.amountTendered)}
              className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg">
              {loading ? 'Processing...' : `Record Entry & Payment (₱${total.toLocaleString()})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
