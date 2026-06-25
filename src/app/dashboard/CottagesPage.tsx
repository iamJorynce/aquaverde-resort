'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from './permissions'

const statusColor: Record<string, string> = {
  available:   'bg-green-100 text-green-700',
  occupied:    'bg-red-100 text-red-700',
  reserved:    'bg-blue-100 text-blue-700',
  cleaning:    'bg-yellow-100 text-yellow-700',
  maintenance: 'bg-gray-100 text-gray-700',
}

const typeLabel: Record<string, string> = {
  open: 'Open Cottage',
  covered: 'Covered Cottage',
  family: 'Family Cottage',
  vip: 'VIP Cottage',
  function_hall: 'Function Hall',
  beach_table: 'Beach Table',
  tent_area: 'Tent Area',
}

export default function CottagesPage() {
  const supabase = createClient()
  const { can } = usePermissions()
  const canManage = can('canManageCottagesCatalog')
  const [cottages, setCottages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({
    cottage_code: '', name: '', type: 'open', capacity: 8,
    day_rate: 0, overnight_rate: 0,
  })

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('cottages').select('*').order('cottage_code')
    setCottages(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from('cottages').update({ status }).eq('id', id)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Status updated.')
    load()
  }

  function openNew() {
    setEditing(null)
    setForm({ cottage_code: '', name: '', type: 'open', capacity: 8, day_rate: 0, overnight_rate: 0 })
    setShowForm(true)
  }

  function openEdit(c: any) {
    setEditing(c)
    setForm({
      cottage_code: c.cottage_code, name: c.name, type: c.type,
      capacity: c.capacity, day_rate: c.day_rate, overnight_rate: c.overnight_rate ?? 0,
    })
    setShowForm(true)
  }

  async function saveCottage(e: React.FormEvent) {
    e.preventDefault()
    if (!form.cottage_code || !form.name || form.day_rate <= 0) {
      showToast('Code, name, and a valid day rate are required.')
      return
    }

    if (editing) {
      const { error } = await supabase.from('cottages').update(form).eq('id', editing.id)
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`${form.name} updated.`)
    } else {
      const { error } = await supabase.from('cottages').insert({ ...form, status: 'available' })
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`${form.name} added.`)
    }
    setShowForm(false)
    load()
  }

  async function deleteCottage(c: any) {
    if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return
    const { error } = await supabase.from('cottages').delete().eq('id', c.id)
    if (error) { showToast('Error: ' + error.message + ' (may have linked bookings)'); return }
    showToast(`${c.name} deleted.`)
    load()
  }

  const counts = cottages.reduce((acc: Record<string, number>, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-medium text-gray-700">{cottages.length} Cottages</div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-xs">
            {Object.entries(statusColor).map(([s, cls]) => (
              <span key={s} className={`px-2 py-1 rounded-full capitalize ${cls}`}>
                {s} {counts[s] ? `(${counts[s]})` : ''}
              </span>
            ))}
          </div>
          {canManage && (
            <button onClick={openNew} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg whitespace-nowrap">
              + Add Cottage
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {cottages.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-400 text-sm">
              No cottages found.
            </div>
          ) : cottages.map(c => (
            <div key={c.id} className="bg-white border border-gray-100 rounded-xl p-3">
              <div className="flex items-start justify-between">
                <div className="text-lg font-semibold text-gray-800">{c.cottage_code}</div>
                {canManage && (
                  <button onClick={() => openEdit(c)} className="text-gray-400 hover:text-gray-600 text-xs">Edit</button>
                )}
              </div>
              <div className="text-xs text-gray-500 mb-1">{typeLabel[c.type] ?? c.type} — {c.capacity} pax</div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {c.status}
              </span>
              <div className="text-xs text-blue-600 font-medium mt-2">
                ₱{Number(c.day_rate).toLocaleString()}/day
              </div>
              <select
                value={c.status}
                onChange={e => updateStatus(c.id, e.target.value)}
                className="w-full mt-2 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white"
              >
                <option value="available">Available</option>
                <option value="occupied">Occupied</option>
                <option value="reserved">Reserved</option>
                <option value="cleaning">Cleaning</option>
                <option value="maintenance">Maintenance</option>
              </select>
              {canManage && (
                <button onClick={() => deleteCottage(c)} className="text-xs text-red-400 hover:text-red-600 mt-2">Delete</button>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <form onSubmit={saveCottage} className="bg-white rounded-xl p-5 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-1">{editing ? 'Edit Cottage' : 'Add Cottage'}</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Code</label>
                <input value={form.cottage_code} onChange={e => setForm(p => ({ ...p, cottage_code: e.target.value }))}
                  placeholder="C9" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Capacity</label>
                <input type="number" value={form.capacity} onChange={e => setForm(p => ({ ...p, capacity: parseInt(e.target.value) || 1 }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Open Cottage 2"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                <option value="open">Open Cottage</option>
                <option value="covered">Covered Cottage</option>
                <option value="family">Family Cottage</option>
                <option value="vip">VIP Cottage</option>
                <option value="function_hall">Function Hall</option>
                <option value="beach_table">Beach Table</option>
                <option value="tent_area">Tent Area</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Day Rate</label>
                <input type="number" value={form.day_rate} onChange={e => setForm(p => ({ ...p, day_rate: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Overnight Rate</label>
                <input type="number" value={form.overnight_rate} onChange={e => setForm(p => ({ ...p, overnight_rate: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-lg">
                {editing ? 'Save Changes' : 'Add Cottage'}
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
