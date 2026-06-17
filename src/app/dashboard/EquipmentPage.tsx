'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function EquipmentPage() {
  const supabase = createClient()
  const [equipment, setEquipment] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({
    name: '', total_quantity: 1, hourly_rate: 0, daily_rate: 0, deposit_amount: 0,
  })

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('equipment').select('*').eq('is_active', true).order('name')
    setEquipment(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function rentOut(item: any) {
    if (item.available_qty <= 0) { showToast('No available units.'); return }

    const { error: rentalError } = await supabase.from('equipment_rentals').insert({
      rental_number: `RNT-${Date.now()}`,
      equipment_id: item.id,
      quantity: 1,
      rate_type: item.hourly_rate ? 'hourly' : 'daily',
      rate_amount: item.hourly_rate ?? item.daily_rate ?? 0,
      rental_start: new Date().toISOString(),
      deposit_paid: item.deposit_amount ?? 0,
    })

    if (rentalError) { showToast('Error: ' + rentalError.message); return }

    await supabase.from('equipment').update({ available_qty: item.available_qty - 1 }).eq('id', item.id)
    showToast(`${item.name} rented out.`)
    load()
  }

  async function returnItem(item: any) {
    if (item.available_qty >= item.total_quantity) return
    await supabase.from('equipment').update({ available_qty: item.available_qty + 1 }).eq('id', item.id)
    showToast(`${item.name} returned.`)
    load()
  }

  function openNew() {
    setEditing(null)
    setForm({ name: '', total_quantity: 1, hourly_rate: 0, daily_rate: 0, deposit_amount: 0 })
    setShowForm(true)
  }

  function openEdit(item: any) {
    setEditing(item)
    setForm({
      name: item.name, total_quantity: item.total_quantity,
      hourly_rate: item.hourly_rate ?? 0, daily_rate: item.daily_rate ?? 0,
      deposit_amount: item.deposit_amount ?? 0,
    })
    setShowForm(true)
  }

  async function saveEquipment(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || form.total_quantity <= 0) { showToast('Name and a valid quantity are required.'); return }

    const code = `EQ-${Date.now().toString().slice(-4)}`

    if (editing) {
      // When editing, adjust available_qty by the same delta as total_quantity change
      const delta = form.total_quantity - editing.total_quantity
      const { error } = await supabase.from('equipment').update({
        ...form,
        available_qty: Math.max(0, editing.available_qty + delta),
      }).eq('id', editing.id)
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`${form.name} updated.`)
    } else {
      const { error } = await supabase.from('equipment').insert({
        ...form, equipment_code: code, available_qty: form.total_quantity,
      })
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`${form.name} added.`)
    }
    setShowForm(false)
    load()
  }

  async function deactivate(item: any) {
    if (!confirm(`Remove "${item.name}" from equipment list?`)) return
    const { error } = await supabase.from('equipment').update({ is_active: false }).eq('id', item.id)
    if (error) { showToast('Error: ' + error.message); return }
    showToast(`${item.name} removed.`)
    load()
  }

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-medium text-gray-700">{equipment.length} Equipment Types</div>
        <button onClick={openNew} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg">
          + Add Equipment
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5">Equipment</th>
                <th className="text-left px-4 py-2.5">Total</th>
                <th className="text-left px-4 py-2.5">Rented</th>
                <th className="text-left px-4 py-2.5">Available</th>
                <th className="text-left px-4 py-2.5">Rate</th>
                <th className="text-left px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {equipment.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-xs">No equipment found.</td></tr>
              ) : equipment.map(e => (
                <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-700">{e.name}</td>
                  <td className="px-4 py-2.5">{e.total_quantity}</td>
                  <td className="px-4 py-2.5">{e.total_quantity - e.available_qty}</td>
                  <td className="px-4 py-2.5">{e.available_qty}</td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {e.hourly_rate ? `₱${e.hourly_rate}/hr` : `₱${e.daily_rate}/day`}
                  </td>
                  <td className="px-4 py-2.5 flex gap-1">
                    <button
                      onClick={() => rentOut(e)}
                      disabled={e.available_qty <= 0}
                      className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 text-white text-xs rounded-lg"
                    >
                      Rent Out
                    </button>
                    <button
                      onClick={() => returnItem(e)}
                      disabled={e.available_qty >= e.total_quantity}
                      className="px-2.5 py-1 border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 text-xs rounded-lg"
                    >
                      Return
                    </button>
                    <button onClick={() => openEdit(e)} className="px-2 py-1 text-gray-400 hover:text-gray-600 text-xs">
                      Edit
                    </button>
                    <button onClick={() => deactivate(e)} className="px-2 py-1 text-red-400 hover:text-red-600 text-xs">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <form onSubmit={saveEquipment} className="bg-white rounded-xl p-5 w-full max-w-sm space-y-3" onClick={ev => ev.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-1">{editing ? 'Edit Equipment' : 'Add Equipment'}</div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input value={form.name} onChange={ev => setForm(p => ({ ...p, name: ev.target.value }))}
                placeholder="e.g. Kayak"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Total Quantity</label>
              <input type="number" value={form.total_quantity} onChange={ev => setForm(p => ({ ...p, total_quantity: parseInt(ev.target.value) || 1 }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Hourly Rate</label>
                <input type="number" value={form.hourly_rate} onChange={ev => setForm(p => ({ ...p, hourly_rate: parseFloat(ev.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Daily Rate</label>
                <input type="number" value={form.daily_rate} onChange={ev => setForm(p => ({ ...p, daily_rate: parseFloat(ev.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Deposit Amount</label>
              <input type="number" value={form.deposit_amount} onChange={ev => setForm(p => ({ ...p, deposit_amount: parseFloat(ev.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-lg">
                {editing ? 'Save Changes' : 'Add Equipment'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
