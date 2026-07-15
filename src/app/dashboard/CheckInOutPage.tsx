'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { printReceipt } from './receipt'
import { isPaymentValid, paymentValidationMessage } from './PaymentCalculator'
import PaymentCalculator from './PaymentCalculator'
import { createOrUpdateInvoice } from './invoiceUtils'

export default function CheckInOutPage() {
  const supabase = createClient()
  const [damagePaymentModal, setDamagePaymentModal] = useState<{ 
  finalBooking: any; damageTotal: number; allCottageIds: string[] 
} | null>(null)
const [damagePaymentMethod, setDamagePaymentMethod] = useState('cash')
const [damagePaymentAmount, setDamagePaymentAmount] = useState(0)
  const [tab, setTab] = useState<'in' | 'active' | 'out' | 'dayuse'>('in')
  const [pendingCheckins, setPendingCheckins]   = useState<any[]>([])
  const [activeStays, setActiveStays]           = useState<any[]>([])
  const [pendingCheckouts, setPendingCheckouts] = useState<any[]>([])
  const [activeDayUse, setActiveDayUse]         = useState<any[]>([])
  const [loading, setLoading]                   = useState(true)
  const [toast, setToast]                       = useState('')

  // Bill detail modal (view-only)
  const [billDetail, setBillDetail]   = useState<{ booking: any; addons: any[] } | null>(null)

  // Checkout payment modal
  const [checkoutModal, setCheckoutModal]         = useState<{ booking: any; addons: any[] } | null>(null)
  const [checkoutAmount, setCheckoutAmount]       = useState(0)
  const [checkoutMethod, setCheckoutMethod]       = useState('cash')
  const [processingCheckout, setProcessingCheckout] = useState(false)

  // Equipment damage check modal
  const [equipmentCheckModal, setEquipmentCheckModal] = useState<any[]>([])
  const [equipmentConditions, setEquipmentConditions] = useState<Record<string, {
    condition: 'good' | 'damaged'; notes: string; charge: number
  }>>({})
  const [pendingCheckoutBooking, setPendingCheckoutBooking] = useState<any>(null)

  // ---- Load ----
  async function load() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)

    const [{ data: checkins }, { data: active }, { data: checkouts }, { data: dayUse }] = await Promise.all([
      // Pending check-ins (reserved/confirmed, due today or earlier)
      supabase.from('bookings')
        .select('*, guests(full_name, phone), rooms(room_number), cottages(name, cottage_code)')
        .in('status', ['pending', 'confirmed', 'reserved'])
        .lte('check_in_date', today)
        .not('accommodation_type', 'eq', 'day_use'),

      // Active overnight stays only — NOT day_use
      supabase.from('bookings')
        
        .select('*, guests(full_name, phone), rooms(room_number, id), cottages(name, cottage_code, id), cottage_ids')
        .eq('status', 'checked_in')
        .not('accommodation_type', 'eq', 'day_use')
        .order('check_out_date'),

      // Due for check-out today (overnight only)
      supabase.from('bookings')
        .select('*, guests(full_name, phone), rooms(room_number, id), cottages(name, cottage_code, id), cottage_ids')
        .eq('status', 'checked_in')
        .not('accommodation_type', 'eq', 'day_use')
        .lte('check_out_date', today),

      // Day use ONLY — currently checked in
      supabase.from('bookings')
        .select('id, booking_number, special_requests, created_at, check_in_date, num_adults, num_children, num_seniors, num_pwd, cottage_id, cottage_ids')
        .eq('accommodation_type', 'day_use')
        .eq('status', 'checked_in')
        .order('created_at', { ascending: false }),
    ])

    // Fetch active equipment rentals per day use booking
    const dayUseWithEquipment = await Promise.all(
      (dayUse ?? []).map(async (b: any) => {
        const { data: rentals } = await supabase
          .from('equipment_rentals')
          .select('id, equipment_id, quantity, rental_start, equipment(name)')
          .eq('booking_id', b.id)
          .is('rental_end', null)
        return { ...b, rentals: rentals ?? [] }
      })
    )

    setPendingCheckins(checkins ?? [])
    setActiveStays(active ?? [])
    setPendingCheckouts(checkouts ?? [])
    setActiveDayUse(dayUseWithEquipment)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 4000) }

  // ---- Check-in ----
  async function handleCheckIn(booking: any) {
    const wristband = `WB-${Date.now().toString().slice(-6)}`
    const { error } = await supabase.from('bookings').update({
      status: 'checked_in',
      actual_check_in: new Date().toISOString(),
      wristband_number: wristband,
    }).eq('id', booking.id)
    if (error) { showToast('Error: ' + error.message); return }
    if (booking.room_id) await supabase.from('rooms').update({ status: 'occupied' }).eq('id', booking.room_id)
    if (booking.cottage_id) await supabase.from('cottages').update({ status: 'occupied' }).eq('id', booking.cottage_id)
    showToast(`${(booking.guests as any)?.full_name} checked in! Wristband: ${wristband}`)
    load()
  }

  // ---- View bill ----
  async function viewBill(booking: any) {
    const { data: addons } = await supabase
      .from('booking_addons').select('*').eq('booking_id', booking.id).order('created_at')
    setBillDetail({ booking, addons: addons ?? [] })
  }

  // ---- Open checkout modal (checks for equipment first) ----
  async function openCheckoutModal(booking: any) {
    const balance = Math.max(0, booking.total_amount - booking.amount_paid)
    const [{ data: addons }, { data: rentals }] = await Promise.all([
      supabase.from('booking_addons').select('*').eq('booking_id', booking.id).order('created_at'),
      supabase.from('equipment_rentals')
        .select('id, equipment_id, quantity, equipment(name)')
        .eq('booking_id', booking.id)
        .is('rental_end', null),
    ])

    if (rentals && rentals.length > 0) {
      setEquipmentCheckModal(rentals)
      setEquipmentConditions(Object.fromEntries(
        rentals.map((r: any) => [r.id, { condition: 'good', notes: '', charge: 0 }])
      ))
      setPendingCheckoutBooking({ booking, addons: addons ?? [], balance })
    } else {
      setCheckoutModal({ booking, addons: addons ?? [] })
      setCheckoutAmount(balance)
      setCheckoutMethod('cash')
    }
  }

  // ---- Confirm equipment check (handles both overnight and day use) ----
  async function confirmEquipmentCheck() {
    if (!pendingCheckoutBooking) return
    const returnedAt = new Date().toISOString()

    for (const rental of equipmentCheckModal) {
      const cond = equipmentConditions[rental.id]
      await supabase.from('equipment_rentals').update({
        rental_end: returnedAt,
        returned_at: returnedAt,
        status: cond?.condition === 'damaged' ? 'damaged' : 'returned',
        condition_notes: cond?.notes || null,
        damage_charge: cond?.charge ?? 0,
      }).eq('id', rental.id)

      const { data: eq } = await supabase.from('equipment').select('available_qty, under_repair_qty').eq('id', rental.equipment_id).single()
if (eq) {
  if (cond?.condition === 'damaged') {
    // Damaged items go to under_repair_qty, NOT back into available pool
    await supabase.from('equipment').update({
      under_repair_qty: (eq.under_repair_qty ?? 0) + rental.quantity,
    }).eq('id', rental.equipment_id)
  } else {
    // Good condition — back to available pool as normal
    await supabase.from('equipment').update({
      available_qty: eq.available_qty + rental.quantity,
    }).eq('id', rental.equipment_id)
  }
}

      if (cond?.condition === 'damaged' && cond.charge > 0) {
        await supabase.from('booking_addons').insert({
          booking_id: pendingCheckoutBooking.booking.id,
          name: `Damage charge — ${(rental.equipment as any)?.name}`,
          quantity: 1,
          unit_price: cond.charge,
        })
        await supabase.from('bookings').update({
          total_amount: Number(pendingCheckoutBooking.booking.total_amount) + cond.charge,
          extras_total: Number(pendingCheckoutBooking.booking.extras_total ?? 0) + cond.charge,
        }).eq('id', pendingCheckoutBooking.booking.id)
      }
    }

    const { data: updatedBooking } = await supabase
      .from('bookings')
      .select('*, guests(full_name, phone), rooms(room_number, id), cottages(name, cottage_code, id)')
      .eq('id', pendingCheckoutBooking.booking.id)
      .single()

    const finalBooking = updatedBooking ?? pendingCheckoutBooking.booking
    const damageTotal = Object.values(equipmentConditions).reduce((s, c) => s + (c.charge ?? 0), 0)

    setEquipmentCheckModal([])
    setPendingCheckoutBooking(null)

    // Day use: go straight to checked_out after equipment return
   // Day use: check if there's damage to collect payment for
if (finalBooking.accommodation_type === 'day_use') {
  const allCottageIds = finalBooking.cottage_ids?.length
    ? finalBooking.cottage_ids
    : (finalBooking.cottage_id ? [finalBooking.cottage_id] : [])

  const damageTotal = Object.values(equipmentConditions)
    .reduce((s, c) => s + (c.charge ?? 0), 0)

  if (damageTotal > 0) {
    // Show payment modal BEFORE finalizing checkout
    setDamagePaymentModal({
      finalBooking,
      damageTotal,
      allCottageIds,
    })

    setDamagePaymentAmount(damageTotal)
    setDamagePaymentMethod('cash')
    return
  }

  // No damage — proceed straight to checkout
  await finalizeDayUseCheckout(
    finalBooking,
    allCottageIds,
    0,
    null
  )

  return
}

 

    // Overnight: proceed to payment modal
    const { data: updatedAddons } = await supabase.from('booking_addons').select('*').eq('booking_id', finalBooking.id).order('created_at')
    setCheckoutModal({ booking: finalBooking, addons: updatedAddons ?? [] })
    setCheckoutAmount(Math.max(0, finalBooking.total_amount - finalBooking.amount_paid))
    setCheckoutMethod('cash')
  }
