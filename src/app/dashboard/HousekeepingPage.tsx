'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from './permissions'
import { logActivity } from './activityLog'

const statusColor: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const priorityColor: Record<string, string> = {
  low: 'bg-blue-100 text-blue-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

export default function HousekeepingPage() {
  const supabase = createClient()
  const { can } = usePermissions()
  const [tasks, setTasks] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ room_id: '', task_type: 'cleaning', priority: 'medium', notes: '' })

  async function load() {
    setLoading(true)
    const [{ data: taskData }, { data: roomData }] = await Promise.all([
      supabase
        .from('housekeeping_tasks')
        .select('*, rooms(room_number), cottages(name, cottage_code)')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('rooms').select('id, room_number').order('room_number'),
    ])
    setTasks(taskData ?? [])
    setRooms(roomData ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault()
    if (!form.room_id) { showToast('Please select a room.'); return }

    const taskNumber = `HK-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Date.now().toString().slice(-4)}`

    const { error } = await supabase.from('housekeeping_tasks').insert({
      task_number: taskNumber,
      room_id: form.room_id,
      task_type: form.task_type,
      priority: form.priority,
      notes: form.notes || null,
      status: 'pending',
    })

    if (error) { showToast('Error: ' + error.message); return }
    showToast('Task created.')
    setForm({ room_id: '', task_type: 'cleaning', priority: 'medium', notes: '' })
    setShowForm(false)
    load()
  }

  async function updateTaskStatus(task: any, status: string) {
    const updates: any = { status }
    if (status === 'in_progress') updates.started_at = new Date().toISOString()
    if (status === 'completed') updates.completed_at = new Date().toISOString()

    const { error } = await supabase.from('housekeeping_tasks').update(updates).eq('id', task.id)
    if (error) { showToast('Error: ' + error.message); return }

    if (status === 'completed' && task.room_id) {
      await supabase.from('rooms').update({ status: 'available', last_cleaned_at: new Date().toISOString() }).eq('id', task.room_id)
    }

    await logActivity(supabase, {
      action: status === 'completed' ? 'TASK_COMPLETED' : 'TASK_STARTED',
      details: `${task.task_number} (${task.task_type})`,
      table_name: 'housekeeping_tasks',
      record_id: task.id,
    })

    showToast(`Task ${task.task_number} → ${status.replace('_', ' ')}`)
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
        <div className="text-sm font-medium text-gray-700">{tasks.length} Tasks</div>
        {can('canCreateHousekeepingTask') && (
          <button onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg">
            {showForm ? 'Cancel' : '+ Assign Task'}
          </button>
        )}
      </div>

      {showForm && can('canCreateHousekeepingTask') && (
        <form onSubmit={createTask} className="bg-white border border-gray-100 rounded-xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Room</label>
            <select value={form.room_id} onChange={e => setForm(p => ({ ...p, room_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
              <option value="">-- Select --</option>
              {rooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Task Type</label>
            <select value={form.task_type} onChange={e => setForm(p => ({ ...p, task_type: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
              <option value="cleaning">Cleaning</option>
              <option value="turndown">Turndown</option>
              <option value="deep_clean">Deep Clean</option>
              <option value="inspection">Inspection</option>
              <option value="linen_change">Linen Change</option>
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
          <button type="submit" className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-lg">
            Create
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
                <th className="text-left px-4 py-2.5">Room</th>
                <th className="text-left px-4 py-2.5">Type</th>
                <th className="text-left px-4 py-2.5">Priority</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-xs">No tasks found.</td></tr>
              ) : tasks.map(t => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    {t.rooms ? `Room ${(t.rooms as any).room_number}` : (t.cottages as any)?.name ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 capitalize text-gray-600">{t.task_type.replace('_', ' ')}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${priorityColor[t.priority]}`}>{t.priority}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColor[t.status]}`}>{t.status.replace('_', ' ')}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {t.status === 'pending' && (
                      <button onClick={() => updateTaskStatus(t, 'in_progress')} className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg">Start</button>
                    )}
                    {t.status === 'in_progress' && (
                      <button onClick={() => updateTaskStatus(t, 'completed')} className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg">Complete</button>
                    )}
                    {t.status === 'completed' && <span className="text-xs text-gray-400">Done</span>}
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
