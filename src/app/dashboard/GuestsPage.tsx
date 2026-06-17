'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function GuestsPage() {
  const supabase = createClient()
  const [guests, setGuests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [toast, setToast] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({ full_name: '', phone: '', email: '' })

  async function load() {
    setLoading(true)
    let query = supabase.from('guests').select('*').order('created_at', { ascending: false })
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,guest_code.ilike.%${search}%`)
    }
    const { data } = await query
    setGuests(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [search])

  async function openGuest(guest: any) {
    setSelected(guest)
    const { data } = await supabase
      .from('bookings')
      .select('booking_number, check_in_date, check_out_date, total_amount, rooms(room_number), cottages(name)')
      .eq('guest_id', guest.id)
      .order('check_in_date', { ascending: false })
    setHistory(data ?? [])
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function openNew() {
    setEditing(null)
    setForm({ full_name: '', phone: '', email: '' })
    setShowForm(true)
  }

  function openEditGuest(g: any) {
    setEditing(g)
    setForm({ full_name: g.full_name, phone: g.phone ?? '', email: g.email ?? '' })
    setShowForm(true)
  }

  async function saveGuest(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name) { showToast('Full name is required.'); return }

    if (editing) {
      const { error } = await supabase.from('guests').update(form).eq('id', editing.id)
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`${form.full_name} updated.`)
    } else {
      const guestCode = `G-${Date.now().toString().slice(-6)}`
      const { error } = await supabase.from('guests').insert({ ...form, guest_code: guestCode })
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`${form.full_name} added.`)
    }
    setShowForm(false)
    load()
  }

  const tierColor: Record<string, string> = {
    regular: 'bg-gray-100 text-gray-600',
    silver: 'bg-blue-100 text-blue-700',
    gold: 'bg-yellow-100 text-yellow-700',
    platinum: 'bg-purple-100 text-purple-700',
  }

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50">
          {toast}
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone, or guest code..."
          className="flex-1 max-w-sm px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
        />
        <button onClick={openNew} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg whitespace-nowrap">
          + Add Guest
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5">Guest</th>
                <th className="text-left px-4 py-2.5">Contact</th>
                <th className="text-left px-4 py-2.5">Loyalty</th>
                <th className="text-left px-4 py-2.5">Joined</th>
                <th className="text-left px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {guests.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-xs">No guests found.</td></tr>
              ) : guests.map(g => (
                <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-700">{g.full_name}</div>
                    <div className="text-xs text-gray-400">{g.guest_code}</div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{g.phone ?? g.email ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${tierColor[g.loyalty_tier] ?? tierColor.regular}`}>
                      {g.loyalty_points} pts — {g.loyalty_tier}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{new Date(g.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5 flex gap-1">
                    <button onClick={() => openGuest(g)} className="px-2.5 py-1 border border-gray-200 hover:bg-gray-50 text-xs rounded-lg">
                      View
                    </button>
                    <button onClick={() => openEditGuest(g)} className="px-2.5 py-1 text-gray-400 hover:text-gray-600 text-xs">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-medium">
                {selected.full_name.split(' ').map((n: string) => n[0]).slice(0,2).join('')}
              </div>
              <div>
                <div className="font-medium text-gray-800">{selected.full_name}</div>
                <div className="text-xs text-gray-400">{selected.guest_code} · {selected.loyalty_points} pts</div>
              </div>
            </div>
            <div className="text-sm space-y-1 mb-4">
              <div className="flex justify-between"><span className="text-gray-500">Phone</span><span>{selected.phone ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Email</span><span>{selected.email ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total Visits</span><span>{history.length}</span></div>
            </div>
            <div className="text-sm font-medium text-gray-700 mb-2">Visit History</div>
            <table className="w-full text-xs">
              <thead><tr className="text-gray-400"><th className="text-left py-1">Date</th><th className="text-left py-1">Room</th><th className="text-right py-1">Amount</th></tr></thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan={3} className="py-3 text-center text-gray-400">No booking history.</td></tr>
                ) : history.map((h, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="py-1.5">{h.check_in_date}</td>
                    <td className="py-1.5">{h.rooms?.room_number ? `Room ${h.rooms.room_number}` : h.cottages?.name ?? '—'}</td>
                    <td className="py-1.5 text-right">₱{Number(h.total_amount).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setSelected(null)} className="w-full mt-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">
              Close
            </button>
          </div>
        </div>
      )}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <form onSubmit={saveGuest} className="bg-white rounded-xl p-5 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-1">{editing ? 'Edit Guest' : 'Add Guest'}</div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Full Name</label>
              <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="+63 9XX XXX XXXX"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-lg">
                {editing ? 'Save Changes' : 'Add Guest'}
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