async function finalizeDayUseCheckout(
  finalBooking: any, 
  allCottageIds: string[], 
  damageAmount: number, 
  paymentMethod: string | null
) {
  await supabase.from('bookings').update({
    status: 'checked_out',
    actual_check_out: new Date().toISOString(),
  }).eq('id', finalBooking.id)

  // Cottage cleanup
  for (const cottageId of allCottageIds) {
    await supabase.from('cottages').update({ status: 'cleaning' }).eq('id', cottageId)
    const { data: existingTask } = await supabase
      .from('housekeeping_tasks').select('id')
      .eq('cottage_id', cottageId).in('status', ['pending', 'in_progress']).maybeSingle()
    if (!existingTask) {
      await supabase.from('housekeeping_tasks').insert({
        task_number: `HK-${Date.now()}-${cottageId.slice(0, 4)}`,
        cottage_id: cottageId, task_type: 'checkout_cleaning',
        priority: 'high', status: 'pending',
        notes: `Day use checkout — ${finalBooking.booking_number}`,
      })
    }
  }

  // Record damage payment if applicable
  if (damageAmount > 0 && paymentMethod) {
    await supabase.from('transactions').insert({
      txn_number: `TXN-${Date.now()}`,
      booking_id: finalBooking.id,
      txn_type: 'room',
      description: `Damage charge payment — ${finalBooking.booking_number}`,
      amount: damageAmount,
      payment_method: paymentMethod,
    })
  }

  showToast(`Equipment returned.${damageAmount > 0 ? ` ₱${damageAmount.toLocaleString()} damage payment collected.` : ' All items in good condition.'}${allCottageIds.length > 0 ? ` ${allCottageIds.length} cottage(s) set to cleaning.` : ''}`)
  load()
}

