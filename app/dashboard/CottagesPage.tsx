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

// Fallback labels for any legacy row that predates cottage_types_config
// and hasn't been backfilled with a cottage_type_id yet — should not
// normally be hit after the migration runs, but keeps display safe.
const legacyTypeLabel: Record<string, string> = {
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
  const [cottageTypes, setCottageTypes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    cottage_code: '', name: '', cottage_type_id: '', capacity: 8,
    day_rate: 0, overnight_rate: 0,
  })

  // ---- Cottage Type (category) management ----
  const [showTypeForm, setShowTypeForm] = useState(false)
  const [editingType, setEditingType] = useState<any>(null)
  const [typeForm, setTypeForm] = useState({
    name: '', max_capacity: 8, description: '',
  })

  async function load() {
    setLoading(true)
    const [{ data: cottageData }, { data: typeData }] = await Promise.all([
      supabase.from('cottages').select('*, cottage_types_config(id, name)').order('cottage_code'),
      supabase.from('cottage_types_config').select('*').eq('is_active', true).order('name'),
    ])
    setCottages(cottageData ?? [])
    setCottageTypes(typeData ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function typeLabelFor(c: any): string {
    return c.cottage_types_config?.name ?? legacyTypeLabel[c.type] ?? c.type ?? '—'
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from('cottages').update({ status }).eq('id', id)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Status updated.')
    load()
  }

  function openNew() {
    setEditing(null)
    setForm({
      cottage_code: '', name: '',
      cottage_type_id: cottageTypes[0]?.id ?? '',
      capacity: 8, day_rate: 0, overnight_rate: 0,
    })
    setShowForm(true)
  }

  function openEdit(c: any) {
    setEditing(c)
    setForm({
      cottage_code: c.cottage_code, name: c.name,
      cottage_type_id: c.cottage_type_id ?? cottageTypes[0]?.id ?? '',
      capacity: c.capacity, day_rate: c.day_rate, overnight_rate: c.overnight_rate ?? 0,
    })
    setShowForm(true)
  }

  function onTypeChange(cottage_type_id: string) {
    setForm(p => ({ ...p, cottage_type_id }))
  }

  async function saveCottage(e: React.FormEvent) {
    e.preventDefault()
    if (!form.cottage_code || !form.name || form.day_rate <= 0) {
      showToast('Code, name, and a valid day rate are required.')
      return
    }
    if (!form.cottage_type_id) {
      showToast('Please select a cottage type.')
      return
    }

    const payload = {
      cottage_code: form.cottage_code,
      name: form.name,
      cottage_type_id: form.cottage_type_id,
      capacity: form.capacity,
      day_rate: form.day_rate,
      overnight_rate: form.overnight_rate,
    }

    if (editing) {
      const { error } = await supabase.from('cottages').update(payload).eq('id', editing.id)
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`${form.name} updated.`)
    } else {
      const { error } = await supabase.from('cottages').insert({ ...payload, status: 'available' })
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

  // ---- Cottage Type CRUD ----
  function openNewType() {
    setEditingType(null)
    setTypeForm({ name: '', max_capacity: 8, description: '' })
    setShowTypeForm(true)
  }

  function openEditType(ct: any) {
    setEditingType(ct)
    setTypeForm({
      name: ct.name,
      max_capacity: ct.max_capacity ?? 8,
      description: ct.description ?? '',
    })
    setShowTypeForm(true)
  }

  async function saveType(e: React.FormEvent) {
    e.preventDefault()
    if (!typeForm.name.trim()) {
      showToast('Type name is required.')
      return
    }

    if (editingType) {
      const { error } = await supabase.from('cottage_types_config').update(typeForm).eq('id', editingType.id)
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`${typeForm.name} updated.`)
    } else {
      const { error } = await supabase.from('cottage_types_config').insert(typeForm)
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`${typeForm.name} added.`)
    }
    setShowTypeForm(false)
    load()
  }

  async function deactivateType(ct: any) {
    if (!confirm(`Deactivate "${ct.name}"? It will no longer be selectable for new cottages, but existing cottages keep it.`)) return
    const { error } = await supabase.from('cottage_types_config').update({ is_active: false }).eq('id', ct.id)
    if (error) { showToast('Error: ' + error.message); return }
    showToast(`${ct.name} deactivated.`)
    load()
  }

  const counts = cottages.reduce((acc: Record<string, number>, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1
    return acc
  }, {})

  const q = search.trim().toLowerCase()
  const filteredCottages = cottages.filter(c => {
    if (!q) return true
    return [c.cottage_code, c.name, typeLabelFor(c), c.status]
      .some(v => v && String(v).toLowerCase().includes(q))
  })

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50">
          {toast}
        </div>
      )}

      {/* Cottage Types management */}
      <div className="mb-5 bg-white border border-gray-100 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-gray-700">Cottage Types</div>
          {canManage && (
            <button onClick={openNewType} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg whitespace-nowrap">
              + Add Cottage Type
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {cottageTypes.length === 0 ? (
            <div className="text-xs text-gray-400">No cottage types yet.</div>
          ) : cottageTypes.map(ct => (
            <div key={ct.id} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5 text-xs">
              <span className="font-medium text-gray-700">{ct.name}</span>
              {canManage && (
                <button onClick={() => openEditType(ct)} className="text-gray-400 hover:text-gray-600 ml-1">Edit</button>
              )}
              {canManage && (
                <button onClick={() => deactivateType(ct)} className="text-red-400 hover:text-red-600">✕</button>
              )}
            </div>
          ))}
        </div>
      </div>

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

      <div className="relative mb-4 max-w-sm">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search code, name, type..."
          className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
            ✕
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filteredCottages.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-400 text-sm">
              {q ? 'No cottages match your search.' : 'No cottages found.'}
            </div>
          ) : filteredCottages.map(c => (
            <div key={c.id} className="bg-white border border-gray-100 rounded-xl p-3">
              <div className="flex items-start justify-between">
                <div className="text-lg font-semibold text-gray-800">{c.cottage_code}</div>
                {canManage && (
                  <button onClick={() => openEdit(c)} className="text-gray-400 hover:text-gray-600 text-xs">Edit</button>
                )}
              </div>
              <div className="text-xs text-gray-500 mb-1">{typeLabelFor(c)} — {c.capacity} pax</div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {c.status}
              </span>
              <div className="text-xs text-blue-600 font-medium mt-2">
                ₱{Number(c.day_rate).toLocaleString()}/day <br/>
                ₱{Number(c.overnight_rate).toLocaleString()}/overnight 
              </div>
              <select
                value={c.status}
                onChange={e => updateStatus(c.id, e.target.value)}
                disabled={!canManage}
                className="w-full mt-2 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white disabled:opacity-60 disabled:cursor-not-allowed"
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
              <select value={form.cottage_type_id} onChange={e => onTypeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                <option value="">-- Select --</option>
                {cottageTypes.map(ct => (
                  <option key={ct.id} value={ct.id}>{ct.name}</option>
                ))}
              </select>
              {cottageTypes.length === 0 && (
                <p className="text-xs text-red-500 mt-1">No cottage types yet — add one above first.</p>
              )}
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

      {showTypeForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowTypeForm(false)}>
          <form onSubmit={saveType} className="bg-white rounded-xl p-5 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-1">{editingType ? 'Edit Cottage Type' : 'Add Cottage Type'}</div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input value={typeForm.name} onChange={e => setTypeForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Garden Cottage"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Max Capacity</label>
              <input type="number" value={typeForm.max_capacity} onChange={e => setTypeForm(p => ({ ...p, max_capacity: parseInt(e.target.value) || 1 }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <input value={typeForm.description} onChange={e => setTypeForm(p => ({ ...p, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <p className="text-[11px] text-gray-400">
              Rates are set per cottage, not per type — this is just a label for organizing cottages.
            </p>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-lg">
                {editingType ? 'Save Changes' : 'Add Type'}
              </button>
              <button type="button" onClick={() => setShowTypeForm(false)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
