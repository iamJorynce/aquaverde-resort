'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from './activityLog'
import { useResortSettings } from '@/hooks/useResortSettings'

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
  const { settings: resortSettings } = useResortSettings()
  const [tab, setTab]       = useState<RemittanceTab>('shift')
  const [profile, setProfile] = useState<any>(null)
  const [toast, setToast]   = useState('')
  const [loading, setLoading] = useState(false)

  // Shift states
  const [activeShift, setActiveShift]     = useState<any>(null)   // open shift
  const [closedShift, setClosedShift]     = useState<any>(null)   // recently closed shift with draft
  const [shiftTxns, setShiftTxns]         = useState<any[]>([])
  const [dayUseStats, setDayUseStats]     = useState<{ area: string; adults: number; children: number; seniors: number; pwd: number; total: number; adultRate: number; childRate: number; seniorRate: number; pwdRate: number; subtotal: number }[]>([])

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
  const [historySearch, setHistorySearch] = useState('')

  // Void transaction
  const [voidModal, setVoidModal] = useState<any>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidLoading, setVoidLoading] = useState(false)
  const [showVoidList, setShowVoidList] = useState(false)

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
    const [{ data: txns }, { data: entries }, { data: rates }] = await Promise.all([
      supabase.from('transactions')
        .select('id, amount, payment_method, txn_type, description, created_at, voided, void_reason')
        .gte('created_at', start).lte('created_at', end)
        .order('created_at'),
      // Only count day_use_entries where the linked transaction is NOT voided
      supabase.from('day_use_entries')
        .select('area, area_breakdown, num_adults, num_children, num_seniors, num_pwd, transactions!day_use_id(voided)')
        .gte('created_at', start).lte('created_at', end),
      supabase.from('day_use_rates').select('area, guest_type, rate').eq('is_active', true),
    ])

    setShiftTxns(txns ?? [])

    // Build per-area pax breakdown — skip entries where transaction is voided
    const areaMap: Record<string, { adults: number; children: number; seniors: number; pwd: number }> = {}
    for (const e of entries ?? []) {
      // Skip if the linked transaction was voided
      const entryTxns = (e as any).transactions
      const isVoided = Array.isArray(entryTxns)
        ? entryTxns.some((t: any) => t.voided)
        : entryTxns?.voided === true
      if (isVoided) continue

      const breakdown = (e as any).area_breakdown as
        { area: string; adults: number; children: number; seniors: number; pwd: number }[] | null
      const entryAreas = (e.area ?? '').split(',').map((a: string) => a.trim()).filter(Boolean)

      if (breakdown?.length) {
        // Real per-area split — each area only gets its own counts.
        for (const b of breakdown) {
          if (!areaMap[b.area]) areaMap[b.area] = { adults: 0, children: 0, seniors: 0, pwd: 0 }
          areaMap[b.area].adults   += b.adults   ?? 0
          areaMap[b.area].children += b.children ?? 0
          areaMap[b.area].seniors  += b.seniors  ?? 0
          areaMap[b.area].pwd      += b.pwd      ?? 0
        }
      } else if (entryAreas.length === 1) {
        // Older entry with no stored breakdown, but only one area involved —
        // the combined total IS that area's total, so this is still accurate.
        const area = entryAreas[0]
        if (!areaMap[area]) areaMap[area] = { adults: 0, children: 0, seniors: 0, pwd: 0 }
        areaMap[area].adults   += (e.num_adults   ?? 0)
        areaMap[area].children += (e.num_children ?? 0)
        areaMap[area].seniors  += (e.num_seniors  ?? 0)
        areaMap[area].pwd      += (e.num_pwd      ?? 0)
      }
      // else: older multi-area entry with no stored breakdown — can't be
      // split accurately, so it's intentionally left out rather than
      // double-counted. See area_breakdown backfill note.
    }
    const getRate = (area: string, type: string) =>
      (rates ?? []).find(r => r.area === area && r.guest_type === type)?.rate ?? 0

    setDayUseStats(Object.entries(areaMap).map(([area, c]) => {
      const adultRate   = getRate(area, 'adult')
      const childRate   = getRate(area, 'child')
      const seniorRate  = getRate(area, 'senior')
      const pwdRate     = getRate(area, 'pwd')
      const subtotal    = c.adults * adultRate + c.children * childRate + c.seniors * seniorRate + c.pwd * pwdRate
      return {
        area,
        adults: c.adults, children: c.children, seniors: c.seniors, pwd: c.pwd,
        total: c.adults + c.children + c.seniors + c.pwd,
        adultRate, childRate, seniorRate, pwdRate, subtotal,
      }
    }))
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

  // Just use shiftTxns state — already correctly loaded from transactions table only
  const gross = shiftTxns.filter(t => !t.voided).reduce((s, t) => s + Number(t.amount), 0)
  const byMethod = shiftTxns.filter(t => !t.voided).reduce((acc: any, t) => {
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

  // ---- Void transaction ----
  async function confirmVoid() {
    if (!voidModal || !voidReason.trim()) { showToast('Please enter a reason for voiding.'); return }
    setVoidLoading(true)

    const { error } = await supabase.from('transactions').update({
      voided: true,
      void_reason: voidReason.trim(),
      voided_at: new Date().toISOString(),
      voided_by: profile?.full_name ?? profile?.id,
    }).eq('id', voidModal.id)

    if (error) { showToast('Error: ' + error.message); setVoidLoading(false); return }

    await logActivity(supabase, {
      action: 'TRANSACTION_VOIDED',
      details: `${voidModal.description} — ₱${Number(voidModal.amount).toLocaleString()} voided. Reason: "${voidReason.trim()}"`,
    })

    showToast(`Transaction voided: ${voidModal.description}`)
    setVoidModal(null)
    setVoidReason('')
    setVoidLoading(false)

    // Reload shift transactions + day use breakdown
    const end = new Date().toISOString()
    if (activeShift) await loadShiftTxns(activeShift.opened_at, end)
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
  const grossCollections = shiftTxns.filter(t => !t.voided).reduce((s, t) => s + Number(t.amount), 0)
  const byMethod = shiftTxns.filter(t => !t.voided).reduce((acc: any, t) => {
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
  async function printRemittance(rem: any) {
    // Fetch shift time range
    const { data: shift } = await supabase
      .from('shifts').select('opened_at, closed_at, shift_type').eq('id', rem.shift_id).single()
    if (!shift) return

    // Fetch all transactions for this shift
    const [{ data: txns }, { data: entries }, { data: rates }] = await Promise.all([
      supabase.from('transactions')
        .select('amount, payment_method, txn_type, description, created_at')
        .gte('created_at', shift.opened_at).lte('created_at', shift.closed_at ?? new Date().toISOString())
        .eq('voided', false)
        .order('created_at'),
      supabase.from('day_use_entries')
        .select('area, area_breakdown, num_adults, num_children, num_seniors, num_pwd, transactions!day_use_id(voided)')
        .gte('created_at', shift.opened_at).lte('created_at', shift.closed_at ?? new Date().toISOString()),
      supabase.from('day_use_rates').select('area, guest_type, rate').eq('is_active', true),
    ])

    // Build day use pax breakdown with rates and subtotals — skip voided
    const areaMap: Record<string, { adults: number; children: number; seniors: number; pwd: number }> = {}
    for (const e of entries ?? []) {
      const entryTxns = (e as any).transactions
      const isVoided = Array.isArray(entryTxns) ? entryTxns.some((t: any) => t.voided) : entryTxns?.voided === true
      if (isVoided) continue
      const breakdown = (e as any).area_breakdown as
        { area: string; adults: number; children: number; seniors: number; pwd: number }[] | null
      const areas = (e.area ?? '').split(',').map((a: string) => a.trim()).filter(Boolean)

      if (breakdown?.length) {
        for (const b of breakdown) {
          if (!areaMap[b.area]) areaMap[b.area] = { adults: 0, children: 0, seniors: 0, pwd: 0 }
          areaMap[b.area].adults   += b.adults   ?? 0
          areaMap[b.area].children += b.children ?? 0
          areaMap[b.area].seniors  += b.seniors  ?? 0
          areaMap[b.area].pwd      += b.pwd      ?? 0
        }
      } else if (areas.length === 1) {
        const a = areas[0]
        if (!areaMap[a]) areaMap[a] = { adults: 0, children: 0, seniors: 0, pwd: 0 }
        areaMap[a].adults   += (e.num_adults   ?? 0)
        areaMap[a].children += (e.num_children ?? 0)
        areaMap[a].seniors  += (e.num_seniors  ?? 0)
        areaMap[a].pwd      += (e.num_pwd      ?? 0)
      }
    }
    const getRate = (area: string, type: string) =>
      (rates ?? []).find((r: any) => r.area === area && r.guest_type === type)?.rate ?? 0
    const areaRows = Object.entries(areaMap)
    const totalDayUsePax = areaRows.reduce((s, [, c]) => s + c.adults + c.children + c.seniors + c.pwd, 0)
    const totalDayUseAmt = areaRows.reduce((s, [area, c]) =>
      s + c.adults * getRate(area,'adult') + c.children * getRate(area,'child') +
          c.seniors * getRate(area,'senior') + c.pwd * getRate(area,'pwd'), 0)

    // Walk-in / room booking transactions
    const roomTxns = (txns ?? []).filter((t: any) => t.txn_type === 'room' || t.txn_type === 'reservation_fee')
    const roomTotal = roomTxns.reduce((s: number, t: any) => s + Number(t.amount), 0)

    // Equipment rental transactions
    const eqTxns = (txns ?? []).filter((t: any) => t.txn_type === 'equipment_rental')
    const eqTotal = eqTxns.reduce((s: number, t: any) => s + Number(t.amount), 0)

    const roomSection = roomTxns.length > 0 ? `
    <div class="divider"></div>
    <div class="bold small">WALK-IN / ROOM BOOKINGS (${roomTxns.length})</div>
    ${roomTxns.map((t: any) => {
      const time = new Date(t.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
      return `<div class="row small"><span>${time} ${t.description}</span><span>₱${Number(t.amount).toLocaleString()}</span></div>`
    }).join('')}
    <div class="row bold"><span>Total Walk-in</span><span>₱${roomTotal.toLocaleString()}</span></div>
    ` : ''

    const eqSection = eqTxns.length > 0 ? `
    <div class="divider"></div>
    <div class="bold small">EQUIPMENT RENTALS (${eqTxns.length})</div>
    ${eqTxns.map((t: any) => {
      const time = new Date(t.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
      return `<div class="row small"><span>${time} ${t.description}</span><span>₱${Number(t.amount).toLocaleString()}</span></div>`
    }).join('')}
    <div class="row bold"><span>Total Equipment</span><span>₱${eqTotal.toLocaleString()}</span></div>
    ` : ''

    const dayUseSection = areaRows.length > 0 ? `
    <div class="divider"></div>
    <div class="bold small">DAY USE BREAKDOWN</div>
    <div class="row" style="font-size:10px;color:#888"><span>Type</span><span>Pax</span><span>Rate</span><span>Amount</span></div>
    ${areaRows.map(([area, c]) => {
      const ar = getRate(area,'adult'), cr = getRate(area,'child'), sr = getRate(area,'senior'), pr = getRate(area,'pwd')
      const rows = [
        c.adults   > 0 ? `<div class="row small"><span>&nbsp;Adult</span><span>${c.adults}</span><span>₱${ar.toLocaleString()}</span><span>₱${(c.adults*ar).toLocaleString()}</span></div>`   : '',
        c.children > 0 ? `<div class="row small"><span>&nbsp;Child</span><span>${c.children}</span><span>₱${cr.toLocaleString()}</span><span>₱${(c.children*cr).toLocaleString()}</span></div>` : '',
        c.seniors  > 0 ? `<div class="row small"><span>&nbsp;Senior</span><span>${c.seniors}</span><span>₱${sr.toLocaleString()}</span><span>₱${(c.seniors*sr).toLocaleString()}</span></div>` : '',
        c.pwd      > 0 ? `<div class="row small"><span>&nbsp;PWD</span><span>${c.pwd}</span><span>₱${pr.toLocaleString()}</span><span>₱${(c.pwd*pr).toLocaleString()}</span></div>`            : '',
      ].filter(Boolean).join('')
      const total = c.adults + c.children + c.seniors + c.pwd
      const subtotal = c.adults*ar + c.children*cr + c.seniors*sr + c.pwd*pr
      return `<div class="row bold"><span>${area}</span><span>${total} pax</span><span></span><span>₱${subtotal.toLocaleString()}</span></div>${rows}`
    }).join('')}
    <div class="row bold"><span>TOTAL DAY USE</span><span>${totalDayUsePax} pax</span><span></span><span>₱${totalDayUseAmt.toLocaleString()}</span></div>
    ` : ''

    const win = window.open('', '_blank', 'width=480,height=800')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Remittance ${rem.remittance_number}</title>
<style>
  body{font-family:'Courier New',monospace;font-size:12px;padding:20px;max-width:400px;margin:0 auto;color:#111}
  .center{text-align:center}.title{font-size:15px;font-weight:bold}
  .divider{border-top:1px dashed #999;margin:8px 0}
  .row{display:flex;justify-content:space-between;padding:2px 0}
  .bold{font-weight:bold}.small{font-size:11px;color:#555}
  .section-title{font-size:11px;font-weight:bold;color:#555;margin:6px 0 2px}
  .txn-row{display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px dotted #eee;gap:4px}
  .txn-desc{flex:1;font-size:11px;color:#333;word-break:break-word}
  .txn-method{font-size:10px;color:#888;white-space:nowrap;padding:0 4px}
  .txn-amt{font-size:11px;white-space:nowrap;font-weight:bold}
  @media print{body{padding:4px}}
</style></head><body>

<div class="center">
  <div class="title">${resortSettings.resort_name}</div>
  <div class="small">Cashier Remittance Report</div>
</div>
<div class="divider"></div>
<div class="row"><span>Remittance #</span><span>${rem.remittance_number}</span></div>
<div class="row"><span>Cashier</span><span>${rem.cashier_name}</span></div>
<div class="row"><span>Shift</span><span>${shift.shift_type ?? ''} — ${new Date(shift.opened_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
<div class="row"><span>Shift In</span><span>${new Date(shift.opened_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</span></div>
<div class="row"><span>Shift Out</span><span>${shift.closed_at ? new Date(shift.closed_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
<div class="row"><span>Status</span><span>${rem.status.toUpperCase()}</span></div>

<div class="divider"></div>
<div class="section-title">COLLECTIONS SUMMARY</div>
<div class="row"><span>Gross Collections</span><span>₱${Number(rem.gross_collections).toLocaleString()}</span></div>
<div class="row bold"><span>Net Collections</span><span>₱${Number(rem.net_collections).toLocaleString()}</span></div>
<div class="divider"></div>
<div class="row"><span>Cash</span><span>₱${Number(rem.cash_collections).toLocaleString()}</span></div>
<div class="row"><span>GCash</span><span>₱${Number(rem.gcash_collections).toLocaleString()}</span></div>
<div class="row"><span>Maya</span><span>₱${Number(rem.maya_collections).toLocaleString()}</span></div>
<div class="row"><span>Bank Transfer</span><span>₱${Number(rem.bank_transfer_collections).toLocaleString()}</span></div>
<div class="row"><span>Credit Card</span><span>₱${Number(rem.card_collections).toLocaleString()}</span></div>

<div class="divider"></div>
<div class="section-title">CASH COUNT</div>
<div class="row"><span>Opening Fund</span><span>₱${Number(rem.opening_fund).toLocaleString()}</span></div>
<div class="row"><span>Expected Cash</span><span>₱${Number(rem.expected_cash).toLocaleString()}</span></div>
<div class="row"><span>Actual Cash</span><span>₱${Number(rem.actual_cash).toLocaleString()}</span></div>
<div class="row bold"><span>Variance (${rem.variance_status?.toUpperCase()})</span><span>${Number(rem.variance) >= 0 ? '+' : ''}₱${Number(rem.variance).toLocaleString()}</span></div>
${rem.variance_remarks ? `<div class="small">Remarks: ${rem.variance_remarks}</div>` : ''}

${dayUseSection}
${roomSection}
${eqSection}

<div class="divider"></div>
${rem.notes ? `<div class="small">Notes: ${rem.notes}</div><div class="divider"></div>` : ''}
${rem.approved_by_name ? `<div class="row small"><span>Approved by</span><span>${rem.approved_by_name}</span></div>` : ''}

<div style="margin-top:32px;display:flex;justify-content:space-between;font-size:11px;">
  <div style="text-align:center;width:45%">
    <div style="margin-top:28px;border-top:1px solid #000"></div>
    <div>${rem.cashier_name}</div>
    <div class="small">Cashier Signature</div>
  </div>
  <div style="text-align:center;width:45%">
    <div style="margin-top:28px;border-top:1px solid #000"></div>
    <div>Manager</div>
    <div class="small">Manager Signature</div>
  </div>
</div>

<script>window.onload=function(){window.print()}</script>
</body></html>`)
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

                {/* Day Use Breakdown */}
                {dayUseStats.length > 0 && (
                  <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    <div className="text-xs font-semibold text-blue-700 mb-2">🏖️ Day Use Pax Breakdown</div>
                    {dayUseStats.map((s, i) => (
                      <div key={i} className="mb-2">
                        <div className="text-xs font-semibold text-blue-700">{s.area}</div>
                        <div className="pl-2">
                          <div className="grid grid-cols-4 text-[10px] text-blue-400 mb-0.5">
                            <span>Type</span><span>Pax</span><span>Rate</span><span className="text-right">Amount</span>
                          </div>
                          {s.adults   > 0 && <div className="grid grid-cols-4 text-xs text-blue-600"><span>Adult</span><span>{s.adults}</span><span>₱{s.adultRate.toLocaleString()}</span><span className="text-right">₱{(s.adults * s.adultRate).toLocaleString()}</span></div>}
                          {s.children > 0 && <div className="grid grid-cols-4 text-xs text-blue-600"><span>Child</span><span>{s.children}</span><span>₱{s.childRate.toLocaleString()}</span><span className="text-right">₱{(s.children * s.childRate).toLocaleString()}</span></div>}
                          {s.seniors  > 0 && <div className="grid grid-cols-4 text-xs text-blue-600"><span>Senior</span><span>{s.seniors}</span><span>₱{s.seniorRate.toLocaleString()}</span><span className="text-right">₱{(s.seniors * s.seniorRate).toLocaleString()}</span></div>}
                          {s.pwd      > 0 && <div className="grid grid-cols-4 text-xs text-blue-600"><span>PWD</span><span>{s.pwd}</span><span>₱{s.pwdRate.toLocaleString()}</span><span className="text-right">₱{(s.pwd * s.pwdRate).toLocaleString()}</span></div>}
                          <div className="flex justify-between text-xs font-semibold text-blue-700 border-t border-blue-200 pt-0.5 mt-0.5">
                            <span>{s.total} pax</span>
                            <span>₱{s.subtotal.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs pt-1 mt-1 border-t border-blue-300 font-bold text-blue-800">
                      <span>Total Day Use — {dayUseStats.reduce((s, a) => s + a.total, 0)} pax</span>
                      <span>₱{dayUseStats.reduce((s, a) => s + a.subtotal, 0).toLocaleString()}</span>
                    </div>
                  </div>
                )}

                {/* Walk-in / Room Bookings Breakdown */}
                {(() => {
                  const roomTxns = shiftTxns.filter(t => !t.voided && (t.txn_type === 'room' || t.txn_type === 'reservation_fee'))
                  if (roomTxns.length === 0) return null
                  const total = roomTxns.reduce((s, t) => s + Number(t.amount), 0)
                  return (
                    <div className="mb-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <div className="text-xs font-semibold text-green-700 mb-2">🏠 Walk-in / Room Bookings</div>
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {roomTxns.map((t, i) => (
                          <div key={i} className="flex justify-between text-xs text-green-700">
                            <span className="truncate pr-2">{t.description}</span>
                            <span className="shrink-0 font-medium">₱{Number(t.amount).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between text-xs font-bold text-green-800 border-t border-green-300 pt-1 mt-1">
                        <span>Total — {roomTxns.length} booking(s)</span>
                        <span>₱{total.toLocaleString()}</span>
                      </div>
                    </div>
                  )
                })()}

                {/* Equipment Rental Breakdown */}
                {(() => {
                  const eqTxns = shiftTxns.filter(t => !t.voided && t.txn_type === 'equipment_rental')
                  if (eqTxns.length === 0) return null
                  const total = eqTxns.reduce((s, t) => s + Number(t.amount), 0)
                  return (
                    <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <div className="text-xs font-semibold text-amber-700 mb-2">🏄 Equipment Rentals</div>
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {eqTxns.map((t, i) => (
                          <div key={i} className="flex justify-between text-xs text-amber-700">
                            <span className="truncate pr-2">{t.description}</span>
                            <span className="shrink-0 font-medium">₱{Number(t.amount).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between text-xs font-bold text-amber-800 border-t border-amber-300 pt-1 mt-1">
                        <span>Total — {eqTxns.length} rental(s)</span>
                        <span>₱{total.toLocaleString()}</span>
                      </div>
                    </div>
                  )
                })()}

                {/* Void button */}
                <button
                  onClick={() => setShowVoidList(!showVoidList)}
                  className="w-full mt-2 py-1.5 border border-red-200 text-red-500 hover:bg-red-50 text-xs rounded-lg"
                >
                  🚫 Void a Transaction ({shiftTxns.filter(t => !t.voided).length} active)
                </button>

                {showVoidList && (
                  <div className="mt-2 border border-gray-100 rounded-lg max-h-48 overflow-y-auto">
                    {shiftTxns.filter(t => !t.voided).map((t, i) => (
                      <div key={i} className="flex items-center justify-between text-xs px-3 py-2 border-b border-gray-50 gap-2">
                        <span className="text-gray-600 break-words flex-1">{t.description}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-gray-700">₱{Number(t.amount).toLocaleString()}</span>
                          <button
                            onClick={() => { setVoidModal(t); setVoidReason(''); setShowVoidList(false) }}
                            className="text-[10px] px-1.5 py-0.5 border border-red-200 text-red-500 hover:bg-red-50 rounded"
                          >
                            Void
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== HISTORY TAB ===== */}
      {tab === 'history' && (
        <div className="space-y-3">
          <div className="relative mb-1 max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              placeholder="Search remittance #, cashier, status..."
              className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
            />
            {historySearch && (
              <button onClick={() => setHistorySearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                ✕
              </button>
            )}
          </div>
          {(() => {
            const hq = historySearch.trim().toLowerCase()
            const filteredHistory = history.filter(rem =>
              !hq || [rem.remittance_number, rem.cashier_name, rem.status]
                .some(v => v && String(v).toLowerCase().includes(hq))
            )
            return filteredHistory.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                {hq ? 'No remittances match your search.' : 'No remittances yet.'}
              </div>
            ) : filteredHistory.map(rem => (
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
            ))
          })()}
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
      {/* ===== VOID MODAL ===== */}
      {voidModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-sm space-y-4 shadow-xl">
            <div className="text-sm font-semibold text-gray-800">🚫 Void Transaction</div>

            <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <div className="text-xs text-gray-500">Transaction</div>
              <div className="text-sm font-medium text-gray-800 break-words">{voidModal.description}</div>
              <div className="text-sm font-bold text-red-600 mt-0.5">₱{Number(voidModal.amount).toLocaleString()}</div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Reason for voiding <span className="text-red-500">*</span>
              </label>
              <textarea
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                placeholder="e.g. Wrong amount entered, duplicate entry, customer cancelled..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none bg-white"
                autoFocus
              />
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              ⚠️ This action cannot be undone. The transaction will be marked as voided and excluded from the remittance total.
            </div>

            <div className="flex gap-2">
              <button
                onClick={confirmVoid}
                disabled={voidLoading || !voidReason.trim()}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm rounded-lg font-medium"
              >
                {voidLoading ? 'Voiding...' : 'Confirm Void'}
              </button>
              <button
                onClick={() => { setVoidModal(null); setVoidReason('') }}
                className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
