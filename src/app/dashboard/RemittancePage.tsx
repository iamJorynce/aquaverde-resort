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
  const [tab, setTab]       = useState<RemittanceTab>('shift')
  const [profile, setProfile] = useState<any>(null)
  const [toast, setToast]   = useState('')
  const [loading, setLoading] = useState(false)

  // Shift states
  const [activeShift, setActiveShift]     = useState<any>(null)   // open shift
  const [closedShift, setClosedShift]     = useState<any>(null)   // recently closed shift with draft
  const [shiftTxns, setShiftTxns]         = useState<any[]>([])

  // Open shift form
  const [openingFund, setOpeningFund] = useState(0)
  const [shiftType, setShiftType]     = useState('AM')

  // Draft remittance / cash count
  const [draftRemittance, setDraftRemittance]   = useState<any>(null)
  const [actualCash, setActualCash]             = useState(0)
  const [varianceRemarks, setVarianceRemarks]   = useState('')
  const [remittanceNotes, setRemittanceNotes]   = useState('')

  // History
  const [history, setHistory] = useState<any[]>([])

  // Admin approve
  const [pending, setPending]           = useState<any[]>([])
  const [rejectionNote, setRejectionNote] = useState('')

  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'resort_owner'

  useEffect(() => { loadProfile() }, [])

  useEffect(() => {
    if (!profile) return
    if (tab === 'shift')   { loadShiftState() }
    if (tab === 'history') { loadHistory() }
    if (tab === 'approve') { loadPending() }
  }, [tab, profile])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('profiles').select('id, full_name, role').eq('id', user.id).single()
    setProfile(data)
  }

  // ---- Load all shift state ----
  async function loadShiftState() {
    if (!profile) return

    // 1. Check for open shift
    const { data: openShift } = await supabase
      .from('shifts').select('*')
      .eq('cashier_id', profile.id).eq('status', 'open')
      .order('opened_at', { ascending: false }).limit(1).maybeSingle()

    setActiveShift(openShift)

    if (openShift) {
      // Load transactions for open shift
      await loadShiftTxns(openShift.opened_at, new Date().toISOString())
    }

    // 2. Check for draft remittance (regardless of shift status)
    const { data: draft } = await supabase
      .from('remittances').select('*')
      .eq('cashier_id', profile.id).eq('status', 'draft')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    setDraftRemittance(draft)

    if (draft) {
      setActualCash(Number(draft.actual_cash) ?? 0)
      setVarianceRemarks(draft.variance_remarks ?? '')
      setRemittanceNotes(draft.notes ?? '')

      // Load the closed shift associated with this draft
      if (draft.shift_id) {
        const { data: cs } = await supabase
          .from('shifts').select('*').eq('id', draft.shift_id).single()
        setClosedShift(cs)
        if (cs && !openShift) {
          await loadShiftTxns(cs.opened_at, cs.closed_at)
        }
      }
    }
  }

  async function loadShiftTxns(start: string, end: string) {
    const [{ data: txns }, { data: dayUseTxns }] = await Promise.all([
      supabase.from('transactions').select('amount, payment_method, txn_type, description, created_at')
        .gte('created_at', start).lte('created_at', end).eq('voided', false).order('created_at'),
      supabase.from('day_use_entries').select('total_amount, payment_method, entry_number, created_at')
        .gte('created_at', start).lte('created_at', end).order('created_at'),
    ])

    const normalizedDayUse = (dayUseTxns ?? []).map((d: any) => ({
      amount: d.total_amount, payment_method: d.payment_method ?? 'cash',
      txn_type: 'day_use', description: `Day Use ${d.entry_number}`, created_at: d.created_at,
    }))

    setShiftTxns([...(txns ?? []), ...normalizedDayUse]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()))
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
      .from('remittances').select('*, shifts(shift_type, opened_at, closed_at)')
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
    const { error } = await supabase.from('shifts').insert({
      shift_number: shiftNumber, cashier_id: profile.id,
      cashier_name: profile.full_name, shift_type: shiftType, opening_fund: openingFund,
    })
    if (error) { showToast('Error: ' + error.message); setLoading(false); return }
    await logActivity(supabase, { action: 'SHIFT_OPENED', details: `${shiftNumber} — ${shiftType}, opening fund ₱${openingFund}` })
    showToast(`Shift ${shiftNumber} opened.`)
    setLoading(false)
    loadShiftState()
  }

  // ---- Close shift ----
  async function closeShift() {
    if (!activeShift) return
    setLoading(true)

    const closedAt = new Date().toISOString()
    await supabase.from('shifts').update({ status: 'closed', closed_at: closedAt }).eq('id', activeShift.id)

    // Compute collections
    const allTxns = [
      ...shiftTxns.map((t: any) => ({ amount: t.amount, payment_method: t.payment_method ?? 'other' })),
    ]
    const gross = allTxns.reduce((s, t) => s + Number(t.amount), 0)
    const byMethod = allTxns.reduce((acc: any, t) => {
      const m = t.payment_method ?? 'other'
      acc[m] = (acc[m] ?? 0) + Number(t.amount)
      return acc
    }, {})

    const remittanceNumber = `REM-${Date.now().toString().slice(-8)}`
    const { error } = await supabase.from('remittances').insert({
      remittance_number: remittanceNumber,
      shift_id: activeShift.id,
      cashier_id: profile.id,
      cashier_name: profile.full_name,
      gross_collections: gross,
      cash_collections:         byMethod['cash']          ?? 0,
      gcash_collections:        byMethod['gcash']         ?? 0,
      maya_collections:         byMethod['maya']          ?? 0,
      bank_transfer_collections: byMethod['bank_transfer'] ?? 0,
      card_collections:         byMethod['credit_card']   ?? 0,
      other_collections:        byMethod['other']         ?? 0,
      opening_fund: activeShift.opening_fund,
      actual_cash: 0,
      status: 'draft',
    })

    if (error) { showToast('Error creating remittance: ' + error.message); setLoading(false); return }

    await logActivity(supabase, { action: 'SHIFT_CLOSED', details: `${activeShift.shift_number} — gross ₱${gross.toLocaleString()}` })
    showToast('Shift closed. Please complete your cash count below.')
    setLoading(false)
    setActiveShift(null)
    loadShiftState()
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
    loadShiftState()
  }

  // ---- Submit remittance ----
  async function submitRemittance() {
    if (!draftRemittance) return
    const expected = Number(draftRemittance.opening_fund) + Number(draftRemittance.cash_collections)
    const variance = actualCash - expected
    const varianceStatus = Math.abs(variance) < 0.01 ? 'balanced' : variance < 0 ? 'short' : 'over'

    if (varianceStatus !== 'balanced' && !varianceRemarks) {
      showToast('Please enter variance remarks before submitting.'); return
    }

    setLoading(true)
    const { error } = await supabase.from('remittances').update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      actual_cash: actualCash,
      variance_status: varianceStatus,
      variance_remarks: varianceRemarks || null,
      notes: remittanceNotes || null,
    }).eq('id', draftRemittance.id)

    if (error) { showToast('Error: ' + error.message); setLoading(false); return }

    await logActivity(supabase, { action: 'REMITTANCE_SUBMITTED', details: `${draftRemittance.remittance_number}` })
    showToast('Remittance submitted for approval!')
    setLoading(false)
    setDraftRemittance(null)
    setClosedShift(null)
    loadHistory()
    setTab('history')
  }

  // ---- Approve / Reject ----
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

  // ---- Computed values ----
  const grossCollections = shiftTxns.reduce((s, t) => s + Number(t.amount), 0)
  const byMethod = shiftTxns.reduce((acc: any, t) => {
    const m = t.payment_method ?? 'other'
    acc[m] = (acc[m] ?? 0) + Number(t.amount)
    return acc
  }, {})

  const expectedCash = draftRemittance
    ? Number(draftRemittance.opening_fund) + Number(draftRemittance.cash_collections)
    : (activeShift ? Number(activeShift.opening_fund) + (byMethod['cash'] ?? 0) : 0)
  const variance = actualCash - expectedCash
  const varianceStatus = Math.abs(variance) < 0.01 ? 'balanced' : variance < 0 ? 'short' : 'over'

  // ---- Print ----
  function printRemittance(rem: any) {
    const win = window.open('', '_blank', 'width=420,height=700')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Remittance ${rem.remittance_number}</title>
<style>body{font-family:'Courier New',monospace;font-size:13px;padding:24px;max-width:380px;margin:0 auto;color:#111}
.center{text-align:center}.title{font-size:15px;font-weight:bold}.divider{border-top:1px dashed #999;margin:10px 0}
.row{display:flex;justify-content:space-between;padding:3px 0}.bold{font-weight:bold}.small{font-size:11px;color:#555}
@media print{body{padding:4px}}</style></head><body>
<div class="center"><div class="title">AquaVerde Beach Resort</div><div class="small">Remittance Report</div></div>
<div class="divider"></div>
<div class="row"><span>Remittance #</span><span>${rem.remittance_number}</span></div>
<div class="row"><span>Cashier</span><span>${rem.cashier_name}</span></div>
<div class="row"><span>Date</span><span>${new Date(rem.created_at).toLocaleDateString('en-PH')}</span></div>
<div class="row"><span>Status</span><span>${rem.status.toUpperCase()}</span></div>
<div class="divider"></div>
<div class="row"><span>Gross Collections</span><span>₱${Number(rem.gross_collections).toLocaleString()}</span></div>
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
<div class="row bold"><span>Variance (${rem.variance_status})</span><span>${Number(rem.variance) >= 0 ? '+' : ''}₱${Number(rem.variance).toLocaleString()}</span></div>
${rem.variance_remarks ? `<div class="small">Remarks: ${rem.variance_remarks}</div>` : ''}
<div class="divider"></div>
${rem.approved_by_name ? `<div class="row small"><span>Approved by</span><span>${rem.approved_by_name}</span></div>` : ''}
<div style="margin-top:32px;display:flex;justify-content:space-between;font-size:11px;">
<div style="text-align:center;width:45%"><div style="margin-top:24px;border-top:1px solid #000"></div><div>Cashier Signature</div></div>
<div style="text-align:center;width:45%"><div style="margin-top:24px;border-top:1px solid #000"></div><div>Manager Signature</div></div>
</div>
<script>window.onload=function(){window.print()}</script></body></html>`)
    win.document.close()
  }

  // ---- Render ----
  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50 max-w-sm">
          {toast}
        </div>
      )}

      {/* Tabs */}
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

      {/* ===== CURRENT SHIFT TAB ===== */}
      {tab === 'shift' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-4">

            {/* STATE 1: No open shift + no draft = Open Shift form */}
            {!activeShift && !draftRemittance && (
              <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
                <div className="text-sm font-semibold text-gray-700">Open New Shift</div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Shift Type</label>
                  <select value={shiftType} onChange={e => setShiftType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                    <option value="AM">AM Shift</option>
                    <option value="PM">PM Shift</option>
                    <option value="Night">Night Shift</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Opening Fund (₱)</label>
                  <input type="number" value={openingFund || ''} onChange={e => setOpeningFund(parseFloat(e.target.value) || 0)}
                    placeholder="Enter amount received from manager"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
                </div>
                <button onClick={openShift} disabled={loading}
                  className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm rounded-lg font-medium">
                  {loading ? 'Opening...' : 'Open Shift'}
                </button>
              </div>
            )}

            {/* STATE 2: Active open shift */}
            {activeShift && !draftRemittance && (
              <>
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-gray-700">Active Shift</div>
                    <span className="text-xs bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full font-medium">Open</span>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-gray-400">Shift #</span><span className="font-medium">{activeShift.shift_number}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Cashier</span><span>{activeShift.cashier_name}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Type</span><span>{activeShift.shift_type}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Opened</span>
                      <span>{new Date(activeShift.opened_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="flex justify-between"><span className="text-gray-400">Opening Fund</span><span>₱{Number(activeShift.opening_fund).toLocaleString()}</span></div>
                  </div>
                </div>

                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <div className="text-sm font-semibold text-gray-700 mb-2">End Shift</div>
                  <p className="text-xs text-gray-400 mb-3">
                    Closing your shift will compute all collections and generate your remittance report for cash counting.
                  </p>
                  <button onClick={closeShift} disabled={loading}
                    className="w-full py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm rounded-lg font-medium">
                    {loading ? 'Closing...' : 'Close Shift & Generate Remittance'}
                  </button>
                </div>
              </>
            )}

            {/* STATE 3: Draft remittance — cash count + submit */}
            {draftRemittance && (
              <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-700">Cash Count</div>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full font-medium">
                    {draftRemittance.remittance_number}
                  </span>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between text-gray-500"><span>Gross Collections</span><span>₱{Number(draftRemittance.gross_collections).toLocaleString()}</span></div>
                  <div className="flex justify-between text-gray-500 pl-3 text-xs">
                    <span>Cash</span><span>₱{Number(draftRemittance.cash_collections).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 pl-3 text-xs">
                    <span>GCash</span><span>₱{Number(draftRemittance.gcash_collections).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 pl-3 text-xs">
                    <span>Maya</span><span>₱{Number(draftRemittance.maya_collections).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 pl-3 text-xs">
                    <span>Bank Transfer</span><span>₱{Number(draftRemittance.bank_transfer_collections).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-medium text-gray-700 border-t border-gray-200 pt-1 mt-1">
                    <span>Opening Fund</span><span>₱{Number(draftRemittance.opening_fund).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-medium text-gray-700">
                    <span>Expected Cash</span><span>₱{expectedCash.toLocaleString()}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Actual Cash Count (₱)</label>
                  <input type="number" value={actualCash || ''} onChange={e => setActualCash(parseFloat(e.target.value) || 0)}
                    placeholder="Enter actual cash counted"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
                </div>

                {actualCash > 0 && (
                  <div className={`rounded-lg p-3 text-sm font-medium flex justify-between ${
                    varianceStatus === 'balanced' ? 'bg-green-50 text-green-700' :
                    varianceStatus === 'short'    ? 'bg-red-50 text-red-700' :
                    'bg-amber-50 text-amber-700'
                  }`}>
                    <span>Variance ({varianceStatus})</span>
                    <span>{variance >= 0 ? '+' : ''}₱{variance.toLocaleString()}</span>
                  </div>
                )}

                {varianceStatus !== 'balanced' && actualCash > 0 && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Variance Remarks (required)</label>
                    <input value={varianceRemarks} onChange={e => setVarianceRemarks(e.target.value)}
                      placeholder="e.g. Cash counting error, missing receipt..."
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
                  <button onClick={submitRemittance} disabled={loading || actualCash <= 0}
                    className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm rounded-lg font-medium">
                    {loading ? 'Submitting...' : 'Submit for Approval'}
                  </button>
                </div>

                {actualCash <= 0 && (
                  <div className="text-xs text-amber-600 text-center">Enter actual cash count before submitting.</div>
                )}
              </div>
            )}
          </div>

          {/* Right: transactions list */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-sm font-semibold text-gray-700 mb-3">
              {draftRemittance && closedShift ? `Collections — ${closedShift.shift_number}` :
               activeShift ? 'Collections This Shift' : 'No active shift'}
              <span className="text-xs text-gray-400 font-normal ml-2">({shiftTxns.length} transactions)</span>
            </div>

            {shiftTxns.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-xs">No transactions yet.</div>
            ) : (
              <>
                <div className="space-y-1.5 mb-3 text-sm">
                  <div className="flex justify-between font-medium text-gray-700">
                    <span>Gross</span><span>₱{grossCollections.toLocaleString()}</span>
                  </div>
                  {Object.entries(byMethod).map(([method, amount]) => (
                    <div key={method} className="flex justify-between text-xs pl-3 text-gray-500">
                      <span className="capitalize">{method.replace('_', ' ')}</span>
                      <span>₱{Number(amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-100 pt-3 space-y-1 max-h-64 overflow-y-auto">
                  {shiftTxns.map((t, i) => (
                    <div key={i} className="flex justify-between text-xs py-1 border-b border-gray-50">
                      <span className="text-gray-500 truncate max-w-[200px]">{t.description}</span>
                      <span className="text-gray-700 ml-2">₱{Number(t.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== HISTORY TAB ===== */}
      {tab === 'history' && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No remittances yet.</div>
          ) : history.map(rem => (
            <div key={rem.id} className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-sm font-medium text-gray-700">{rem.remittance_number}</div>
                  <div className="text-xs text-gray-400">
                    {rem.cashier_name} · {new Date(rem.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[rem.status]}`}>{rem.status}</span>
                  <button onClick={() => printRemittance(rem)}
                    className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2 py-0.5 rounded">
                    Print
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="text-xs text-gray-400">Net Collections</div>
                  <div className="font-medium">₱{Number(rem.net_collections).toLocaleString()}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="text-xs text-gray-400">Actual Cash</div>
                  <div className="font-medium">₱{Number(rem.actual_cash).toLocaleString()}</div>
                </div>
                <div className={`rounded-lg p-2 text-center ${Number(rem.variance) === 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="text-xs text-gray-400">Variance</div>
                  <div className={`font-medium ${Number(rem.variance) < 0 ? 'text-red-600' : Number(rem.variance) > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                    {Number(rem.variance) >= 0 ? '+' : ''}₱{Number(rem.variance).toLocaleString()}
                  </div>
                </div>
              </div>

              {rem.status === 'rejected' && rem.rejection_remarks && (
                <div className="mt-2 text-xs text-red-600 bg-red-50 rounded p-2">Rejected: {rem.rejection_remarks}</div>
              )}
              {rem.approved_by_name && rem.status === 'approved' && (
                <div className="mt-2 text-xs text-green-600">Approved by {rem.approved_by_name}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ===== APPROVE TAB (admin only) ===== */}
      {tab === 'approve' && isAdmin && (
        <div className="space-y-4">
          {pending.length === 0 ? (
            <div className="text-center py-12 bg-white border border-gray-100 rounded-xl text-gray-400 text-sm">
              No pending remittances to review. 🎉
            </div>
          ) : pending.map(rem => (
            <div key={rem.id} className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-sm font-medium text-gray-700">{rem.remittance_number}</div>
                  <div className="text-xs text-gray-400">
                    {rem.cashier_name} · Submitted {rem.submitted_at
                      ? new Date(rem.submitted_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </div>
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
                <label className="block text-xs text-gray-500 mb-1">Rejection reason (if rejecting)</label>
                <input value={rejectionNote} onChange={e => setRejectionNote(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>

              <div className="flex gap-2">
                <button onClick={() => approveRemittance(rem)} disabled={loading}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm rounded-lg font-medium">
                  ✓ Approve
                </button>
                <button onClick={() => rejectRemittance(rem)} disabled={loading}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm rounded-lg font-medium">
                  ✗ Reject
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
