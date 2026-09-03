'use client'

import { useEffect, useState } from 'react'
import { MODULE_ACCESS, ROLE_LABELS, type Role } from './permissions'

type FormState = {
  resort_name: string
  contact: string
  email: string
  address: string
  check_in_time: string
  check_out_time: string
  facebook_url: string
  gcash_number: string
  bank_name: string
  bank_account_number: string
}

const EMPTY_FORM: FormState = {
  resort_name: '',
  contact: '',
  email: '',
  address: '',
  check_in_time: '',
  check_out_time: '',
  facebook_url: '',
  gcash_number: '',
  bank_name: '',
  bank_account_number: '',
}

// Roles derived from permissions.ts instead of hardcoded, so this table can
// never drift from the actual access-control logic.
const FULL_ACCESS: Role[] = ['super_admin', 'resort_owner']

function accessLabel(role: Role): { access: string; cls: string } {
  if (FULL_ACCESS.includes(role)) return { access: 'Full Access', cls: 'bg-red-100 text-red-700' }
  const moduleCount = Object.values(MODULE_ACCESS).filter(roles => roles.includes(role)).length
  if (role === 'guest') return { access: 'Portal Only', cls: 'bg-green-100 text-green-700' }
  if (moduleCount <= 2) return { access: 'Tasks Only', cls: 'bg-gray-100 text-gray-600' }
  if (role === 'cashier') return { access: 'POS + Billing', cls: 'bg-blue-100 text-blue-700' }
  return { access: 'Operations', cls: 'bg-blue-100 text-blue-700' }
}

const roles = (Object.keys(ROLE_LABELS) as Role[]).map(role => ({
  role: ROLE_LABELS[role],
  ...accessLabel(role),
}))

export default function SettingsPage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/settings')
      .then(res => res.json())
      .then(json => {
        if (cancelled) return
        if (!json.success) {
          setError(json.error ?? 'Failed to load settings')
          return
        }
        const d = json.data
        setForm({
          resort_name: d.resort_name ?? '',
          contact: d.contact ?? '',
          email: d.email ?? '',
          address: d.address ?? '',
          check_in_time: d.check_in_time ?? '',
          check_out_time: d.check_out_time ?? '',
          facebook_url: d.facebook_url ?? '',
          gcash_number: d.gcash_number ?? '',
          bank_name: d.bank_name ?? '',
          bank_account_number: d.bank_account_number ?? '',
        })
      })
      .catch(() => !cancelled && setError('Failed to load settings'))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!json.success) {
        setError(json.error ?? 'Failed to save settings')
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <div className="text-sm font-medium text-gray-700 mb-3">Resort Information</div>
        <div className="space-y-3">
          {[
            { key: 'resort_name', label: 'Resort/Hotel Name' },
            { key: 'contact', label: 'Contact Number' },
            { key: 'email', label: 'Email' },
            { key: 'address', label: 'Address' },
            { key: 'check_in_time', label: 'Check-in Time' },
            { key: 'check_out_time', label: 'Check-out Time' },
            { key: 'facebook_url', label: 'Facebook Page URL' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
              <input
                value={(form as any)[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white disabled:bg-gray-50"
              />
            </div>
          ))}

          <div className="pt-2 mt-1 border-t border-gray-100">
            <div className="text-xs font-medium text-gray-700 mb-2">Payment Details</div>
            <p className="text-[11px] text-gray-400 mb-3">
              Shown to guests at checkout under &ldquo;Send payment to&rdquo; — keep this
              accurate, guests send money here directly.
            </p>
          </div>
          {[
            { key: 'gcash_number', label: 'GCash Number' },
            { key: 'bank_name', label: 'Bank Name' },
            { key: 'bank_account_number', label: 'Bank Account Number' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
              <input
                value={(form as any)[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white disabled:bg-gray-50"
              />
            </div>
          ))}

          <button
            onClick={save}
            disabled={loading || saving}
            className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg"
          >
            {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Changes'}
          </button>
          {error && <div className="text-xs text-red-600">{error}</div>}
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
