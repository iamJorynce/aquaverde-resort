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
    renterType: 'guest' as 'guest' | 'booking',
    guest_id: '', booking_id: '', quantity: 1, rate_type: 'hourly' as 'hourly' | 'daily',
    hours: 1, days: 1,
  })
  const [rentPayment, setRentPayment] = useState({ method: 'cash', amountTendered: 0 })

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
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  // ---- Rent out flow ----
  function openRent(item: any) {
    if (item.available_qty <= 0) { showToast('No available units.'); return }
    setRentModal(item)
    setRentForm({
      renterType: 'guest', guest_id: '', booking_id: '',
      quantity: 1, rate_type: item.hourly_rate ? 'hourly' : 'daily',
      hours: 1, days: 1,
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
    if (rentForm.renterType === 'guest' && !rentForm.guest_id) { showToast('Please select a guest.'); return }
    if (rentForm.renterType === 'booking' && !rentForm.booking_id) { showToast('Please select a room/booking.'); return }
    if (rentForm.quantity > rentModal.available_qty) { showToast(`Only ${rentModal.available_qty} unit(s) available.`); return }

    const total = rentTotal()
    const selectedBooking = activeBookings.find(b => b.id === rentForm.booking_id)
    const guestId = rentForm.renterType === 'guest' ? rentForm.guest_id : selectedBooking?.guest_id

    const { error: rentalError } = await supabase.from('equipment_rentals').insert({
      rental_number: `RNT-${Date.now()}`,
      equipment_id: rentModal.id,
      booking_id: rentForm.renterType === 'booking' ? rentForm.booking_id : null,
      guest_id: guestId ?? null,
      quantity: rentForm.quantity,
      rate_type: rentForm.rate_type,
      rate_amount: rentForm.rate_type === 'hourly' ? rentModal.hourly_rate : rentModal.daily_rate,
      total_amount: total,
      rental_start: new Date().toISOString(),
      deposit_paid: (rentModal.deposit_amount ?? 0) * rentForm.quantity,
    })

    if (rentalError) { showToast('Error: ' + rentalError.message); return }

    await supabase.from('equipment').update({ available_qty: rentModal.available_qty - rentForm.quantity }).eq('id', rentModal.id)

    // Record the payment as its own transaction so it shows up in reports,
    // same as every other payment-accepting flow in the system.
    if (total > 0) {
      await supabase.from('transactions').insert({
        txn_number: `TXN-${Date.now()}`,
        guest_id: guestId ?? null,
        booking_id: rentForm.renterType === 'booking' ? rentForm.booking_id : null,
        txn_type: 'equipment_rental',
        description: `Equipment rental — ${rentModal.name} × ${rentForm.quantity}`,
        amount: total,
        payment_method: rentPayment.method,
      })
    }

    await logActivity(supabase, {
      action: 'EQUIPMENT_RENTED',
      details: `${rentModal.name} × ${rentForm.quantity} rented to ${rentForm.renterType === 'guest'
        ? guests.find(g => g.id === rentForm.guest_id)?.full_name
        : (selectedBooking?.guests as any)?.full_name} — ₱${total.toLocaleString()}`,
    })

    showToast(`Rented out: ${rentModal.name} × ${rentForm.quantity}. Payment recorded.`)
    setRentModal(null)
    load()
  }

  async function returnItem(item: any) {
    if (item.available_qty >= item.total_quantity) return
    await supabase.from('equipment').update({ available_qty: item.available_qty + 1 }).eq('id', item.id)
    await logActivity(supabase, { action: 'EQUIPMENT_RETURNED', details: item.name })
    showToast(`${item.name} returned.`)
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
    total_quantity: item.total_quantity - writeOffQty,  // permanently reduce total count
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
                <th className="text-left px-4 py-2.5">Available</th>
                <th className="text-left px-4 py-2.5">Written Off</th>
                <th className="text-left px-4 py-2.5">Rate</th>
                <th className="text-left px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {equipment.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-xs">No equipment found.</td></tr>
              ) : equipment.map(e => (
                <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-700">{e.name}</td>
                  <td className="px-4 py-2.5">{e.total_quantity}</td>
                  <td className="px-4 py-2.5">{e.total_quantity - e.available_qty}</td>
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
                      disabled={e.available_qty <= 0}
                      className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 text-white text-xs rounded-lg"
                    >
                      Rent Out
                    </button>
                    <button
                      onClick={() => returnItem(e)}
                      disabled={e.available_qty >= e.total_quantity}
                      className="px-2.5 py-1 border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 text-xs rounded-lg"
                    >
                      Return
                    </button>
                    {canManageEquipment && (
                       <>
                       
                       <button onClick={() => markAsRepaired(e)}
      className="px-2.5 py-1 bg-green-100 hover:bg-green-200 text-green-700 text-xs rounded-lg">
      ✓ Repaired ({e.under_repair_qty})
    </button>
    <button onClick={() => markAsUnrepairable(e)}
      className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs rounded-lg">
      ✗ Write Off
    </button>
              
              
               


                    

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
                <button type="button" onClick={() => setRentForm(p => ({ ...p, renterType: 'guest' }))}
                  className={`flex-1 text-xs py-1.5 rounded-md ${rentForm.renterType === 'guest' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}>
                  Any Guest
                </button>
                <button type="button" onClick={() => setRentForm(p => ({ ...p, renterType: 'booking' }))}
                  className={`flex-1 text-xs py-1.5 rounded-md ${rentForm.renterType === 'booking' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}>
                  Active Stay
                </button>
              </div>

              {rentForm.renterType === 'guest' ? (
                <select value={rentForm.guest_id} onChange={e => setRentForm(p => ({ ...p, guest_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                  <option value="">-- Select guest --</option>
                  {guests.map(g => <option key={g.id} value={g.id}>{g.full_name}{g.phone ? ` (${g.phone})` : ''}</option>)}
                </select>
              ) : (
                <select value={rentForm.booking_id} onChange={e => setRentForm(p => ({ ...p, booking_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                  <option value="">-- Select active stay --</option>
                  {activeBookings.map(b => (
                    <option key={b.id} value={b.id}>
                      {(b.guests as any)?.full_name} — {b.rooms ? `Room ${(b.rooms as any).room_number}` : (b.cottages as any)?.name}
                    </option>
                  ))}
                </select>
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

            <PaymentCalculator
              totalDue={rentTotal()}
              method={rentPayment.method}
              onMethodChange={m => setRentPayment(p => ({ ...p, method: m }))}
              amountTendered={rentPayment.amountTendered}
              onAmountTenderedChange={a => setRentPayment(p => ({ ...p, amountTendered: a }))}
            />

            <div className="flex gap-2 pt-1">
              <button onClick={confirmRent}
                disabled={!isPaymentValid(rentPayment.method, rentTotal(), rentPayment.amountTendered)}
                className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm rounded-lg">
                Confirm Rental & Payment
              </button>
              <button onClick={() => setRentModal(null)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">
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
