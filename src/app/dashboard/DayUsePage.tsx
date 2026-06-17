'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function DayUsePage() {
  const supabase = createClient()
  const [rates, setRates] = useState<Record<string, number>>({})
  const [cottages, setCottages] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<{ entryNumber: string; wristbands: string[] } | null>(null)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    num_adults: 2,
    num_children: 1,
    num_seniors: 0,
    num_pwd: 0,
    with_parking: false,
    cottage_id: '',
  })

  useEffect(() => {
    async function load() {
      const { data: rateData } = await supabase.from('day_use_rates').select('*').eq('is_active', true)
      const map: Record<string, number> = {}
      ;(rateData ?? []).forEach((r: any) => { map[r.guest_type] = r.rate })
      setRates(map)

      const { data: cottageData } = await supabase
        .from('cottages')
        .select('*')
        .eq('status', 'available')
        .order('cottage_code')
      setCottages(cottageData ?? [])
    }
    load()
  }, [])

  function update(field: string, value: any) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const adultFee   = form.num_adults * (rates['adult'] ?? 150)
  const childFee   = form.num_children * (rates['child'] ?? 80)
  const seniorFee  = form.num_seniors * (rates['senior'] ?? 120)
  const pwdFee     = form.num_pwd * (rates['pwd'] ?? 120)
  const parkingFee = form.with_parking ? 100 : 0
  const selectedCottage = cottages.find(c => c.id === form.cottage_id)
  const cottageFee = selectedCottage?.day_rate ?? 0
  const total = adultFee + childFee + seniorFee + pwdFee + parkingFee + cottageFee
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

      const { data, error: insertError } = await supabase
        .from('day_use_entries')
        .insert({
          entry_number: entryNumber,
          num_adults: form.num_adults,
          num_children: form.num_children,
          num_seniors: form.num_seniors,
          num_pwd: form.num_pwd,
          with_parking: form.with_parking,
          cottage_id: form.cottage_id || null,
          total_amount: total,
          payment_method: 'cash',
          wristbands,
        })
        .select()
        .single()

      if (insertError) throw insertError

      await supabase.from('transactions').insert({
        txn_number: `TXN-${Date.now()}`,
        day_use_id: data.id,
        txn_type: 'day_use',
        description: `Day Use Entry — ${totalPax} guest(s)`,
        amount: total,
        payment_method: 'cash',
      })

      if (form.cottage_id) {
        await supabase.from('cottages').update({ status: 'occupied' }).eq('id', form.cottage_id)
      }

      setSuccess({ entryNumber, wristbands })
      setForm({ num_adults: 2, num_children: 1, num_seniors: 0, num_pwd: 0, with_parking: false, cottage_id: '' })

      const { data: cottageData } = await supabase
        .from('cottages').select('*').eq('status', 'available').order('cottage_code')
      setCottages(cottageData ?? [])

    } catch (err: any) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl">
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
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-700 mb-3">Day Use Rates</div>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-gray-50"><td className="py-2 text-gray-600">Adult</td><td className="py-2 text-right font-medium">₱{rates['adult'] ?? 150}</td></tr>
              <tr className="border-b border-gray-50"><td className="py-2 text-gray-600">Child</td><td className="py-2 text-right font-medium">₱{rates['child'] ?? 80}</td></tr>
              <tr className="border-b border-gray-50"><td className="py-2 text-gray-600">Senior Citizen</td><td className="py-2 text-right font-medium">₱{rates['senior'] ?? 120}</td></tr>
              <tr><td className="py-2 text-gray-600">PWD</td><td className="py-2 text-right font-medium">₱{rates['pwd'] ?? 120}</td></tr>
            </tbody>
          </table>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
          <div className="text-sm font-medium text-gray-700 mb-1">Day Use Entry</div>

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

          <div>
            <label className="block text-xs text-gray-500 mb-1">Cottage (optional)</label>
            <select value={form.cottage_id} onChange={e => update('cottage_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
              <option value="">None</option>
              {cottages.map(c => (
                <option key={c.id} value={c.id}>{c.name} (₱{c.day_rate})</option>
              ))}
            </select>
          </div>

          <div className="bg-blue-50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between text-gray-600"><span>{form.num_adults} Adult(s) × ₱{rates['adult'] ?? 150}</span><span>₱{adultFee}</span></div>
            <div className="flex justify-between text-gray-600"><span>{form.num_children} Child(ren) × ₱{rates['child'] ?? 80}</span><span>₱{childFee}</span></div>
            {form.num_seniors > 0 && <div className="flex justify-between text-gray-600"><span>{form.num_seniors} Senior × ₱{rates['senior'] ?? 120}</span><span>₱{seniorFee}</span></div>}
            {form.num_pwd > 0 && <div className="flex justify-between text-gray-600"><span>{form.num_pwd} PWD × ₱{rates['pwd'] ?? 120}</span><span>₱{pwdFee}</span></div>}
            {form.with_parking && <div className="flex justify-between text-gray-600"><span>Parking</span><span>₱{parkingFee}</span></div>}
            {cottageFee > 0 && <div className="flex justify-between text-gray-600"><span>Cottage</span><span>₱{cottageFee}</span></div>}
            <div className="flex justify-between font-semibold text-blue-700 border-t border-blue-200 pt-1 mt-1">
              <span>Total</span><span>₱{total.toLocaleString()}</span>
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg">
            {loading ? 'Processing...' : 'Issue Entry & Wristbands'}
          </button>
        </form>
      </div>
    </div>
  )
}
