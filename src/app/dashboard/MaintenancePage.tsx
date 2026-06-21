'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from './activityLog'

const statusColor: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  ongoing: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const priorityColor: Record<string, string> = {
  low: 'bg-blue-100 text-blue-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

export default function MaintenancePage() {
  const supabase = createClient()
  const [tickets, setTickets] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ room_id: '', title: '', description: '', priority: 'medium' })

  async function load() {
    setLoading(true)
    const [{ data: ticketData }, { data: roomData }] = await Promise.all([
      supabase
        .from('maintenance_requests')
        .select('*, rooms(room_number), cottages(name, cottage_code)')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('rooms').select('id, room_number').order('room_number'),
    ])
    setTickets(ticketData ?? [])
    setRooms(roomData ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function createTicket(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title) { showToast('Please enter an issue title.'); return }

    const ticketNumber = `MT-${Date.now().toString().slice(-6)}`

    const { error } = await supabase.from('maintenance_requests').insert({
      ticket_number: ticketNumber,
      room_id: form.room_id || null,
      title: form.title,
      description: form.description || null,
      priority: form.priority,
      status: 'pending',
    })

    if (error) { showToast('Error: ' + error.message); return }

    if (form.room_id && form.priority === 'urgent') {
      await supabase.from('rooms').update({ status: 'maintenance' }).eq('id', form.room_id)
    }

    showToast('Maintenance ticket created.')
    setForm({ room_id: '', title: '', description: '', priority: 'medium' })
    setShowForm(false)
    load()
  }

  async function updateTicketStatus(ticket: any, status: string) {
    const updates: any = { status }
    if (status === 'ongoing') updates.started_at = new Date().toISOString()
    if (status === 'completed') updates.completed_at = new Date().toISOString()

    const { error } = await supabase.from('maintenance_requests').update(updates).eq('id', ticket.id)
    if (error) { showToast('Error: ' + error.message); return }

    if (status === 'completed' && ticket.room_id) {
      await supabase.from('rooms').update({ status: 'available' }).eq('id', ticket.room_id)
    }

    await logActivity(supabase, {
      action: status === 'completed' ? 'MAINTENANCE_RESOLVED' : 'MAINTENANCE_STARTED',
      details: `${ticket.ticket_number} — ${ticket.title}`,
      table_name: 'maintenance_requests',
      record_id: ticket.id,
    })

    showToast(`Ticket ${ticket.ticket_number} → ${status}`)
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
        <div className="text-sm font-medium text-gray-700">{tickets.length} Tickets</div>
        <button onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg">
          {showForm ? 'Cancel' : '+ New Request'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createTicket} className="bg-white border border-gray-100 rounded-xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Location (optional)</label>
              <select value={form.room_id} onChange={e => setForm(p => ({ ...p, room_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                <option value="">General / Other</option>
                {rooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Priority</label>
              <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Issue Title</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="e.g. AC unit not cooling"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Description</label>
            <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Additional details..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
          </div>
          <button type="submit" className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-lg">
            Submit Request
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5">Ticket</th>
                <th className="text-left px-4 py-2.5">Location</th>
                <th className="text-left px-4 py-2.5">Issue</th>
                <th className="text-left px-4 py-2.5">Priority</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-xs">No tickets found.</td></tr>
              ) : tickets.map(t => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-blue-700">{t.ticket_number}</td>
                  <td className="px-4 py-2.5">
                    {t.rooms ? `Room ${(t.rooms as any).room_number}` : (t.cottages as any)?.name ?? 'General'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{t.title}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${priorityColor[t.priority]}`}>{t.priority}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColor[t.status]}`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {t.status === 'pending' && (
                      <button onClick={() => updateTicketStatus(t, 'ongoing')} className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg">Start</button>
                    )}
                    {t.status === 'ongoing' && (
                      <button onClick={() => updateTicketStatus(t, 'completed')} className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg">Resolve</button>
                    )}
                    {t.status === 'completed' && <span className="text-xs text-gray-400">Resolved</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
