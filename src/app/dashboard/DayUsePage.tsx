'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PaymentCalculator from './PaymentCalculator'
import { logActivity } from './activityLog'
import { usePermissions } from './permissions'

interface CottageOption { id: string; name: string; cottage_code: string; day_rate: number; status: string }
interface EquipmentOption { id: string; name: string; hourly_rate: number | null; daily_rate: number | null; available_qty: number }

export default function DayUsePage() {
  const supabase = createClient()
  const { can, role } = usePermissions()
  const isAdmin = role === 'super_admin' || role === 'resort_owner'

  const [rates, setRates] = useState<any[]>([])
  const [cottages, setCottages] = useState<CottageOption[]>([])
  const [equipment, setEquipment] = useState<EquipmentOption[]>([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<{ entryNumber: string; wristbands: string[] } | null>(null)
  const [error, setError] = useState('')

  const [editingRates, setEditingRates] = useState(false)
  const [rateForm, setRateForm] = useState<Record<string, { name: string; guest_type: string; rate: number }>>({})
  const [newRateName, setNewRateName] = useState('')
  const [newRateType, setNewRateType] = useState('adult')
  const [newRateAmount, setNewRateAmount] = useState(0)

  const [form, setForm] = useState({
    guest_name: '',
    guest_phone: '',
    num_adults: 2,
    num_children: 1,
    num_seniors: 0,
    num_pwd: 0,
    with_parking: false,
    cottage_ids: [] as string[],
    equipment_selections: {} as Record<string, { selected: boolean; quantity: number; rateType: 'hourly' | 'daily'; units: number }>,
  })

  const [payment, setPayment] = useState({ method: 'cash', amountTendered: 0 })

  async function load() {
    const [{ data: rateData }, { data: cottageData }, { data: equipmentData }] = await Promise.all([
      supabase.from('day_use_rates').select('*').eq('is_active', true),
      supabase.from('cottages').select('id, name, cottage_code, day_rate, status').eq('status', 'available').order('cottage_code'),
      supabase.from('equipment').select('id, name, hourly_rate, daily_rate, available_qty').eq('is_active', true).gt('available_qty', 0).order('name'),
    ])
    setRates(rateData ?? [])
    setRateForm({})  // reset edit state on reload
    setCottages(cottageData ?? [])
    setEquipment(equipmentData ?? [])
  }

  useEffect(() => { load() }, [])

  function update(field: string, value: any) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function toggleCottage(id: string) {
    setForm(prev => ({
      ...prev,
      cottage_ids: prev.cottage_ids.includes(id)
        ? prev.cottage_ids.filter(c => c !== id)
        : [...prev.cottage_ids, id],
    }))
  }

  function toggleEquipment(id: string, item: EquipmentOption) {
    setForm(prev => {
      const current = prev.equipment_selections[id]
      const nextSelected = !current?.selected
      return {
        ...prev,
        equipment_selections: {
          ...prev.equipment_selections,
          [id]: {
            selected: nextSelected,
            quantity: current?.quantity ?? 1,
            rateType: current?.rateType ?? (item.hourly_rate ? 'hourly' : 'daily'),
            units: current?.units ?? 1,
          },
        },
      }
    })
  }

  function updateEquipmentField(id: string, field: 'quantity' | 'rateType' | 'units', value: any) {
    setForm(prev => ({
      ...prev,
      equipment_selections: {
        ...prev.equipment_selections,
        [id]: { ...prev.equipment_selections[id], [field]: value },
      },
    }))
  }

  async function saveRates(e?: React.FormEvent) {
    e?.preventDefault()
    for (const r of rates) {
      const updated = rateForm[r.id]
      if (updated) {
        await supabase.from('day_use_rates').update({
          name: updated.name ?? r.name,
          guest_type: updated.guest_type ?? r.guest_type,
          rate: updated.rate ?? r.rate,
        }).eq('id', r.id)
      }
    }
    setEditingRates(false)
    load()
  }

  async function deleteRate(id: string) {
    if (!confirm('Delete this rate?')) return
    await supabase.from('day_use_rates').delete().eq('id', id)
    load()
  }

  async function addNewRate() {
    if (!newRateName.trim() || newRateAmount <= 0) {
      return
    }
    const { error } = await supabase.from('day_use_rates').insert({
      name: newRateName.trim(),
      guest_type: newRateType,
      rate: newRateAmount,
      is_active: true,
    })
    if (!error) {
      setNewRateName('')
      setNewRateType('adult')
      setNewRateAmount(0)
      load()
    }
  }

  const adultRate  = rates.find(r => r.guest_type === 'adult')?.rate  ?? 150
  const childRate  = rates.find(r => r.guest_type === 'child')?.rate  ?? 80
  const seniorRate = rates.find(r => r.guest_type === 'senior')?.rate ?? 120
  const pwdRate    = rates.find(r => r.guest_type === 'pwd')?.rate    ?? 120

  const adultFee   = form.num_adults * adultRate
  const childFee   = form.num_children * childRate
  const seniorFee  = form.num_seniors * seniorRate
  const pwdFee     = form.num_pwd * pwdRate
  const parkingFee = form.with_parking ? 100 : 0

  const selectedCottages = cottages.filter(c => form.cottage_ids.includes(c.id))
  const cottageFee = selectedCottages.reduce((sum, c) => sum + Number(c.day_rate), 0)

  const equipmentLines = Object.entries(form.equipment_selections)
    .filter(([, sel]) => sel.selected)
    .map(([id, sel]) => {
      const item = equipment.find(e => e.id === id)
      if (!item) return null
      const rate = sel.rateType === 'hourly' ? item.hourly_rate ?? 0 : item.daily_rate ?? 0
      const amount = rate * sel.quantity * sel.units
      return { id, name: item.name, quantity: sel.quantity, units: sel.units, rateType: sel.rateType, amount }
    })
    .filter(Boolean) as { id: string; name: string; quantity: number; units: number; rateType: string; amount: number }[]

  const equipmentFee = equipmentLines.reduce((sum, l) => sum + l.amount, 0)
  const total = adultFee + childFee + seniorFee + pwdFee + parkingFee + cottageFee + equipmentFee
  const totalPax = form.num_adults + form.num_children + form.num_seniors + form.num_pwd

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (totalPax === 0) { setError('Please enter the number of guests.'); return }

    setLoading(true)
    setError('')

    try {
      const entryNumber = `DU-${Date.now()}`
      const wristbands = Array.from({ length: totalPax }, (_, i) =>
        `WB-${Date.now().toString().slice(-4)}-${String(i + 1).padStart(2, '0')}`)

      const { data: entry, error: insertError } = await supabase
        .from('day_use_entries')
        .insert({
          entry_number: entryNumber,
          guest_name: form.guest_name || null,
          guest_phone: form.guest_phone || null,
          num_adults: form.num_adults,
          num_children: form.num_children,
          num_seniors: form.num_seniors,
          num_pwd: form.num_pwd,
          with_parking: form.with_parking,
          cottage_id: selectedCottages[0]?.id ?? null,
          total_amount: total,
          payment_method: payment.method,
          wristbands,
          notes: selectedCottages.length > 1
            ? `Cottages: ${selectedCottages.map(c => c.cottage_code).join(', ')}`
            : null,
        })
        .select()
        .single()

      if (insertError) throw insertError

      await supabase.from('transactions').insert({
        txn_number: `TXN-${Date.now()}`,
        day_use_id: entry.id,
        txn_type: 'day_use',
        description: `Day Use Entry — ${totalPax} guest(s)${selectedCottages.length ? `, ${selectedCottages.length} cottage(s)` : ''}${equipmentLines.length ? `, ${equipmentLines.length} equipment item(s)` : ''}`,
        amount: total,
        payment_method: payment.method,
      })

      // Mark all selected cottages occupied
      for (const c of selectedCottages) {
        await supabase.from('cottages').update({ status: 'occupied' }).eq('id', c.id)
      }

      // Record equipment rentals and decrement availability
      for (const line of equipmentLines) {
        const item = equipment.find(e => e.id === line.id)
        if (!item) continue
        await supabase.from('equipment_rentals').insert({
          rental_number: `RNT-${Date.now()}-${line.id.slice(0, 4)}`,
          equipment_id: line.id,
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
        details: `${entryNumber}${form.guest_name ? ` — ${form.guest_name}` : ''} — ${totalPax} guest(s), ₱${total.toLocaleString()} via ${payment.method}`,
        table_name: 'day_use_entries',
        record_id: entry.id,
      })

      setSuccess({ entryNumber, wristbands })
      setForm({
        guest_name: '', guest_phone: '',
        num_adults: 2, num_children: 1, num_seniors: 0, num_pwd: 0,
        with_parking: false, cottage_ids: [], equipment_selections: {},
      })
      setPayment({ method: 'cash', amountTendered: 0 })
      load()

    } catch (err: any) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl">
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-sm font-medium text-green-800">✅ Entry recorded! {success.entryNumber}</div>
          <div className="text-xs text-green-600 mt-1">Wristbands: {success.wristbands.join(', ')}</div>
        </div>
      )}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Rates panel — full CRUD */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 h-fit">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-gray-700">Day Use Rates</div>
            {isAdmin && (
              <button onClick={() => setEditingRates(!editingRates)}
                className={`text-xs px-2.5 py-1 rounded-lg ${editingRates ? 'bg-blue-700 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {editingRates ? '✓ Done' : 'Manage Rates'}
              </button>
            )}
          </div>

          <table className="w-full text-sm mb-2">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="text-left py-1.5">Name</th>
                <th className="text-left py-1.5">Type</th>
                <th className="text-right py-1.5">Rate</th>
                {editingRates && <th className="w-12"></th>}
              </tr>
            </thead>
            <tbody>
              {rates.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-xs text-gray-400">No rates yet. Add one below.</td></tr>
              )}
              {rates.map(r => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="py-1.5">
                    {editingRates ? (
                      <input value={rateForm[r.id]?.name ?? r.name}
                        onChange={e => setRateForm(p => ({ ...p, [r.id]: { ...p[r.id], name: e.target.value, rate: p[r.id]?.rate ?? r.rate, guest_type: p[r.id]?.guest_type ?? r.guest_type } }))}
                        className="w-full px-2 py-0.5 border border-gray-200 rounded text-xs text-gray-900 bg-white" />
                    ) : <span className="text-gray-700">{r.name}</span>}
                  </td>
                  <td className="py-1.5">
                    {editingRates ? (
                      <select value={rateForm[r.id]?.guest_type ?? r.guest_type}
                        onChange={e => setRateForm(p => ({ ...p, [r.id]: { ...p[r.id], guest_type: e.target.value, name: p[r.id]?.name ?? r.name, rate: p[r.id]?.rate ?? r.rate } }))}
                        className="w-full px-1 py-0.5 border border-gray-200 rounded text-xs text-gray-900 bg-white">
                        <option value="adult">adult</option>
                        <option value="child">child</option>
                        <option value="senior">senior</option>
                        <option value="pwd">pwd</option>
                        <option value="other">other</option>
                      </select>
                    ) : <span className="text-xs text-gray-400 capitalize">{r.guest_type}</span>}
                  </td>
                  <td className="py-1.5 text-right">
                    {editingRates ? (
                      <input type="number" value={rateForm[r.id]?.rate ?? r.rate}
                        onChange={e => setRateForm(p => ({ ...p, [r.id]: { ...p[r.id], rate: parseFloat(e.target.value) || 0, name: p[r.id]?.name ?? r.name, guest_type: p[r.id]?.guest_type ?? r.guest_type } }))}
                        className="w-20 px-2 py-0.5 border border-gray-200 rounded text-xs text-gray-900 bg-white text-right" />
                    ) : <span className="font-medium text-gray-700">₱{Number(r.rate).toLocaleString()}</span>}
                  </td>
                  {editingRates && (
                    <td className="py-1.5 pl-2">
                      <button onClick={() => deleteRate(r.id)}
                        className="text-xs text-red-400 hover:text-red-600">Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {editingRates && (
            <>
              <button onClick={saveRates}
                className="w-full py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg mb-3">
                Save Changes
              </button>
              <div className="border-t border-gray-100 pt-3">
                <div className="text-xs font-medium text-gray-600 mb-2">Add New Rate</div>
                <div className="space-y-2">
                  <input value={newRateName} onChange={e => setNewRateName(e.target.value)}
                    placeholder="e.g. Beach Entrance — Adult"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white" />
                  <div className="flex gap-2">
                    <select value={newRateType} onChange={e => setNewRateType(e.target.value)}
                      className="flex-1 px-2 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white">
                      <option value="adult">Adult</option>
                      <option value="child">Child</option>
                      <option value="senior">Senior</option>
                      <option value="pwd">PWD</option>
                      <option value="other">Other</option>
                    </select>
                    <input type="number" value={newRateAmount || ''}
                      onChange={e => setNewRateAmount(parseFloat(e.target.value) || 0)}
                      placeholder="₱ Amount"
                      className="flex-1 px-2 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white" />
                    <button type="button" onClick={addNewRate}
                      className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg whitespace-nowrap">
                      + Add
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Cottage selection */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="text-sm font-medium text-gray-700 mb-2">Cottages (optional, select multiple)</div>
            {cottages.length === 0 ? (
              <div className="text-xs text-gray-400">No available cottages right now.</div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {cottages.map(c => (
                  <label key={c.id} className="flex items-center justify-between gap-2 text-sm cursor-pointer">
                    <span className="flex items-center gap-2">
                      <input type="checkbox" checked={form.cottage_ids.includes(c.id)} onChange={() => toggleCottage(c.id)} />
                      <span className="text-gray-700">{c.name}</span>
                    </span>
                    <span className="text-gray-400">₱{Number(c.day_rate).toLocaleString()}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Equipment selection */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="text-sm font-medium text-gray-700 mb-2">Equipment Rental (optional, select multiple)</div>
            {equipment.length === 0 ? (
              <div className="text-xs text-gray-400">No available equipment right now.</div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {equipment.map(item => {
                  const sel = form.equipment_selections[item.id]
                  return (
                    <div key={item.id} className="border border-gray-100 rounded-lg p-2">
                      <label className="flex items-center justify-between gap-2 text-sm cursor-pointer">
                        <span className="flex items-center gap-2">
                          <input type="checkbox" checked={sel?.selected ?? false} onChange={() => toggleEquipment(item.id, item)} />
                          <span className="text-gray-700">{item.name}</span>
                        </span>
                        <span className="text-xs text-gray-400">
                          {item.hourly_rate ? `₱${item.hourly_rate}/hr` : `₱${item.daily_rate}/day`}
                        </span>
                      </label>
                      {sel?.selected && (
                        <div className="flex gap-2 mt-2 pl-6">
                          <input type="number" min={1} max={item.available_qty} value={sel.quantity}
                            onChange={e => updateEquipmentField(item.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-16 px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white" />
                          <span className="text-xs text-gray-400 self-center">×</span>
                          <input type="number" min={1} value={sel.units}
                            onChange={e => updateEquipmentField(item.id, 'units', Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-16 px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white" />
                          <span className="text-xs text-gray-400 self-center">{item.hourly_rate ? 'hr(s)' : 'day(s)'}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Entry form */}
        <form onSubmit={handleSubmit} className="bg-white border border-gray-100 rounded-xl p-4 space-y-3 h-fit">
          <div className="text-sm font-medium text-gray-700 mb-1">Day Use Entry</div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Guest Name</label>
              <input value={form.guest_name} onChange={e => update('guest_name', e.target.value)}
                placeholder="Juan Dela Cruz"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Phone (optional)</label>
              <input value={form.guest_phone} onChange={e => update('guest_phone', e.target.value)}
                placeholder="+63 9XX XXX XXXX"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Adults</label>
              <input type="number" min={0} value={form.num_adults}
                onChange={e => update('num_adults', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Children</label>
              <input type="number" min={0} value={form.num_children}
                onChange={e => update('num_children', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Senior</label>
              <input type="number" min={0} value={form.num_seniors}
                onChange={e => update('num_seniors', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">PWD</label>
              <input type="number" min={0} value={form.num_pwd}
                onChange={e => update('num_pwd', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.with_parking}
              onChange={e => update('with_parking', e.target.checked)} id="parking" />
            <label htmlFor="parking" className="text-sm text-gray-600">With parking (+₱100)</label>
          </div>

          <div className="bg-blue-50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between text-gray-600"><span>{form.num_adults} Adult(s) × ₱{adultRate}</span><span>₱{adultFee}</span></div>
            <div className="flex justify-between text-gray-600"><span>{form.num_children} Child(ren) × ₱{childRate}</span><span>₱{childFee}</span></div>
            {form.num_seniors > 0 && <div className="flex justify-between text-gray-600"><span>{form.num_seniors} Senior × ₱{seniorRate}</span><span>₱{seniorFee}</span></div>}
            {form.num_pwd > 0 && <div className="flex justify-between text-gray-600"><span>{form.num_pwd} PWD × ₱{pwdRate}</span><span>₱{pwdFee}</span></div>}
            {form.with_parking && <div className="flex justify-between text-gray-600"><span>Parking</span><span>₱{parkingFee}</span></div>}
            {selectedCottages.map(c => (
              <div key={c.id} className="flex justify-between text-gray-600"><span>{c.name}</span><span>₱{Number(c.day_rate).toLocaleString()}</span></div>
            ))}
            {equipmentLines.map(l => (
              <div key={l.id} className="flex justify-between text-gray-600">
                <span>{l.name} × {l.quantity} ({l.units} {l.rateType === 'hourly' ? 'hr' : 'day'}{l.units > 1 ? 's' : ''})</span>
                <span>₱{l.amount.toLocaleString()}</span>
              </div>
            ))}
            <div className="flex justify-between font-semibold text-blue-700 border-t border-blue-200 pt-1 mt-1">
              <span>Total</span><span>₱{total.toLocaleString()}</span>
            </div>
          </div>

          <PaymentCalculator
            totalDue={total}
            method={payment.method}
            onMethodChange={m => setPayment(p => ({ ...p, method: m }))}
            amountTendered={payment.amountTendered}
            onAmountTenderedChange={a => setPayment(p => ({ ...p, amountTendered: a }))}
          />

          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg">
            {loading ? 'Processing...' : 'Issue Entry, Wristbands & Record Payment'}
          </button>
        </form>
      </div>
    </div>
  )
}
