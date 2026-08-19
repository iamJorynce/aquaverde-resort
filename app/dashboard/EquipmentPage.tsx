'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from './permissions'
import PaymentCalculator, { isPaymentValid } from './PaymentCalculator'
import { logActivity } from './activityLog'

export default function EquipmentPage() {

  const [showDamageLog, setShowDamageLog] = useState(false)
  
const [damageLog, setDamageLog] = useState<any[]>([])

async function loadDamageLog() {
  const { data } = await supabase.from('damage_log').select('*')
  setDamageLog(data ?? [])
} 
  const supabase = createClient()
  const { role, can } = usePermissions()
  const isAdmin = role === 'super_admin' || role === 'resort_owner'
  const [hasActiveShift, setHasActiveShift] = useState<boolean | null>(null)
  const [equipment, setEquipment] = useState<any[]>([])
  const [guests, setGuests] = useState<any[]>([])
  const [activeBookings, setActiveBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({
    name: '', total_quantity: 1, hourly_rate: 0, daily_rate: 0, deposit_amount: 0,
  })

  const [rentModal, setRentModal] = useState<any>(null)
  const [rentForm, setRentForm] = useState({
    renterType: 'walkin' as 'guest' | 'booking' | 'walkin',
    guest_id: '', booking_id: '', walkinName: '',
    quantity: 1, rate_type: 'hourly' as 'hourly' | 'daily',
    hours: 1, days: 1,
    chargeToRoom: true,
  })
  const [rentPayment, setRentPayment] = useState({ method: 'cash', amountTendered: 0 })

  // Return flow state
  const [returnModal, setReturnModal] = useState<any>(null)        // the equipment item
  const [activeRentals, setActiveRentals] = useState<any[]>([])    // open rentals for that item
  const [selectedRental, setSelectedRental] = useState<string>('') // which rental is being returned
  const [returnCondition, setReturnCondition] = useState<'good' | 'damaged'>('good')
  const [returnDamageDesc, setReturnDamageDesc] = useState('')
  const [returnDamageCharge, setReturnDamageCharge] = useState(0)
  const [returningAll, setReturningAll] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: eq }, { data: g }, { data: b }] = await Promise.all([
      supabase.from('equipment').select('*').eq('is_active', true).order('name'),
      supabase.from('guests').select('id, full_name, phone').order('full_name'),
      supabase.from('bookings').select('id, booking_number, guest_id, guests(full_name), rooms(room_number), cottages(name)').eq('status', 'checked_in'),
    ])
    setEquipment(eq ?? [])
    setGuests(g ?? [])
    setActiveBookings(b ?? [])
    setLoading(false)

    if (role === null) return // wait for role to load
    if (!isAdmin) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: shift } = await supabase.from('shifts').select('id')
          .eq('cashier_id', user.id).eq('status', 'open').maybeSingle()
        setHasActiveShift(!!shift)
      }
    } else {
      setHasActiveShift(true)
    }
  }

  useEffect(() => { load() }, [role])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  // ---- Rent out flow ----
  function openRent(item: any) {
    if (item.available_qty <= 0) { showToast('No available units.'); return }
    setRentModal(item)
    setRentForm({
      renterType: 'walkin', guest_id: '', booking_id: '', walkinName: '',
      quantity: 1, rate_type: item.hourly_rate ? 'hourly' : 'daily',
      hours: 1, days: 1, chargeToRoom: true,
    })
    setRentPayment({ method: 'cash', amountTendered: 0 })
  }

  function rentTotal() {
    if (!rentModal) return 0
    const rate = rentForm.rate_type === 'hourly' ? rentModal.hourly_rate : rentModal.daily_rate
    const units = rentForm.rate_type === 'hourly' ? rentForm.hours : rentForm.days
    return (rate ?? 0) * rentForm.quantity * units
  }

  async function confirmRent() {
    if (!rentModal) return
    if (rentForm.renterType === 'walkin' && !rentForm.walkinName.trim()) { showToast('Please enter the renter\'s name.'); return }
    if (rentForm.renterType === 'guest' && !rentForm.guest_id) { showToast('Please select a guest.'); return }
    if (rentForm.renterType === 'booking' && !rentForm.booking_id) { showToast('Please select a room/booking.'); return }
    if (rentForm.quantity > rentModal.available_qty) { showToast(`Only ${rentModal.available_qty} unit(s) available.`); return }

    const total = rentTotal()
    const selectedBooking = activeBookings.find(b => b.id === rentForm.booking_id)
    const guestId = rentForm.renterType === 'guest' ? rentForm.guest_id
      : rentForm.renterType === 'booking' ? selectedBooking?.guest_id
      : null

    const renterName = rentForm.renterType === 'walkin' ? rentForm.walkinName.trim()
      : rentForm.renterType === 'guest' ? guests.find(g => g.id === rentForm.guest_id)?.full_name
      : (selectedBooking?.guests as any)?.full_name

    const { error: rentalError } = await supabase.from('equipment_rentals').insert({
      rental_number: `RNT-${Date.now()}`,
      equipment_id: rentModal.id,
      booking_id: rentForm.renterType === 'booking' ? rentForm.booking_id : null,
      guest_id: guestId ?? null,
      renter_name: rentForm.renterType === 'walkin' ? rentForm.walkinName.trim() : null,
      quantity: rentForm.quantity,
      rate_type: rentForm.rate_type,
      rate_amount: rentForm.rate_type === 'hourly' ? rentModal.hourly_rate : rentModal.daily_rate,
      total_amount: total,
      rental_start: new Date().toISOString(),
      deposit_paid: (rentModal.deposit_amount ?? 0) * rentForm.quantity,
    })

    if (rentalError) { showToast('Error: ' + rentalError.message); return }

    await supabase.from('equipment').update({ available_qty: rentModal.available_qty - rentForm.quantity }).eq('id', rentModal.id)

    if (rentForm.renterType === 'booking') {
      if (rentForm.chargeToRoom) {
        // Charge to room — add to booking_addons, reflect in checkout bill
        const label = `Equipment: ${rentModal.name} × ${rentForm.quantity}${rentForm.rate_type === 'hourly' ? ` (${rentForm.hours}h)` : ` (${rentForm.days}d)`}`
        const { error: addonError } = await supabase.from('booking_addons').insert({
          booking_id: rentForm.booking_id,
          name: label,
          quantity: 1,
          unit_price: total,
        })
        if (addonError) { showToast('Warning: Could not add to room bill — ' + addonError.message); return }
        const { data: bk } = await supabase.from('bookings').select('extras_total, total_amount').eq('id', rentForm.booking_id).single()
        if (bk) {
          await supabase.from('bookings').update({
            extras_total: (bk.extras_total ?? 0) + total,
            total_amount: (bk.total_amount ?? 0) + total,
          }).eq('id', rentForm.booking_id)
        }
        showToast(`${rentModal.name} × ${rentForm.quantity} charged to room — ₱${total.toLocaleString()} collected at check-out.`)
      } else {
        // Pay now — immediate payment
        if (total > 0) {
          await supabase.from('transactions').insert({
            txn_number: `TXN-${Date.now()}`,
            guest_id: guestId ?? null,
            booking_id: rentForm.booking_id,
            txn_type: 'equipment_rental',
            description: `Equipment rental — ${rentModal.name} × ${rentForm.quantity} (${renterName ?? 'Guest'})`,
            amount: total,
            payment_method: rentPayment.method,
          })
        }
        showToast(`${rentModal.name} × ${rentForm.quantity} rented to ${renterName}. ₱${total.toLocaleString()} collected.`)
      }
    } else {
      // Walk-in / Registered → collect payment immediately
      if (total > 0) {
        await supabase.from('transactions').insert({
          txn_number: `TXN-${Date.now()}`,
          guest_id: guestId ?? null,
          booking_id: null,
          txn_type: 'equipment_rental',
          description: `Equipment rental — ${rentModal.name} × ${rentForm.quantity} (${renterName ?? 'Walk-in'})`,
          amount: total,
          payment_method: rentPayment.method,
        })
      }
      showToast(`${rentModal.name} × ${rentForm.quantity} rented to ${renterName}. ₱${total.toLocaleString()} collected.`)
    }

    await logActivity(supabase, {
      action: 'EQUIPMENT_RENTED',
      details: `${rentModal.name} × ${rentForm.quantity} rented to ${renterName ?? 'Walk-in'} — ₱${total.toLocaleString()} ${
        rentForm.renterType === 'booking'
          ? rentForm.chargeToRoom ? '(charged to room)' : '(paid now)'
          : '(paid)'
      }`,
    })

    setRentModal(null)
    load()
  }

  async function openReturn(item: any) {
    const rented = item.total_quantity - item.available_qty - (item.under_repair_qty ?? 0)
    if (rented <= 0) return

    // Fetch open rentals — keep select simple to avoid errors from missing columns
    const { data: rentals, error } = await supabase
      .from('equipment_rentals')
      .select('id, quantity, rental_start, guest_id, booking_id')
      .eq('equipment_id', item.id)
      .is('rental_end', null)
      .order('rental_start', { ascending: true })

    if (error) {
      // Fallback: if rental_end column doesn't exist, fetch without that filter
      const { data: fallback } = await supabase
        .from('equipment_rentals')
        .select('id, quantity, rental_start, guest_id, booking_id')
        .eq('equipment_id', item.id)
        .eq('status', 'active')
        .order('rental_start', { ascending: true })

      const enriched = await enrichRentals(fallback ?? [])
      setReturnModal(item)
      setActiveRentals(enriched)
      setSelectedRental(enriched?.[0]?.id ?? '')
      setReturnCondition('good')
      setReturnDamageDesc('')
      setReturnDamageCharge(0)
      setReturningAll(false)
      return
    }

    const enriched = await enrichRentals(rentals ?? [])
    setReturnModal(item)
    setActiveRentals(enriched)
    setSelectedRental(enriched?.[0]?.id ?? '')
    setReturnCondition('good')
    setReturnDamageDesc('')
    setReturnDamageCharge(0)
    // Default to returning all units
    setReturningAll(true)
  }

  // Enrich rental records with guest/booking names
  async function enrichRentals(rentals: any[]) {
    return await Promise.all(rentals.map(async (r) => {
      let renterName = null

      // Try renter_name column first (might not exist, handle gracefully)
      try {
        const { data } = await supabase
          .from('equipment_rentals')
          .select('renter_name')
          .eq('id', r.id)
          .single()
        if (data?.renter_name) renterName = data.renter_name
      } catch {}

      // Try guest name
      if (!renterName && r.guest_id) {
        const { data: g } = await supabase.from('guests').select('full_name').eq('id', r.guest_id).single()
        if (g) renterName = g.full_name
      }

      // Try booking info
      if (!renterName && r.booking_id) {
        const { data: b } = await supabase
          .from('bookings')
          .select('booking_number, guests(full_name), rooms(room_number), cottages(name)')
          .eq('id', r.booking_id)
          .single()
        if (b) {
          const gname = (b.guests as any)?.full_name
          const loc = (b.rooms as any)?.room_number
            ? `Room ${(b.rooms as any).room_number}`
            : (b.cottages as any)?.name
          renterName = gname ? `${gname}${loc ? ` (${loc})` : ''}` : loc
        }
      }

      return { ...r, renterName: renterName ?? 'Walk-in' }
    }))
  }

  async function confirmReturn() {
    if (!returnModal || !selectedRental) return
    if (returnCondition === 'damaged' && !returnDamageDesc.trim()) {
      showToast('Please describe the damage.')
      return
    }

    const returnedAt = new Date().toISOString()

    // Manual return — no rental record, just update equipment quantities
    if (selectedRental === '__manual__') {
      const { data: eq } = await supabase.from('equipment').select('available_qty, under_repair_qty').eq('id', returnModal.id).single()
      if (eq) {
        await supabase.from('equipment').update(
          returnCondition === 'damaged'
            ? { under_repair_qty: (eq.under_repair_qty ?? 0) + 1 }
            : { available_qty: eq.available_qty + 1 }
        ).eq('id', returnModal.id)
      }
      await logActivity(supabase, {
        action: returnCondition === 'damaged' ? 'EQUIPMENT_DAMAGED' : 'EQUIPMENT_RETURNED',
        details: `${returnModal.name} manually returned — ${returnCondition === 'damaged' ? `DAMAGED: "${returnDamageDesc}"` : 'Good condition'}`,
      })
      showToast(`${returnModal.name} returned${returnCondition === 'damaged' ? ' — marked as damaged ⚠️' : ' ✓'}`)
      setReturnModal(null)
      load()
      return
    }

    const rental = activeRentals.find(r => r.id === selectedRental)
    if (!rental) return

    const qty = returningAll ? rental.quantity : 1
    const renterLabel = rental.renterName ?? 'Unknown'

    // Close the rental record (or mark partial if returning less than total qty)
    if (qty >= rental.quantity) {
      await supabase.from('equipment_rentals').update({
        rental_end: returnedAt,
        returned_at: returnedAt,
        status: returnCondition === 'damaged' ? 'damaged' : 'returned',
        condition_notes: returnCondition === 'damaged' ? returnDamageDesc : null,
        damage_charge: returnCondition === 'damaged' ? returnDamageCharge : 0,
      }).eq('id', rental.id)
    } else {
      // Partial return — reduce quantity on the rental record
      await supabase.from('equipment_rentals').update({
        quantity: rental.quantity - qty,
      }).eq('id', rental.id)
    }

    // Update equipment quantities
    const { data: eq } = await supabase.from('equipment').select('available_qty, under_repair_qty').eq('id', returnModal.id).single()
    if (eq) {
      if (returnCondition === 'damaged') {
        await supabase.from('equipment').update({
          under_repair_qty: (eq.under_repair_qty ?? 0) + qty,
        }).eq('id', returnModal.id)
      } else {
        await supabase.from('equipment').update({
          available_qty: eq.available_qty + qty,
        }).eq('id', returnModal.id)
      }
    }

    if (returnCondition === 'damaged') {
      const { error: dmgError } = await supabase.from('damage_log').insert({
        equipment_id: returnModal.id,
        equipment_name: returnModal.name,
        quantity: qty,
        condition_notes: returnDamageDesc,
        damage_charge: returnDamageCharge,
        returned_at: returnedAt,
        booking_id: rental.booking_id ?? null,
        guest_id: rental.guest_id ?? null,
      })
      if (dmgError) console.warn('damage_log insert failed (table may not exist):', dmgError.message)
    }

    await logActivity(supabase, {
      action: returnCondition === 'damaged' ? 'EQUIPMENT_DAMAGED' : 'EQUIPMENT_RETURNED',
      details: `${returnModal.name} × ${qty} returned by ${renterLabel} — ${returnCondition === 'damaged' ? `DAMAGED: "${returnDamageDesc}"` : 'Good condition'}`,
    })

    showToast(`${returnModal.name} × ${qty} returned${returnCondition === 'damaged' ? ' — marked as damaged ⚠️' : ' ✓'}`)
    setReturnModal(null)
    load()
  }

  // ---- Admin CRUD ----
  function openNew() {
    setEditing(null)
    setForm({ name: '', total_quantity: 1, hourly_rate: 0, daily_rate: 0, deposit_amount: 0 })
    setShowForm(true)
  }

  function openEdit(item: any) {
    setEditing(item)
    setForm({
      name: item.name, total_quantity: item.total_quantity,
      hourly_rate: item.hourly_rate ?? 0, daily_rate: item.daily_rate ?? 0,
      deposit_amount: item.deposit_amount ?? 0,
    })
    setShowForm(true)
  }

  async function saveEquipment(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || form.total_quantity <= 0) { showToast('Name and a valid quantity are required.'); return }

    const code = `EQ-${Date.now().toString().slice(-4)}`

    if (editing) {
      const delta = form.total_quantity - editing.total_quantity
      const { error } = await supabase.from('equipment').update({
        ...form, available_qty: Math.max(0, editing.available_qty + delta),
      }).eq('id', editing.id)
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`${form.name} updated.`)
    } else {
      const { error } = await supabase.from('equipment').insert({
        ...form, equipment_code: code, available_qty: form.total_quantity,
      })
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`${form.name} added.`)
    }
    setShowForm(false)
    load()
  }

  async function deactivate(item: any) {
    if (!confirm(`Remove "${item.name}" from equipment list?`)) return
    const { error } = await supabase.from('equipment').update({ is_active: false }).eq('id', item.id)
    if (error) { showToast('Error: ' + error.message); return }
    showToast(`${item.name} removed.`)
    load()
  }

   async function markAsRepaired(item: any) {
    const qty = prompt(`How many units of "${item.name}" are now repaired and ready to use? (Max: ${item.under_repair_qty})`)
    const repairedQty = parseInt(qty || '0')
    if (!repairedQty || repairedQty <= 0 || repairedQty > item.under_repair_qty) {
      showToast('Invalid quantity.')
      return
    }
    await supabase.from('equipment').update({
      under_repair_qty: item.under_repair_qty - repairedQty,
      available_qty: item.available_qty + repairedQty,
    }).eq('id', item.id)
    await logActivity(supabase, {
      action: 'EQUIPMENT_REPAIRED',
      details: `${item.name} × ${repairedQty} repaired and returned to available pool`,
    })
    showToast(`${repairedQty} unit(s) of ${item.name} marked as repaired.`)
    load()
  }

  async function markAsUnrepairable(item: any) {
    const qty = prompt(`How many units of "${item.name}" are unrepairable and will be permanently removed? (Max: ${item.under_repair_qty})`)
    const writeOffQty = parseInt(qty || '0')
    if (!writeOffQty || writeOffQty <= 0 || writeOffQty > item.under_repair_qty) {
      showToast('Invalid quantity.')
      return
    }
    if (!confirm(`Permanently remove ${writeOffQty} unit(s) of "${item.name}" from inventory? This cannot be undone.`)) return

    await supabase.from('equipment').update({
      under_repair_qty: item.under_repair_qty - writeOffQty,
      written_off_qty: (item.written_off_qty ?? 0) + writeOffQty,
      total_quantity: item.total_quantity - writeOffQty,
    }).eq('id', item.id)
    await logActivity(supabase, {
      action: 'EQUIPMENT_WRITTEN_OFF',
      details: `${item.name} × ${writeOffQty} written off as unrepairable`,
    })
    showToast(`${writeOffQty} unit(s) of ${item.name} written off.`)
    load()
  }

  const canManageEquipment = can('canManageEquipmentCatalog')

  return (
    <div>
      {hasActiveShift === false && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-red-500 text-lg">🔒</span>
          <div>
            <div className="text-sm font-medium text-red-700">No Active Shift</div>
            <div className="text-xs text-red-500">You must open a shift in the <strong>Remittance</strong> section before renting out equipment.</div>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50 max-w-sm">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-medium text-gray-700">{equipment.length} Equipment Types</div>



       
        {canManageEquipment && (
          <div className="flex gap-2">
            <button onClick={openNew} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg">
              + Add Equipment
            </button>

            <button onClick={() => { setShowDamageLog(!showDamageLog); if (!showDamageLog) loadDamageLog() }}
      className="px-3 py-1.5 border border-amber-200 text-amber-700 hover:bg-amber-50 text-xs rounded-lg">
      🔧 Damage Log
    </button>
          </div>
        )}
      </div>
{showDamageLog && (
  <div className="bg-white border border-gray-100 rounded-xl overflow-hidden mb-4">
    <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">
      Damage Reports ({damageLog.length})
    </div>
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
          <th className="text-left px-4 py-2.5">Equipment</th>
          <th className="text-left px-4 py-2.5">Guest</th>
          <th className="text-left px-4 py-2.5">Booking</th>
          <th className="text-left px-4 py-2.5">Damage Description</th>
          <th className="text-right px-4 py-2.5">Charge</th>
          <th className="text-left px-4 py-2.5">Date</th>
        </tr>
      </thead>
      <tbody>
        {damageLog.length === 0 ? (
          <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-xs">No damage reports.</td></tr>
        ) : damageLog.map((d: any) => (
          <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
            <td className="px-4 py-2.5 font-medium text-gray-700">{d.equipment_name} × {d.quantity}</td>
            <td className="px-4 py-2.5">{d.guest_name ?? '—'}</td>
            <td className="px-4 py-2.5 text-blue-700">{d.booking_number ?? '—'}</td>
            <td className="px-4 py-2.5 text-gray-500">{d.condition_notes ?? '—'}</td>
            <td className="px-4 py-2.5 text-right font-medium text-red-600">₱{Number(d.damage_charge).toLocaleString()}</td>
            <td className="px-4 py-2.5 text-xs text-gray-400">
              {d.returned_at ? new Date(d.returned_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}


      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5">Equipment</th>
                <th className="text-left px-4 py-2.5">Total</th>
                <th className="text-left px-4 py-2.5">Rented</th>
                <th className="text-left px-4 py-2.5 text-amber-600">Damaged</th>
                <th className="text-left px-4 py-2.5">Available</th>
                <th className="text-left px-4 py-2.5">Written Off</th>
                <th className="text-left px-4 py-2.5">Rate</th>
                <th className="text-left px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {equipment.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-xs">No equipment found.</td></tr>
              ) : equipment.map(e => (
                <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-700">{e.name}</td>
                  <td className="px-4 py-2.5">{e.total_quantity}</td>
                  <td className="px-4 py-2.5">
                    {e.total_quantity - e.available_qty - (e.under_repair_qty ?? 0)}
                  </td>
                  <td className="px-4 py-2.5">
                    {(e.under_repair_qty ?? 0) > 0
                      ? <span className="text-amber-600 font-medium">{e.under_repair_qty} ⚠️</span>
                      : <span className="text-gray-400">—</span>
                    }
                  </td>
                  <td className="px-4 py-2.5">{e.available_qty}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">
                    {e.written_off_qty > 0 ? `${e.written_off_qty} written off` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {e.hourly_rate ? `₱${e.hourly_rate}/hr` : `₱${e.daily_rate}/day`}
                  </td>

                  <td className="px-4 py-2.5 flex gap-1">
                    <button
                      onClick={() => openRent(e)}
                      disabled={e.available_qty <= 0 || hasActiveShift === false}
                      className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 text-white text-xs rounded-lg"
                      title={hasActiveShift === false ? 'Open a shift first' : ''}
                    >
                      Rent Out
                    </button>
                    <button
                      onClick={() => openReturn(e)}
                      disabled={(e.total_quantity - e.available_qty - (e.under_repair_qty ?? 0)) <= 0}
                      className="px-2.5 py-1 border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 text-xs rounded-lg"
                    >
                      Return
                    </button>
                    {canManageEquipment && (
                       <>
                       {(e.under_repair_qty ?? 0) > 0 && (
                         <>
                           <button onClick={() => markAsRepaired(e)}
                             className="px-2.5 py-1 bg-green-100 hover:bg-green-200 text-green-700 text-xs rounded-lg">
                             ✓ Repaired ({e.under_repair_qty})
                           </button>
                           <button onClick={() => markAsUnrepairable(e)}
                             className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs rounded-lg">
                             ✗ Write Off
                           </button>
                         </>
                       )}
              
              
               


                    

                        <button onClick={() => openEdit(e)} className="px-2 py-1 text-gray-400 hover:text-gray-600 text-xs">Edit</button>
                        <button onClick={() => deactivate(e)} className="px-2 py-1 text-red-400 hover:text-red-600 text-xs">Remove</button>
                         

                      </>
                      
                    )}
                  </td>
                  
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rent Out Modal */}
      {rentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setRentModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto space-y-3" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700">Rent Out — {rentModal.name}</div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Renter</label>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-2">
                <button type="button" onClick={() => setRentForm(p => ({ ...p, renterType: 'walkin' }))}
                  className={`flex-1 text-xs py-1.5 rounded-md ${rentForm.renterType === 'walkin' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}>
                  Walk-in
                </button>
                <button type="button" onClick={() => setRentForm(p => ({ ...p, renterType: 'guest' }))}
                  className={`flex-1 text-xs py-1.5 rounded-md ${rentForm.renterType === 'guest' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}>
                  Registered
                </button>
                <button type="button" onClick={() => setRentForm(p => ({ ...p, renterType: 'booking' }))}
                  className={`flex-1 text-xs py-1.5 rounded-md ${rentForm.renterType === 'booking' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}>
                  Active Stay
                </button>
              </div>

              {rentForm.renterType === 'walkin' && (
                <input
                  type="text"
                  placeholder="Enter renter's name"
                  value={rentForm.walkinName}
                  onChange={e => setRentForm(p => ({ ...p, walkinName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
                  autoFocus
                />
              )}
              {rentForm.renterType === 'guest' && (
                <select value={rentForm.guest_id} onChange={e => setRentForm(p => ({ ...p, guest_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                  <option value="">-- Select guest --</option>
                  {guests.map(g => <option key={g.id} value={g.id}>{g.full_name}{g.phone ? ` (${g.phone})` : ''}</option>)}
                </select>
              )}
              {rentForm.renterType === 'booking' && (
                <>
                  <select value={rentForm.booking_id} onChange={e => setRentForm(p => ({ ...p, booking_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                    <option value="">-- Select active stay --</option>
                    {activeBookings.map(b => (
                      <option key={b.id} value={b.id}>
                        {(b.guests as any)?.full_name} — {b.rooms ? `Room ${(b.rooms as any).room_number}` : (b.cottages as any)?.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2 mt-2">
                    <button type="button"
                      onClick={() => setRentForm(p => ({ ...p, chargeToRoom: true }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        rentForm.chargeToRoom
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}>
                      🏨 Charge to Room
                    </button>
                    <button type="button"
                      onClick={() => setRentForm(p => ({ ...p, chargeToRoom: false }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        !rentForm.chargeToRoom
                          ? 'bg-green-600 text-white border-green-600'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}>
                      💵 Pay Now
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Quantity</label>
                <input type="number" min={1} max={rentModal.available_qty} value={rentForm.quantity}
                  onChange={e => setRentForm(p => ({ ...p, quantity: Math.max(1, parseInt(e.target.value) || 1) }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{rentForm.rate_type === 'hourly' ? 'Hours' : 'Days'}</label>
                <input type="number" min={1} value={rentForm.rate_type === 'hourly' ? rentForm.hours : rentForm.days}
                  onChange={e => setRentForm(p => ({
                    ...p,
                    [rentForm.rate_type === 'hourly' ? 'hours' : 'days']: Math.max(1, parseInt(e.target.value) || 1),
                  }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
            </div>

            {rentModal.hourly_rate && rentModal.daily_rate && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Rate Type</label>
                <select value={rentForm.rate_type} onChange={e => setRentForm(p => ({ ...p, rate_type: e.target.value as 'hourly' | 'daily' }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                  <option value="hourly">Hourly (₱{rentModal.hourly_rate}/hr)</option>
                  <option value="daily">Daily (₱{rentModal.daily_rate}/day)</option>
                </select>
              </div>
            )}

            <div className="bg-blue-50 rounded-lg p-3 text-sm flex justify-between font-medium text-blue-700">
              <span>Rental Total</span>
              <span>₱{rentTotal().toLocaleString()}</span>
            </div>

            {rentForm.renterType === 'booking' && rentForm.chargeToRoom ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                🏨 ₱{rentTotal().toLocaleString()} will be added to their room bill and collected at check-out.
              </div>
            ) : (
              <PaymentCalculator
                totalDue={rentTotal()}
                method={rentPayment.method}
                onMethodChange={m => setRentPayment(p => ({ ...p, method: m }))}
                amountTendered={rentPayment.amountTendered}
                onAmountTenderedChange={a => setRentPayment(p => ({ ...p, amountTendered: a }))}
              />
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={confirmRent}
                disabled={rentForm.renterType !== 'booking' || !rentForm.chargeToRoom
                  ? !isPaymentValid(rentPayment.method, rentTotal(), rentPayment.amountTendered)
                  : false}
                className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm rounded-lg">
                {rentForm.renterType === 'booking' && rentForm.chargeToRoom
                  ? '🏨 Charge to Room'
                  : '💵 Confirm & Collect Payment'}
              </button>
              <button onClick={() => setRentModal(null)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== RETURN MODAL ===== */}
      {returnModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setReturnModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700">Return Equipment — {returnModal.name}</div>

            {/* Who is returning */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Who is returning?</label>
              {activeRentals.length === 0 ? (
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  No tracked rentals found. The item may have been rented outside the system.
                  <button onClick={() => {
                    // Allow manual return even without a rental record
                    setSelectedRental('__manual__')
                  }} className="ml-2 underline font-medium">
                    Return anyway
                  </button>
                </div>
              ) : (
                <select
                  value={selectedRental}
                  onChange={e => setSelectedRental(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
                >
                  {activeRentals.map((r: any) => {
                    const since = new Date(r.rental_start).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
                    return (
                      <option key={r.id} value={r.id}>
                        {r.renterName} — {r.quantity > 1 ? `${r.quantity} units` : '1 unit'} (since {since})
                      </option>
                    )
                  })}
                </select>
              )}
            </div>

            {/* How many if qty > 1 */}
            {(() => {
              const rental = activeRentals.find(r => r.id === selectedRental)
              return rental && rental.quantity > 1 ? (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Returning all {rental.quantity} units?</label>
                  <div className="flex gap-2">
                    <button onClick={() => setReturningAll(true)}
                      className={`flex-1 py-2 rounded-lg text-sm border ${returningAll ? 'bg-blue-700 text-white border-blue-700' : 'border-gray-200 text-gray-600'}`}>
                      All ({rental.quantity})
                    </button>
                    <button onClick={() => setReturningAll(false)}
                      className={`flex-1 py-2 rounded-lg text-sm border ${!returningAll ? 'bg-blue-700 text-white border-blue-700' : 'border-gray-200 text-gray-600'}`}>
                      1 unit only
                    </button>
                  </div>
                </div>
              ) : null
            })()}

            {/* Condition */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Condition</label>
              <div className="flex gap-2">
                <button onClick={() => setReturnCondition('good')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    returnCondition === 'good' ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  ✓ Good
                </button>
                <button onClick={() => setReturnCondition('damaged')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    returnCondition === 'damaged' ? 'bg-red-600 text-white border-red-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  ✗ Damaged
                </button>
              </div>
            </div>

            {/* Damage details */}
            {returnCondition === 'damaged' && (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                  ⚠️ Item will go to <strong>Under Repair</strong>. Admin must mark as repaired before it can be rented again.
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Damage Description <span className="text-red-500">*</span></label>
                  <textarea
                    value={returnDamageDesc}
                    onChange={e => setReturnDamageDesc(e.target.value)}
                    placeholder="Describe the damage..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Damage Charge (₱)</label>
                  <input
                    type="number" min={0} value={returnDamageCharge}
                    onChange={e => setReturnDamageCharge(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                  />
                </div>
              </>
            )}

            {returnCondition === 'good' && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
                ✓ Item will be returned to available stock.
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={confirmReturn}
                disabled={!selectedRental}
                className={`flex-1 py-2 text-white text-sm rounded-lg disabled:opacity-40 ${
                  returnCondition === 'good' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}>
                {returnCondition === 'good' ? 'Confirm Return' : 'Submit Damage Report'}
              </button>
              <button onClick={() => setReturnModal(null)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin: Add/Edit Equipment Type */}
      
      {showForm && (
        
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <form onSubmit={saveEquipment} className="bg-white rounded-xl p-5 w-full max-w-sm space-y-3" onClick={ev => ev.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-1">{editing ? 'Edit Equipment' : 'Add Equipment'}</div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input value={form.name} onChange={ev => setForm(p => ({ ...p, name: ev.target.value }))}
                placeholder="e.g. Kayak"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
             
            <div>
              <label className="block text-xs text-gray-500 mb-1">Total Quantity</label>
              <input type="number" value={form.total_quantity} onChange={ev => setForm(p => ({ ...p, total_quantity: parseInt(ev.target.value) || 1 }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Hourly Rate</label>
                <input type="number" value={form.hourly_rate} onChange={ev => setForm(p => ({ ...p, hourly_rate: parseFloat(ev.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Daily Rate</label>
                <input type="number" value={form.daily_rate} onChange={ev => setForm(p => ({ ...p, daily_rate: parseFloat(ev.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Deposit Amount</label>
              <input type="number" value={form.deposit_amount} onChange={ev => setForm(p => ({ ...p, deposit_amount: parseFloat(ev.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-lg">
                {editing ? 'Save Changes' : 'Add Equipment'}
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