async function confirmDamagePayment() {
  if (!damagePaymentModal) return
  const { finalBooking, damageTotal, allCottageIds } = damagePaymentModal
  await finalizeDayUseCheckout(finalBooking, allCottageIds, damageTotal, damagePaymentMethod)
  setDamagePaymentModal(null)
}
  // ---- Confirm checkout (overnight) ----
  async function confirmCheckout() {
    if (!checkoutModal) return
    const { booking, addons } = checkoutModal
    setProcessingCheckout(true)

    const newAmountPaid = Number(booking.amount_paid) + Number(checkoutAmount)
    const remainingBalance = Math.max(0, booking.total_amount - newAmountPaid)

    const { error } = await supabase.from('bookings').update({
      status: 'checked_out',
      actual_check_out: new Date().toISOString(),
      amount_paid: newAmountPaid,
      payment_status: remainingBalance > 0 ? 'partial' : 'paid',
    }).eq('id', booking.id)

    if (error) { showToast('Error: ' + error.message); setProcessingCheckout(false); return }

if (booking.room_id) {
  await supabase.from('rooms').update({ status: 'cleaning' }).eq('id', booking.room_id)
  const { data: existingRoomTask } = await supabase
    .from('housekeeping_tasks')
    .select('id')
    .eq('room_id', booking.room_id)
    .in('status', ['pending', 'in_progress'])
    .maybeSingle()
  if (!existingRoomTask) {
    await supabase.from('housekeeping_tasks').insert({
      task_number: `HK-${Date.now()}`,
      room_id: booking.room_id,
      task_type: 'checkout_cleaning',
      priority: 'high',
      status: 'pending',
      notes: `Checkout cleaning — ${booking.booking_number}`,
    })
  }
}

// Handle ALL cottages (not just cottage_id)
const allCottageIds = booking.cottage_ids?.length 
  ? booking.cottage_ids 
  : (booking.cottage_id ? [booking.cottage_id] : [])

for (const cottageId of allCottageIds) {
  await supabase.from('cottages').update({ status: 'cleaning' }).eq('id', cottageId)
  
  const { data: existingTask } = await supabase
    .from('housekeeping_tasks')
    .select('id')
    .eq('cottage_id', cottageId)
    .in('status', ['pending', 'in_progress'])
    .maybeSingle()

  if (!existingTask) {
    await supabase.from('housekeeping_tasks').insert({
      task_number: `HK-${Date.now()}-${cottageId.slice(0, 4)}`,
      cottage_id: cottageId,
      task_type: 'checkout_cleaning',
      priority: 'high',
      status: 'pending',
      notes: `Checkout cleaning — ${booking.booking_number}`,
    })
  }
}

    if (checkoutAmount > 0) {
      await supabase.from('transactions').insert({
        txn_number: `TXN-${Date.now()}`,
        booking_id: booking.id,
        guest_id: booking.guest_id,
        txn_type: 'room',
        description: `Payment at check-out — ${booking.booking_number}`,
        amount: checkoutAmount,
        payment_method: checkoutMethod,
      })
    }

    try {
      await createOrUpdateInvoice(supabase, {
        booking_id: booking.id,
        guest_id: booking.guest_id,
        subtotal: Number(booking.subtotal),
        total: Number(booking.total_amount),
        amount_paid: newAmountPaid,
        notes: remainingBalance > 0 ? `Partial payment at check-out. Balance: ₱${remainingBalance.toLocaleString()}` : 'Fully settled at check-out.',
      })
    } catch (_) {}

    const guestName  = (booking.guests as any)?.full_name ?? 'Guest'
    const roomLabel  = booking.rooms ? `Room ${(booking.rooms as any).room_number}` : (booking.cottages as any)?.name ?? 'Accommodation'
    const addonLines = (addons ?? []).map((a: any) => ({
      label: a.name, qty: a.quantity > 1 ? a.quantity : undefined,
      amount: Number(a.total_price ?? a.unit_price * a.quantity),
    }))

    printReceipt({
      title: 'AquaVerde Beach Resort',
      receiptNumber: booking.booking_number,
      receiptType: 'Check-out Receipt',
      date: new Date().toLocaleDateString('en-PH', { dateStyle: 'medium' }),
      guestName,
      lineItems: [{ label: roomLabel, amount: Number(booking.subtotal) }, ...addonLines],
      total: booking.total_amount,
      amountPaid: newAmountPaid,
      balance: remainingBalance,
      paymentMethod: checkoutMethod,
      footerNote: remainingBalance > 0 ? "Balance remains on this guest's account." : 'Thank you for staying with us!',
    })

    showToast(remainingBalance > 0
      ? `${guestName} checked out with ₱${remainingBalance.toLocaleString()} balance remaining.`
      : `${guestName} checked out! Room set to cleaning.`)

    setCheckoutModal(null)
    setProcessingCheckout(false)
    load()
  }

  // ---- Day use direct checkout (no equipment) ----
  async function checkOutDayUse(b: any) {
  const pax = (b.num_adults ?? 0) + (b.num_children ?? 0) + (b.num_seniors ?? 0) + (b.num_pwd ?? 0)

  await supabase.from('bookings').update({
    status: 'checked_out',
    actual_check_out: new Date().toISOString(),
  }).eq('id', b.id)

  // Set cottage to cleaning + create housekeeping task
const allCottageIds = b.cottage_ids?.length
  ? b.cottage_ids
  : (b.cottage_id ? [b.cottage_id] : [])

for (const cottageId of allCottageIds) {
  await supabase.from('cottages').update({ status: 'cleaning' }).eq('id', cottageId)
  
  const { data: existingTask } = await supabase
    .from('housekeeping_tasks')
    .select('id')
    .eq('cottage_id', cottageId)
    .in('status', ['pending', 'in_progress'])
    .maybeSingle()

  if (!existingTask) {
    await supabase.from('housekeeping_tasks').insert({
      task_number: `HK-${Date.now()}-${cottageId.slice(0, 4)}`,
      cottage_id: cottageId,
      task_type: 'checkout_cleaning',
      priority: 'high',
      status: 'pending',
      notes: `Day use checkout — ${b.booking_number}`,
    })
  }
}

  showToast(`Day use guest checked out. ${pax} pax departed.`)
  load()
}

  // ---- Booking status color ----
  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700', confirmed: 'bg-blue-100 text-blue-700',
    reserved: 'bg-purple-100 text-purple-700', checked_in: 'bg-green-100 text-green-700',
    checked_out: 'bg-gray-100 text-gray-600', cancelled: 'bg-red-100 text-red-700',
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
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4 w-fit flex-wrap">
        {([
          { id: 'in',      label: `Check-In (${pendingCheckins.length})` },
          { id: 'active',  label: `Active Stays (${activeStays.length})` },
          { id: 'out',     label: `Due for Check-Out (${pendingCheckouts.length})` },
          { id: 'dayuse',  label: `Day Use (${activeDayUse.length})` },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : (
        <>
          {/* ===== CHECK-IN TAB ===== */}
          {tab === 'in' && (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5">Booking #</th>
                    <th className="text-left px-4 py-2.5">Guest</th>
                    <th className="text-left px-4 py-2.5">Room/Cottage</th>
                    <th className="text-left px-4 py-2.5">Check-in</th>
                    <th className="text-left px-4 py-2.5">Check-out</th>
                    <th className="text-left px-4 py-2.5">Status</th>
                    <th className="text-left px-4 py-2.5">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingCheckins.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-xs">No pending check-ins.</td></tr>
                  ) : pendingCheckins.map(b => (
                    <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-blue-700">{b.booking_number}</td>
                      <td className="px-4 py-2.5">{(b.guests as any)?.full_name}</td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {b.rooms ? `Room ${(b.rooms as any).room_number}` : (b.cottages as any)?.name ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{b.check_in_date}</td>
                      <td className="px-4 py-2.5 text-gray-500">{b.check_out_date}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[b.status] ?? ''}`}>{b.status}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => handleCheckIn(b)}
                          className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg">
                          Check In
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ===== ACTIVE STAYS TAB ===== */}
          {tab === 'active' && (
            <div className="space-y-3">
              {activeStays.length > 0 && (() => {
                const totalAdults   = activeStays.reduce((s, b) => s + (b.num_adults ?? 0), 0)
                const totalChildren = activeStays.reduce((s, b) => s + (b.num_children ?? 0), 0)
                return (
                  <div className="bg-green-50 border border-green-100 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-green-700">Overnight Guests In Resort</div>
                      <div className="text-xs text-green-500 mt-0.5">
                        {totalAdults > 0 && `${totalAdults} adult${totalAdults > 1 ? 's' : ''}`}
                        {totalChildren > 0 && ` · ${totalChildren} child${totalChildren > 1 ? 'ren' : ''}`}
                        {' · '}{activeStays.length} booking{activeStays.length > 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-green-700">{totalAdults + totalChildren} pax</div>
                  </div>
                )
              })()}
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5">Booking #</th>
                      <th className="text-left px-4 py-2.5">Guest</th>
                      <th className="text-left px-4 py-2.5">Pax</th>
                      <th className="text-left px-4 py-2.5">Room/Cottage</th>
                      <th className="text-left px-4 py-2.5">Check-in</th>
                      <th className="text-left px-4 py-2.5">Check-out</th>
                      <th className="text-left px-4 py-2.5">Wristband</th>
                      <th className="text-left px-4 py-2.5">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeStays.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-xs">No guests currently checked in.</td></tr>
                    ) : activeStays.map(b => (
                      <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-blue-700">{b.booking_number}</td>

                        <td className="px-4 py-2.5">{(b.guests as any)?.full_name}</td>

                        <td className="px-4 py-2.5">
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                            {(b.num_adults ?? 0) + (b.num_children ?? 0)} pax
                          </span>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {b.num_adults > 0 && `${b.num_adults}A`}{b.num_children > 0 && ` ${b.num_children}C`}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">
                           {b.rooms? `Room ${(b.rooms as any).room_number}`: (b.cottages as any)?.name}</td>
                        <td className="px-4 py-2.5 text-gray-500">{b.check_in_date}</td>
                        <td className="px-4 py-2.5 text-gray-500">{b.check_out_date}</td>
                        <td className="px-4 py-2.5 text-gray-500">{b.wristband_number ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => viewBill(b)}
                            className="px-3 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs rounded-lg mr-1">
                            View Bill
                          </button>
                          <button onClick={() => openCheckoutModal(b)}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg">
                            Check Out
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== DUE FOR CHECK-OUT TAB ===== */}
          {tab === 'out' && (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5">Booking #</th>
                    <th className="text-left px-4 py-2.5">Guest</th>
                    <th className="text-left px-4 py-2.5">Room/Cottage</th>
                    <th className="text-left px-4 py-2.5">Check-out</th>
                    <th className="text-right px-4 py-2.5">Balance</th>
                    <th className="text-left px-4 py-2.5">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingCheckouts.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-xs">No guests due for check-out today.</td></tr>
                  ) : pendingCheckouts.map(b => {
                    const balance = Math.max(0, b.total_amount - b.amount_paid)
                    return (
                      <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-blue-700">{b.booking_number}</td>
                        <td className="px-4 py-2.5">{(b.guests as any)?.full_name}</td>
                        <td className="px-4 py-2.5 text-gray-500">
                          {b.rooms ? `Room ${(b.rooms as any).room_number}` : (b.cottages as any)?.name}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{b.check_out_date}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={balance > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                            ₱{balance.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => viewBill(b)}
                            className="px-3 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs rounded-lg mr-1">
                            View Bill
                          </button>
                          <button onClick={() => openCheckoutModal(b)}
                            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg">
                            Check Out
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ===== DAY USE TAB ===== */}
          {tab === 'dayuse' && (
            <div>
              {/* Headcount banner */}
              {activeDayUse.length > 0 && (() => {
                const tA = activeDayUse.reduce((s, b) => s + (b.num_adults   ?? 0), 0)
                const tC = activeDayUse.reduce((s, b) => s + (b.num_children ?? 0), 0)
                const tS = activeDayUse.reduce((s, b) => s + (b.num_seniors  ?? 0), 0)
                const tP = activeDayUse.reduce((s, b) => s + (b.num_pwd      ?? 0), 0)
                const total = tA + tC + tS + tP
                return (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="text-sm font-semibold text-blue-700">Day Use Guests Currently In Resort</div>
                      <div className="text-xs text-blue-500 mt-0.5">
                        {tA > 0 && `${tA} adult${tA > 1 ? 's' : ''}`}
                        {tC > 0 && ` · ${tC} child${tC > 1 ? 'ren' : ''}`}
                        {tS > 0 && ` · ${tS} senior${tS > 1 ? 's' : ''}`}
                        {tP > 0 && ` · ${tP} PWD`}
                        {' · '}{activeDayUse.length} group{activeDayUse.length > 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-blue-700">{total} pax</div>
                  </div>
                )
              })()}

              {activeDayUse.length === 0 ? (
                <div className="text-center py-12 bg-white border border-gray-100 rounded-xl text-gray-400 text-sm">
                  No active day use guests right now.
                </div>
              ) : (
                <div className="space-y-3">
                  {activeDayUse.map(b => {
                    const pax       = (b.num_adults ?? 0) + (b.num_children ?? 0) + (b.num_seniors ?? 0) + (b.num_pwd ?? 0)
                    const guestName = b.special_requests?.replace('Day Use Guest: ', '').split('\n')[0] || b.booking_number
                    const hasUnreturnedEquipment = b.rentals.length > 0

                    return (
                      <div key={b.id} className="bg-white border border-gray-100 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="text-sm font-medium text-gray-700">{guestName}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {b.booking_number} · Entered {new Date(b.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <div className="text-sm font-semibold text-blue-700">{pax} pax</div>
                            <div className="text-xs text-gray-400">
                              {b.num_adults > 0 && `${b.num_adults}A`}
                              {b.num_children > 0 && ` ${b.num_children}C`}
                              {b.num_seniors > 0 && ` ${b.num_seniors}Sr`}
                              {b.num_pwd > 0 && ` ${b.num_pwd}P`}
                            </div>
                          </div>
                        </div>
                

                        {/* Unreturned equipment */}
                        {hasUnreturnedEquipment && (
                          <div className="space-y-1.5 mb-3">
                            {b.rentals.map((r: any) => (
                              <div key={r.id} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs">
                                <span className="text-amber-700">⚠ {(r.equipment as any)?.name} × {r.quantity} — not yet returned</span>
                                <span className="text-amber-500">
                                  Since {new Date(r.rental_start).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            ))}
                            <button
                              onClick={() => {
                                setEquipmentCheckModal(b.rentals)
                                setEquipmentConditions(Object.fromEntries(
                                  b.rentals.map((r: any) => [r.id, { condition: 'good', notes: '', charge: 0 }])
                                ))
                                setPendingCheckoutBooking({ booking: b, addons: [], balance: 0 })
                              }}
                              className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg font-medium">
                              Return Equipment First ({b.rentals.length} item{b.rentals.length > 1 ? 's' : ''})
                            </button>

                            
                            </div>
                        )}

                        {!hasUnreturnedEquipment && (
                          <div className="text-xs text-green-600 mb-3">✓ No unreturned equipment</div>
                        )}

                        <button
                          disabled={hasUnreturnedEquipment}
                          onClick={() => checkOutDayUse(b)}
                          className="w-full py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm rounded-lg font-medium">
                          {hasUnreturnedEquipment ? 'Return equipment before check-out' : `Check Out (${pax} pax)`}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ===== BILL DETAIL MODAL ===== */}
      {billDetail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setBillDetail(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-0.5">{billDetail.booking.booking_number}</div>
            <div className="text-xs text-gray-400 mb-3">{(billDetail.booking.guests as any)?.full_name}</div>
            <div className="text-sm space-y-1.5 bg-gray-50 rounded-lg p-3 mb-4">
              <div className="flex justify-between text-gray-600">
                <span>{billDetail.booking.rooms ? `Room ${(billDetail.booking.rooms as any).room_number}` : (billDetail.booking.cottages as any)?.name}</span>
                <span>₱{Number(billDetail.booking.subtotal).toLocaleString()}</span>
              </div>
              {billDetail.addons.map((a: any) => (
                <div key={a.id} className="flex justify-between text-gray-600">
                  <span>{a.name}{a.quantity > 1 ? ` × ${a.quantity}` : ''}</span>
                  <span>₱{Number(a.total_price ?? a.unit_price * a.quantity).toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-200 pt-1.5">
                <span>Total</span><span>₱{Number(billDetail.booking.total_amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>Paid</span><span>₱{Number(billDetail.booking.amount_paid).toLocaleString()}</span>
              </div>
              <div className={`flex justify-between font-medium ${Math.max(0, billDetail.booking.total_amount - billDetail.booking.amount_paid) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                <span>Balance</span>
                <span>₱{Math.max(0, billDetail.booking.total_amount - billDetail.booking.amount_paid).toLocaleString()}</span>
              </div>
            </div>
            <div className="flex gap-2">
              {Math.max(0, billDetail.booking.total_amount - billDetail.booking.amount_paid) > 0 && (
                <button onClick={() => { setBillDetail(null); openCheckoutModal(billDetail.booking) }}
                  className="flex-1 py-2 bg-blue-700 text-white text-sm rounded-lg">Record Payment</button>
              )}
              <button onClick={() => setBillDetail(null)}
                className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== CHECKOUT PAYMENT MODAL ===== */}
      {checkoutModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !processingCheckout && setCheckoutModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-0.5">Check Out — {checkoutModal.booking.booking_number}</div>
            <div className="text-xs text-gray-400 mb-3">{(checkoutModal.booking.guests as any)?.full_name}</div>

            <div className="text-sm space-y-1.5 bg-gray-50 rounded-lg p-3 mb-3">
              <div className="flex justify-between text-gray-600">
                <span>{checkoutModal.booking.rooms ? `Room ${(checkoutModal.booking.rooms as any).room_number}` : (checkoutModal.booking.cottages as any)?.name}</span>
                <span>₱{Number(checkoutModal.booking.subtotal).toLocaleString()}</span>
              </div>
              {checkoutModal.addons.map((a: any) => (
                <div key={a.id} className="flex justify-between text-gray-600">
                  <span>{a.name}{a.quantity > 1 ? ` × ${a.quantity}` : ''}</span>
                  <span>₱{Number(a.total_price ?? a.unit_price * a.quantity).toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-200 pt-1.5">
                <span>Total Bill</span><span>₱{Number(checkoutModal.booking.total_amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>Already Paid</span><span>₱{Number(checkoutModal.booking.amount_paid).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-medium text-red-600">
                <span>Balance Due</span>
                <span>₱{Math.max(0, checkoutModal.booking.total_amount - checkoutModal.booking.amount_paid).toLocaleString()}</span>
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">Amount Being Paid Now</label>
              <input type="number" value={checkoutAmount}
                onChange={e => setCheckoutAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>

            <PaymentCalculator
              totalDue={checkoutAmount}
              method={checkoutMethod}
              onMethodChange={setCheckoutMethod}
              amountTendered={checkoutAmount}
              onAmountTenderedChange={setCheckoutAmount}
            />

            <div className="flex gap-2 mt-3">
              <button onClick={confirmCheckout} disabled={processingCheckout}
                className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm rounded-lg">
                {processingCheckout ? 'Processing...' : 'Confirm Check-Out'}
              </button>
              <button onClick={() => setCheckoutModal(null)} disabled={processingCheckout}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== EQUIPMENT DAMAGE CHECK MODAL ===== */}
      {equipmentCheckModal.length > 0 && pendingCheckoutBooking && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="text-sm font-semibold text-gray-800 mb-1">Equipment Return Check</div>
            <div className="text-xs text-gray-400 mb-4">Inspect each item before finalizing.</div>

            <div className="space-y-4">
              {equipmentCheckModal.map((rental: any) => {
                const cond = equipmentConditions[rental.id] ?? { condition: 'good', notes: '', charge: 0 }
                return (
                  <div key={rental.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-sm font-medium text-gray-700">{(rental.equipment as any)?.name}</div>
                        <div className="text-xs text-gray-400">Qty: {rental.quantity}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEquipmentConditions(p => ({ ...p, [rental.id]: { ...p[rental.id], condition: 'good' } }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${cond.condition === 'good' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                          ✓ Good
                        </button>
                        <button onClick={() => setEquipmentConditions(p => ({ ...p, [rental.id]: { ...p[rental.id], condition: 'damaged' } }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${cond.condition === 'damaged' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                          ⚠ Damaged
                        </button>
                      </div>
                    </div>
                    {cond.condition === 'damaged' && (
                      <div className="space-y-2 pt-3 border-t border-gray-100">
                        <input value={cond.notes} onChange={e => setEquipmentConditions(p => ({ ...p, [rental.id]: { ...p[rental.id], notes: e.target.value } }))}
                          placeholder="Damage description..."
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white" />
                        <input type="number" value={cond.charge || ''} onChange={e => setEquipmentConditions(p => ({ ...p, [rental.id]: { ...p[rental.id], charge: parseFloat(e.target.value) || 0 } }))}
                          placeholder="Damage charge (₱)"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {Object.values(equipmentConditions).some(c => c.condition === 'damaged' && c.charge > 0) && (
              <div className="mt-3 bg-red-50 rounded-lg p-3 text-sm flex justify-between font-medium text-red-700">
                <span>Total Damage Charges</span>
                <span>₱{Object.values(equipmentConditions).reduce((s, c) => s + (c.charge ?? 0), 0).toLocaleString()}</span>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={confirmEquipmentCheck}
                className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg">
                Confirm & Proceed
              </button>
              <button onClick={() => { setEquipmentCheckModal([]); setPendingCheckoutBooking(null) }}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">Cancel</button>
            </div>
          </div>



{/* ===== Damage Payment Modal UI ===== */}
{damagePaymentModal && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl p-5 w-full max-w-sm">
      <div className="text-sm font-semibold text-gray-800 mb-1">Collect Damage Payment</div>
      <div className="text-xs text-gray-400 mb-4">
        {damagePaymentModal.finalBooking.booking_number}
      </div>

      <div className="bg-red-50 rounded-lg p-3 text-sm font-medium text-red-700 flex justify-between mb-4">
        <span>Damage Charge Total</span>
        <span>₱{damagePaymentModal.damageTotal.toLocaleString()}</span>
      </div>

      <PaymentCalculator
        totalDue={damagePaymentModal.damageTotal}
        method={damagePaymentMethod}
        onMethodChange={setDamagePaymentMethod}
        amountTendered={damagePaymentAmount}
        onAmountTenderedChange={setDamagePaymentAmount}
      />

      <button
        onClick={confirmDamagePayment}
        disabled={!isPaymentValid(damagePaymentMethod, damagePaymentModal.damageTotal, damagePaymentAmount)}
        className="w-full mt-3 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium rounded-lg"
      >
        Collect Payment & Complete Check-out
      </button>
    </div>
  </div>
)}







        </div>
      )}
    </div>
  )
}
