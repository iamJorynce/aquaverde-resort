'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from './activityLog'

type RemittanceTab = 'shift' | 'history' | 'approve'

const STATUS_COLOR: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  verified:  'bg-purple-100 text-purple-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
}

export default function RemittancePage() {
  const supabase = createClient()
  const [tab, setTab] = useState<RemittanceTab>('shift')
  const [profile, setProfile] = useState<any>(null)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)

  // Current shift state
  const [activeShift, setActiveShift]       = useState<any>(null)
  const [openingFund, setOpeningFund]       = useState(0)
  const [shiftType, setShiftType]           = useState('AM')
  const [shiftTxns, setShiftTxns]           = useState<any[]>([])

  // Draft remittance / cash count
  const [draftRemittance, setDraftRemittance] = useState<any>(null)
  const [actualCash, setActualCash]           = useState(0)
  const [varianceRemarks, setVarianceRemarks] = useState('')
  const [remittanceNotes, setRemittanceNotes] = useState('')

  // History
  const [history, setHistory]   = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)

  // Admin approve view
  const [pending, setPending]         = useState<any[]>([])
  const [rejectionNote, setRejectionNote] = useState('')

  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'resort_owner'

  useEffect(() => {
    loadProfile()
  }, [])

  useEffect(() => {
    if (!profile) return
    if (tab === 'shift') { loadActiveShift(); loadHistory() }
    if (tab === 'history') loadHistory()
    if (tab === 'approve') loadPending()
  }, [tab, profile])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('profiles').select('id, full_name, role').eq('id', user.id).single()
    setProfile(data)
  }

  async function loadActiveShift() {
    if (!profile) return
    const { data: shift } = await supabase
      .from('shifts')
      .select('*')
      .eq('cashier_id', profile.id)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    setActiveShift(shift)

    if (shift) {
      // Load ALL transactions within the shift time range — regardless of
      // whether they have a shift_id tag. This includes walk-in, check-out,
      // POS, day use, and equipment rental payments.
      const shiftStart = shift.opened_at
      const shiftEnd = shift.closed_at ?? new Date().toISOString()

      const [{ data: txns }, { data: dayUseTxns }] = await Promise.all([
        supabase
          .from('transactions')
          .select('amount, payment_method, txn_type, description, created_at')
          .gte('created_at', shiftStart)
          .lte('created_at', shiftEnd)
          .eq('voided', false)
          .order('created_at'),
        supabase
          .from('day_use_entries')
          .select('total_amount, payment_method, entry_number, created_at')
          .gte('created_at', shiftStart)
          .lte('created_at', shiftEnd)
          .order('created_at'),
      ])

      // Normalize day_use_entries into the same shape as transactions
      const normalizedDayUse = (dayUseTxns ?? []).map((d: any) => ({
        amount: d.total_amount,
        payment_method: d.payment_method ?? 'cash',
        txn_type: 'day_use',
        description: `Day Use Entry ${d.entry_number}`,
        created_at: d.created_at,
      }))

      const allTxns = [...(txns ?? []), ...normalizedDayUse]
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

      setShiftTxns(allTxns)

      // Check if there's already a draft remittance for this shift
      const { data: draft } = await supabase
        .from('remittances')
        .select('*')
        .eq('shift_id', shift.id)
        .in('status', ['draft'])
        .maybeSingle()
      setDraftRemittance(draft)
      if (draft) {
        setActualCash(draft.actual_cash ?? 0)
        setVarianceRemarks(draft.variance_remarks ?? '')
        setRemittanceNotes(draft.notes ?? '')
      }
    }
  }

  async function loadHistory() {
    if (!profile) return
    const query = isAdmin
      ? supabase.from('remittances').select('*').order('created_at', { ascending: false }).limit(50)
      : supabase.from('remittances').select('*').eq('cashier_id', profile.id).order('created_at', { ascending: false })
    const { data } = await query
    setHistory(data ?? [])
  }

  async function loadPending() {
    const { data } = await supabase
      .from('remittances')
      .select('*, shifts(shift_type, opened_at, closed_at)')
      .in('status', ['submitted', 'verified'])
      .order('submitted_at', { ascending: false })
    setPending(data ?? [])
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 4000) }

  // ---- Open shift ----
  async function openShift() {
    if (!profile) return
    setLoading(true)
    const shiftNumber = `SHF-${Date.now().toString().slice(-8)}`
    const { data: shift, error } = await supabase.from('shifts').insert({
      shift_number: shiftNumber,
      cashier_id: profile.id,
      cashier_name: profile.full_name,
      shift_type: shiftType,
      opening_fund: openingFund,
    }).select().single()

    if (error) { showToast('Error: ' + error.message); setLoading(false); return }

    await logActivity(supabase, {
      action: 'SHIFT_OPENED',
      details: `${shiftNumber} — ${shiftType} shift, opening fund ₱${openingFund}`,
    })
    showToast(`Shift ${shiftNumber} opened.`)
    setLoading(false)
    loadActiveShift()
  }

  // ---- Close shift & generate remittance ----
  async function closeShiftAndGenerateRemittance() {
    if (!activeShift) return
    setLoading(true)

    const closedAt = new Date().toISOString()

    // Close the shift first
    await supabase.from('shifts').update({ status: 'closed', closed_at: closedAt }).eq('id', activeShift.id)

    // Re-fetch ALL transactions within the shift time range for accurate totals
    const shiftStart = activeShift.opened_at

    const [{ data: txns }, { data: dayUseTxns }] = await Promise.all([
      supabase
        .from('transactions')
        .select('amount, payment_method, txn_type')
        .gte('created_at', shiftStart)
        .lte('created_at', closedAt)
        .eq('voided', false),
      supabase
        .from('day_use_entries')
        .select('total_amount, payment_method')
        .gte('created_at', shiftStart)
        .lte('created_at', closedAt),
    ])

    const allTxns = [
      ...(txns ?? []).map((t: any) => ({ amount: t.amount, payment_method: t.payment_method ?? 'other' })),
      ...(dayUseTxns ?? []).map((d: any) => ({ amount: d.total_amount, payment_method: d.payment_method ?? 'cash' })),
    ]

    const gross = allTxns.reduce((s, t) => s + Number(t.amount), 0)
    const byMethod = allTxns.reduce((acc: any, t) => {
      const m = t.payment_method ?? 'other'
      acc[m] = (acc[m] ?? 0) + Number(t.amount)
      return acc
    }, {})

    const remittanceNumber = `REM-${Date.now().toString().slice(-8)}`
    const { data: rem, error } = await supabase.from('remittances').insert({
      remittance_number: remittanceNumber,
      shift_id: activeShift.id,
      cashier_id: profile.id,
      cashier_name: profile.full_name,
      gross_collections: gross,
      cash_collections: byMethod['cash'] ?? 0,
      gcash_collections: byMethod['gcash'] ?? 0,
      maya_collections: byMethod['maya'] ?? 0,
      bank_transfer_collections: byMethod['bank_transfer'] ?? 0,
      card_collections: byMethod['credit_card'] ?? 0,
      other_collections: byMethod['other'] ?? 0,
      opening_fund: activeShift.opening_fund,
      actual_cash: 0,
      status: 'draft',
    }).select().single()

    if (error) { showToast('Error: ' + error.message); setLoading(false); return }

    await logActivity(supabase, {
      action: 'SHIFT_CLOSED',
      details: `${activeShift.shift_number} closed — gross ₱${gross.toLocaleString()}`,
    })

    showToast('Shift closed. Please perform cash count.')
    setLoading(false)
    loadActiveShift()
  }

  // ---- Save cash count ----
  async function saveCashCount() {
    if (!draftRemittance) return
    setLoading(true)

    const expected = Number(draftRemittance.opening_fund) + Number(draftRemittance.cash_collections)
    const variance = actualCash - expected
    const varianceStatus = Math.abs(variance) < 0.01 ? 'balanced' : variance < 0 ? 'short' : 'over'

    const { error } = await supabase.from('remittances').update({
      actual_cash: actualCash,
      variance_status: varianceStatus,
      variance_remarks: varianceRemarks || null,
      notes: remittanceNotes || null,
    }).eq('id', draftRemittance.id)

    if (error) { showToast('Error: ' + error.message); setLoading(false); return }
    showToast('Cash count saved.')
    setLoading(false)
    loadActiveShift()
  }

  // ---- Submit remittance ----
  async function submitRemittance() {
    if (!draftRemittance) return
    if (draftRemittance.variance_status !== 'balanced' && !varianceRemarks) {
      showToast('Please enter variance remarks before submitting.'); return
    }
    setLoading(true)

    const { error } = await supabase.from('remittances').update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      actual_cash: actualCash,
      variance_remarks: varianceRemarks || null,
      notes: remittanceNotes || null,
    }).eq('id', draftRemittance.id)

    if (error) { showToast('Error: ' + error.message); setLoading(false); return }

    await logActivity(supabase, {
      action: 'REMITTANCE_SUBMITTED',
      details: `${draftRemittance.remittance_number} — net ₱${Number(draftRemittance.net_collections).toLocaleString()}`,
    })

    showToast('Remittance submitted for approval.')
    setLoading(false)
    setActiveShift(null)
    loadHistory()
    setTab('history')
  }

  // ---- Admin: approve/reject ----
  async function approveRemittance(rem: any) {
    setLoading(true)
    const { error } = await supabase.from('remittances').update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by_id: profile.id,
      approved_by_name: profile.full_name,
    }).eq('id', rem.id)
    if (error) { showToast('Error: ' + error.message); setLoading(false); return }
    await logActivity(supabase, { action: 'REMITTANCE_APPROVED', details: rem.remittance_number })
    showToast(`${rem.remittance_number} approved.`)
    setLoading(false)
    loadPending()
  }

  async function rejectRemittance(rem: any) {
    if (!rejectionNote) { showToast('Please enter a reason for rejection.'); return }
    setLoading(true)
    const { error } = await supabase.from('remittances').update({
      status: 'rejected',
      rejection_remarks: rejectionNote,
      approved_by_id: profile.id,
      approved_by_name: profile.full_name,
    }).eq('id', rem.id)
    if (error) { showToast('Error: ' + error.message); setLoading(false); return }
    await logActivity(supabase, { action: 'REMITTANCE_REJECTED', details: `${rem.remittance_number} — ${rejectionNote}` })
    showToast(`${rem.remittance_number} rejected.`)
    setRejectionNote('')
    setLoading(false)
    loadPending()
  }

  // ---- Computed shift summary ----
  const grossCollections = shiftTxns.reduce((s, t) => s + Number(t.amount), 0)
  const byMethod = shiftTxns.reduce((acc: any, t) => {
    const m = t.payment_method ?? 'other'
    acc[m] = (acc[m] ?? 0) + Number(t.amount)
    return acc
  }, {})
  const expectedCash = (activeShift?.opening_fund ?? 0) + (byMethod['cash'] ?? 0)
  const variance = actualCash - expectedCash
  const varianceStatus = Math.abs(variance) < 0.01 ? 'balanced' : variance < 0 ? 'short' : 'over'

  function printRemittance(rem: any) {
    const win = window.open('', '_blank', 'width=420,height=700')
    if (!win) return
    win.document.write(`
<!DOCTYPE html><html><head><meta charset="utf-8"><title>Remittance ${rem.remittance_number}</title>
<style>
  body { font-family: 'Courier New', monospace; font-size: 13px; padding: 24px; max-width: 380px; margin: 0 auto; color: #111; }
  .center { text-align: center; } .title { font-size: 15px; font-weight: bold; }
  .divider { border-top: 1px dashed #999; margin: 10px 0; }
  .row { display: flex; justify-content: space-between; padding: 3px 0; }
  .bold { font-weight: bold; } .small { font-size: 11px; color: #555; }
  @media print { body { padding: 4px; } }
</style></head><body>
<div class="center"><div class="title">AquaVerde Beach Resort</div><div class="small">Remittance Report</div></div>
<div class="divider"></div>
<div class="row"><span>Remittance #</span><span>${rem.remittance_number}</span></div>
<div class="row"><span>Cashier</span><span>${rem.cashier_name}</span></div>
<div class="row"><span>Date</span><span>${new Date(rem.created_at).toLocaleDateString('en-PH')}</span></div>
<div class="row"><span>Status</span><span>${rem.status.toUpperCase()}</span></div>
<div class="divider"></div>
<div class="row"><span>Gross Collections</span><span>₱${Number(rem.gross_collections).toLocaleString()}</span></div>
<div class="row"><span>Discounts</span><span>-₱${Number(rem.total_discounts).toLocaleString()}</span></div>
<div class="row"><span>Refunds</span><span>-₱${Number(rem.total_refunds).toLocaleString()}</span></div>
<div class="row bold"><span>Net Collections</span><span>₱${Number(rem.net_collections).toLocaleString()}</span></div>
<div class="divider"></div>
<div class="row"><span>Cash</span><span>₱${Number(rem.cash_collections).toLocaleString()}</span></div>
<div class="row"><span>GCash</span><span>₱${Number(rem.gcash_collections).toLocaleString()}</span></div>
<div class="row"><span>Maya</span><span>₱${Number(rem.maya_collections).toLocaleString()}</span></div>
<div class="row"><span>Bank Transfer</span><span>₱${Number(rem.bank_transfer_collections).toLocaleString()}</span></div>
<div class="row"><span>Credit Card</span><span>₱${Number(rem.card_collections).toLocaleString()}</span></div>
<div class="divider"></div>
<div class="row"><span>Opening Fund</span><span>₱${Number(rem.opening_fund).toLocaleString()}</span></div>
<div class="row"><span>Expected Cash</span><span>₱${Number(rem.expected_cash).toLocaleString()}</span></div>
<div class="row"><span>Actual Cash</span><span>₱${Number(rem.actual_cash).toLocaleString()}</span></div>
<div class="row bold ${rem.variance > 0 ? '' : rem.variance < 0 ? '' : ''}"><span>Variance</span><span>${Number(rem.variance) >= 0 ? '+' : ''}₱${Number(rem.variance).toLocaleString()} (${rem.variance_status})</span></div>
${rem.variance_remarks ? `<div class="small" style="margin-top:4px;">Remarks: ${rem.variance_remarks}</div>` : ''}
<div class="divider"></div>
${rem.approved_by_name ? `<div class="row small"><span>Approved by</span><span>${rem.approved_by_name}</span></div>` : ''}
${rem.approved_at ? `<div class="row small"><span>Approved at</span><span>${new Date(rem.approved_at).toLocaleDateString('en-PH')}</span></div>` : ''}
<div style="margin-top:24px; display:flex; justify-content:space-between; font-size:11px;">
  <div style="text-align:center; width:45%"><div style="margin-top:24px; border-top:1px solid #000;"></div><div>Cashier Signature</div></div>
  <div style="text-align:center; width:45%"><div style="margin-top:24px; border-top:1px solid #000;"></div><div>Manager Signature</div></div>
</div>
<script>window.onload = function() { window.print(); }</script>
</body></html>`)
    win.document.close()
  }

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50 max-w-sm">
          {toast}
        </div>
      )}

      {/* Tab nav */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setTab('shift')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium ${tab === 'shift' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
          Current Shift
        </button>
        <button onClick={() => setTab('history')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium ${tab === 'history' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
          History
        </button>
        {isAdmin && (
          <button onClick={() => setTab('approve')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium ${tab === 'approve' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
            Approve {pending.length > 0 && <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5">{pending.length}</span>}
          </button>
        )}
      </div>

      {/* ===== CURRENT SHIFT ===== */}
      {tab === 'shift' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Left: shift info / open shift */}
          <div className="space-y-4">
            {!activeShift ? (
              <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
                <div className="text-sm font-medium text-gray-700">No Active Shift</div>
                <div className="text-xs text-gray-400">
                  Your shift is automatically prompted at login. If you skipped it, you can open one here.
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Shift Type</label>
                  <select value={shiftType} onChange={e => setShiftType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                    <option value="Night">Night</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Opening Fund (₱)</label>
                  <input type="number" value={openingFund} onChange={e => setOpeningFund(parseFloat(e.target.value) || 0)}
                    placeholder="Starting cash on hand"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
                </div>
                <button onClick={openShift} disabled={loading}
                  className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm rounded-lg">
                  Open Shift
                </button>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium text-gray-700">Active Shift</div>
                  <span className="text-xs bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full font-medium">Open</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Shift #</span><span className="font-medium">{activeShift.shift_number}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Cashier</span><span>{activeShift.cashier_name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Type</span><span>{activeShift.shift_type}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Opened</span><span>{new Date(activeShift.opened_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Opening Fund</span><span>₱{Number(activeShift.opening_fund).toLocaleString()}</span></div>
                </div>
              </div>
            )}

            {activeShift && !draftRemittance && (
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="text-sm font-medium text-gray-700 mb-3">End Shift</div>
                <p className="text-xs text-gray-400 mb-3">Closing your shift will generate your remittance report based on all transactions this shift.</p>
                <button onClick={closeShiftAndGenerateRemittance} disabled={loading}
                  className="w-full py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm rounded-lg">
                  Close Shift & Generate Remittance
                </button>
              </div>
            )}
          </div>

          {/* Right: transactions + cash count */}
          <div className="space-y-4">
            {activeShift && (
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="text-sm font-medium text-gray-700 mb-3">
                  Collections This Shift ({shiftTxns.length} transactions)
                </div>
                <div className="space-y-1.5 text-sm mb-3">
                  <div className="flex justify-between font-medium text-gray-700">
                    <span>Gross Collections</span>
                    <span>₱{grossCollections.toLocaleString()}</span>
                  </div>

                  {/* By transaction type */}
                  {Object.entries(
                    shiftTxns.reduce((acc: any, t) => {
                      const type = t.txn_type ?? 'other'
                      acc[type] = (acc[type] ?? 0) + Number(t.amount)
                      return acc
                    }, {})
                  ).map(([type, amount]) => (
                    <div key={type} className="flex justify-between text-xs pl-3">
                      <span className="text-gray-400 capitalize">{type.replace(/_/g, ' ')}</span>
                      <span className="text-gray-600">₱{Number(amount).toLocaleString()}</span>
                    </div>
                  ))}

                  <div className="border-t border-gray-100 pt-1.5 mt-1">
                    <div className="text-xs font-medium text-gray-500 mb-1">By Payment Method</div>
                    {Object.entries(byMethod).map(([method, amount]) => (
                      <div key={method} className="flex justify-between text-xs pl-3">
                        <span className="text-gray-400 capitalize">{method.replace(/_/g, ' ')}</span>
                        <span className="text-gray-600">₱{Number(amount).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {shiftTxns.map((t, i) => (
                    <div key={i} className="flex justify-between text-xs py-1 border-t border-gray-50">
                      <span className="text-gray-500 truncate max-w-[200px]">{t.description ?? t.txn_type}</span>
                      <span className="text-gray-700 ml-2">₱{Number(t.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {draftRemittance && (
              <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
                <div className="text-sm font-medium text-gray-700">Cash Count</div>

                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-gray-400">Opening Fund</span><span>₱{Number(draftRemittance.opening_fund).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Cash Collections</span><span>₱{Number(draftRemittance.cash_collections).toLocaleString()}</span></div>
                  <div className="flex justify-between font-medium"><span>Expected Cash</span><span>₱{expectedCash.toLocaleString()}</span></div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Actual Cash Count (₱)</label>
                  <input type="number" value={actualCash} onChange={e => setActualCash(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
                </div>

                <div className={`rounded-lg p-3 text-sm font-medium flex justify-between ${
                  varianceStatus === 'balanced' ? 'bg-green-50 text-green-700' :
                  varianceStatus === 'short'    ? 'bg-red-50 text-red-700' :
                  'bg-amber-50 text-amber-700'
                }`}>
                  <span>Variance ({varianceStatus})</span>
                  <span>{variance >= 0 ? '+' : ''}₱{variance.toLocaleString()}</span>
                </div>

                {varianceStatus !== 'balanced' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Variance Remarks (required)</label>
                    <input value={varianceRemarks} onChange={e => setVarianceRemarks(e.target.value)}
                      placeholder="e.g. Cash counting error"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
                  </div>
                )}

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
                  <input value={remittanceNotes} onChange={e => setRemittanceNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
                </div>

                <div className="flex gap-2">
                  <button onClick={saveCashCount} disabled={loading}
                    className="flex-1 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm rounded-lg">
                    Save Draft
                  </button>
                  <button onClick={submitRemittance} disabled={loading}
                    className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm rounded-lg">
                    Submit for Approval
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== HISTORY ===== */}
      {tab === 'history' && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No remittances yet.</div>
          ) : history.map(rem => (
            <div key={rem.id} className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-700">{rem.remittance_number}</div>
                  <div className="text-xs text-gray-400">{rem.cashier_name} · {new Date(rem.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[rem.status]}`}>{rem.status}</span>
                  <button onClick={() => printRemittance(rem)}
                    className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2 py-0.5 rounded">
                    Print
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="text-xs text-gray-400">Net Collections</div>
                  <div className="font-medium">₱{Number(rem.net_collections).toLocaleString()}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="text-xs text-gray-400">Variance</div>
                  <div className={`font-medium ${Number(rem.variance) === 0 ? 'text-green-600' : Number(rem.variance) < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                    {Number(rem.variance) >= 0 ? '+' : ''}₱{Number(rem.variance).toLocaleString()}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="text-xs text-gray-400">Variance Status</div>
                  <div className="font-medium capitalize">{rem.variance_status}</div>
                </div>
              </div>

              {rem.status === 'rejected' && rem.rejection_remarks && (
                <div className="mt-2 text-xs text-red-600 bg-red-50 rounded p-2">
                  Rejected: {rem.rejection_remarks}
                </div>
              )}
              {rem.approved_by_name && rem.status === 'approved' && (
                <div className="mt-2 text-xs text-green-600">Approved by {rem.approved_by_name}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ===== ADMIN: APPROVE ===== */}
      {tab === 'approve' && isAdmin && (
        <div className="space-y-4">
          {pending.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No pending remittances to review.</div>
          ) : pending.map(rem => (
            <div key={rem.id} className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-sm font-medium text-gray-700">{rem.remittance_number}</div>
                  <div className="text-xs text-gray-400">{rem.cashier_name} · Submitted {rem.submitted_at ? new Date(rem.submitted_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[rem.status]}`}>{rem.status}</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
                <div className="bg-gray-50 rounded p-2"><div className="text-xs text-gray-400">Gross</div><div className="font-medium">₱{Number(rem.gross_collections).toLocaleString()}</div></div>
                <div className="bg-gray-50 rounded p-2"><div className="text-xs text-gray-400">Net</div><div className="font-medium">₱{Number(rem.net_collections).toLocaleString()}</div></div>
                <div className="bg-gray-50 rounded p-2"><div className="text-xs text-gray-400">Expected Cash</div><div className="font-medium">₱{Number(rem.expected_cash).toLocaleString()}</div></div>
                <div className={`rounded p-2 ${Number(rem.variance) === 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="text-xs text-gray-400">Variance</div>
                  <div className={`font-medium ${Number(rem.variance) < 0 ? 'text-red-600' : Number(rem.variance) > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                    {Number(rem.variance) >= 0 ? '+' : ''}₱{Number(rem.variance).toLocaleString()} ({rem.variance_status})
                  </div>
                </div>
              </div>

              {rem.variance_remarks && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded p-2 mb-3">
                  Cashier remarks: {rem.variance_remarks}
                </div>
              )}

              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1">Rejection reason (required if rejecting)</label>
                <input value={rejectionNote} onChange={e => setRejectionNote(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>

              <div className="flex gap-2">
                <button onClick={() => approveRemittance(rem)} disabled={loading}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm rounded-lg">
                  Approve
                </button>
                <button onClick={() => rejectRemittance(rem)} disabled={loading}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm rounded-lg">
                  Reject
                </button>
                <button onClick={() => printRemittance(rem)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm rounded-lg">
                  Print
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
