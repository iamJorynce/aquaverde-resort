'use client'

import { useState } from 'react'

export default function SettingsPage() {
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    resort_name: 'AquaVerde Beach Resort',
    contact: '+63 912 345 6789',
    email: 'info@aquaverde.ph',
    address: 'Sarangani, South Cotabato, PH',
    check_in_time: '2:00 PM',
    check_out_time: '12:00 PM',
  })

  function save() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    // Note: persist this to a settings table in Supabase if you want it saved server-side.
  }

  const roles = [
    { role: 'Super Admin',   access: 'Full Access',       cls: 'bg-red-100 text-red-700' },
    { role: 'Resort Owner',  access: 'Full Access',       cls: 'bg-red-100 text-red-700' },
    { role: 'Front Desk',    access: 'Operations',        cls: 'bg-blue-100 text-blue-700' },
    { role: 'Cashier',       access: 'POS + Billing',     cls: 'bg-blue-100 text-blue-700' },
    { role: 'Housekeeping',  access: 'Tasks Only',        cls: 'bg-gray-100 text-gray-600' },
    { role: 'Maintenance',   access: 'Tasks Only',        cls: 'bg-gray-100 text-gray-600' },
    { role: 'Guest',         access: 'Portal Only',       cls: 'bg-green-100 text-green-700' },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <div className="text-sm font-medium text-gray-700 mb-3">Resort Information</div>
        <div className="space-y-3">
          {[
            { key: 'resort_name', label: 'Resort Name' },
            { key: 'contact', label: 'Contact Number' },
            { key: 'email', label: 'Email' },
            { key: 'address', label: 'Address' },
            { key: 'check_in_time', label: 'Check-in Time' },
            { key: 'check_out_time', label: 'Check-out Time' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
              <input
                value={(form as any)[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
              />
            </div>
          ))}
          <button onClick={save} className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg">
            {saved ? '✓ Saved!' : 'Save Changes'}
          </button>
          <div className="text-xs text-gray-400">
            Note: connect this form to a Supabase <code className="bg-gray-100 px-1 rounded">settings</code> table to persist changes.
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <div className="text-sm font-medium text-gray-700 mb-3">User Roles & Access</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="text-left py-2">Role</th>
              <th className="text-left py-2">Access Level</th>
            </tr>
          </thead>
          <tbody>
            {roles.map(r => (
              <tr key={r.role} className="border-b border-gray-50">
                <td className="py-2.5 text-gray-700">{r.role}</td>
                <td className="py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.cls}`}>{r.access}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
