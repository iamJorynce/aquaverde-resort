'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const ROLE_OPTIONS = [
  { value: 'super_admin',  label: 'Super Admin' },
  { value: 'resort_owner', label: 'Resort Owner' },
  { value: 'front_desk',   label: 'Front Desk' },
  { value: 'cashier',      label: 'Cashier' },
  { value: 'housekeeping', label: 'Housekeeping' },
  { value: 'maintenance',  label: 'Maintenance' },
  { value: 'restaurant',   label: 'Restaurant' },
  { value: 'staff',        label: 'Staff (general)' },
]

export default function StaffPage() {
  const supabase = createClient()
  const [staff, setStaff] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    email: '', password: '', full_name: '', role: 'front_desk',
    department: '', position: '', shift: 'AM',
    hire_date: new Date().toISOString().slice(0, 10),
  })

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('staff')
      .select('*, profiles(full_name, role)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    setStaff(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  function openNew() {
    setEditing(null)
    setForm({
      email: '', password: '', full_name: '', role: 'front_desk',
      department: '', position: '', shift: 'AM',
      hire_date: new Date().toISOString().slice(0, 10),
    })
    setShowForm(true)
  }

  function openEdit(s: any) {
    setEditing(s)
    setForm({
      email: '', password: '',
      full_name: (s.profiles as any)?.full_name ?? '',
      role: (s.profiles as any)?.role ?? 'front_desk',
      department: s.department ?? '', position: s.position ?? '',
      shift: s.shift ?? 'AM', hire_date: s.hire_date ?? new Date().toISOString().slice(0, 10),
    })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    try {
      if (editing) {
        // Editing only touches role/full_name (profiles) and staff fields —
        // no account creation needed here.
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ role: form.role, full_name: form.full_name })
          .eq('id', editing.profile_id)
        if (profileError) throw new Error(profileError.message)

        const { error: staffError } = await supabase
          .from('staff')
          .update({
            department: form.department, position: form.position,
            shift: form.shift, hire_date: form.hire_date,
          })
          .eq('id', editing.id)
        if (staffError) throw new Error(staffError.message)

        showToast('Staff record updated.')
      } else {
        // Creating a new staff member calls our server-side API route,
        // which uses the admin service role key to create the login,
        // the profile, and the staff record all at once.
        if (!form.email || !form.password || !form.full_name) {
          throw new Error('Email, password, and full name are required.')
        }

        const res = await fetch('/api/create-staff-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const result = await res.json()

        if (!res.ok) throw new Error(result.error ?? 'Failed to create staff account.')

        showToast(`Staff account created! ${form.full_name} can now log in with ${form.email}.`)
      }

      setShowForm(false)
      load()
    } catch (err: any) {
      showToast('Error: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function deactivate(s: any) {
    if (!confirm(`Remove ${(s.profiles as any)?.full_name} from active staff list? Their login will still work, but they'll no longer appear here.`)) return
    const { error } = await supabase.from('staff').update({ is_active: false }).eq('id', s.id)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Staff record removed.')
    load()
  }

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50 max-w-sm">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-medium text-gray-700">{staff.length} Staff Members</div>
        <button onClick={openNew} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg">
          + Add Staff
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5">Employee</th>
                <th className="text-left px-4 py-2.5">Role</th>
                <th className="text-left px-4 py-2.5">Department</th>
                <th className="text-left px-4 py-2.5">Position</th>
                <th className="text-left px-4 py-2.5">Shift</th>
                <th className="text-left px-4 py-2.5">Hire Date</th>
                <th className="text-left px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-xs">
                  No staff yet. Click "Add Staff" to create their account and role.
                </td></tr>
              ) : staff.map(s => (
                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-700">{(s.profiles as any)?.full_name}</div>
                    <div className="text-xs text-gray-400">{s.employee_code}</div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 capitalize">{(s.profiles as any)?.role?.replace('_', ' ')}</td>
                  <td className="px-4 py-2.5 text-gray-600">{s.department || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600">{s.position || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600">{s.shift || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{s.hire_date || '—'}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => openEdit(s)} className="px-2 py-1 text-gray-400 hover:text-gray-600 text-xs mr-1">Edit</button>
                    <button onClick={() => deactivate(s)} className="px-2 py-1 text-red-400 hover:text-red-600 text-xs">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !submitting && setShowForm(false)}>
          <form onSubmit={handleSubmit} className="bg-white rounded-xl p-5 w-full max-w-sm space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-1">{editing ? 'Edit Staff Record' : 'Add Staff'}</div>

            {!editing && (
              <>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Email (used to log in)</label>
                  <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="staff@aquaverde.ph"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Temporary Password</label>
                  <input type="text" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="At least 6 characters"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
                  <div className="text-xs text-gray-400 mt-1">Share this with the staff member — they can change it after logging in.</div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs text-gray-500 mb-1">Full Name</label>
              <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                placeholder="e.g. Maria Santos"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Role</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <div className="text-xs text-gray-400 mt-1">Controls what this user can see and do in the system.</div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Department</label>
              <input value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))}
                placeholder="e.g. Front Desk, Housekeeping"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Position</label>
              <input value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))}
                placeholder="e.g. Receptionist"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Shift</label>
                <select value={form.shift} onChange={e => setForm(p => ({ ...p, shift: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                  <option value="Night">Night</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Hire Date</label>
                <input type="date" value={form.hire_date} onChange={e => setForm(p => ({ ...p, hire_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={submitting} className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm rounded-lg">
                {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Create Account'}
              </button>
              <button type="button" disabled={submitting} onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
