'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { printReceipt } from './receipt'
import PaymentCalculator from './PaymentCalculator'
import { logActivity } from './activityLog'
import { usePermissions } from './permissions'

interface MenuItem { id: string; name: string; price: number; category_id: string; menu_categories: { name: string; id: string } | null }
interface CartItem  { id: string; name: string; price: number; qty: number }

export default function POSPage() {
  const supabase = createClient()
  const { role } = usePermissions()
  const isAdmin = role === 'super_admin' || role === 'resort_owner'

  const [items, setItems]                 = useState<MenuItem[]>([])
  const [allCategories, setAllCategories] = useState<{ id: string; name: string }[]>([])
  const [activeCategory, setActiveCategory] = useState('')
  const [cart, setCart]                   = useState<CartItem[]>([])
  const [activeBookings, setActiveBookings] = useState<any[]>([])
  const [chargeToBooking, setChargeToBooking] = useState('')
  const [walkInGuestName, setWalkInGuestName] = useState('')
  const [loading, setLoading]             = useState(false)
  const [toast, setToast]                 = useState('')

  // Payment calculator state
  const [paymentMethod, setPaymentMethod]   = useState('cash')
  const [amountTendered, setAmountTendered] = useState(0)

  // Admin: menu management
  const [showMenuManager, setShowMenuManager] = useState(false)
  const [menuForm, setMenuForm] = useState({ name: '', price: 0, category_id: '', is_available: true })
  const [editingItem, setEditingItem] = useState<any>(null)
  const [catForm, setCatForm] = useState('')
  const [showCatForm, setShowCatForm] = useState(false)

  async function load() {
    const [{ data: menuItems }, { data: bookings }, { data: cats }] = await Promise.all([
      supabase.from('menu_items').select('id, name, price, category_id, is_available, menu_categories(id, name)').order('name'),
      supabase.from('bookings').select('id, booking_number, guests(full_name), rooms(room_number)').eq('status', 'checked_in'),
      supabase.from('menu_categories').select('id, name').order('name'),
    ])
    const list = (menuItems as any) ?? []
    setItems(list)
    setAllCategories(cats ?? [])
    const catNames = Array.from(new Set(list.filter((i: any) => i.is_available).map((i: any) => i.menu_categories?.name).filter(Boolean))) as string[]
    if (catNames.length && !catNames.includes(activeCategory)) setActiveCategory(catNames[0])
    setActiveBookings(bookings ?? [])
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function addToCart(item: MenuItem) {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id)
      return existing
        ? prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
        : [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }]
    })
  }

  function updateQty(id: string, qty: number) {
    if (qty <= 0) setCart(p => p.filter(c => c.id !== id))
    else setCart(p => p.map(c => c.id === id ? { ...c, qty } : c))
  }

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0)

  async function processPayment() {
    if (cart.length === 0) { showToast('No items in cart.'); return }
    setLoading(true)
    try {
      const orderNumber = `ORD-${Date.now()}`
      const linkedBooking = activeBookings.find(b => b.id === chargeToBooking)
      const guestName = chargeToBooking
        ? (linkedBooking?.guests as any)?.full_name ?? 'Guest'
        : walkInGuestName || 'Walk-in Guest'

      const { data: order, error: orderError } = await supabase.from('orders').insert({
        order_number: orderNumber,
        booking_id: chargeToBooking || null,
        order_type: chargeToBooking ? 'room_service' : 'dine_in',
        status: 'served',
        total: subtotal,
        payment_method: chargeToBooking ? null : paymentMethod,
        paid_at: chargeToBooking ? null : new Date().toISOString(),
        guest_name: guestName,
      }).select().single()

      if (orderError) throw orderError

      // Insert one order_item row per cart item
      await supabase.from('order_items').insert(
        cart.map(c => ({
          order_id: order.id,
          menu_item_id: c.id,
          quantity: c.qty,
          unit_price: c.price,
          subtotal: c.price * c.qty,
        }))
      )

      if (chargeToBooking) {
        // Insert one booking_addon per cart item (so checkout receipt itemizes them)
        await supabase.from('booking_addons').insert(
          cart.map(c => ({
            booking_id: chargeToBooking,
            name: c.name,
            quantity: c.qty,
            unit_price: c.price,
          }))
        )
        // Bump the booking total
        const { data: bk } = await supabase.from('bookings')
          .select('extras_total, total_amount').eq('id', chargeToBooking).single()
        if (bk) {
          await supabase.from('bookings').update({
            extras_total: Number(bk.extras_total ?? 0) + subtotal,
            total_amount: Number(bk.total_amount ?? 0) + subtotal,
          }).eq('id', chargeToBooking)
        }
      } else {
        await supabase.from('transactions').insert({
          txn_number: `TXN-${Date.now()}`,
          txn_type: 'pos',
          description: `POS Order ${orderNumber}${guestName !== 'Walk-in Guest' ? ` — ${guestName}` : ''}`,
          amount: subtotal,
          payment_method: paymentMethod,
        })
      }

      await logActivity(supabase, {
        action: 'POS_PAYMENT',
        details: `${orderNumber} — ${guestName}, ₱${subtotal.toLocaleString()} ${chargeToBooking ? 'room charge' : paymentMethod}`,
      })

      printReceipt({
        title: 'AquaVerde Beach Resort',
        receiptNumber: orderNumber,
        receiptType: 'POS Receipt',
        date: new Date().toLocaleDateString('en-PH', { dateStyle: 'medium' }),
        guestName,
        lineItems: cart.map(c => ({ label: c.name, qty: c.qty, amount: c.price * c.qty })),
        total: subtotal,
        amountPaid: subtotal,
        paymentMethod: chargeToBooking ? 'room_charge' : paymentMethod,
        footerNote: chargeToBooking ? 'Charged to room — settled at check-out.' : 'Thank you for your order!',
      })

      showToast(`Order ${orderNumber} processed! ₱${subtotal.toLocaleString()}`)
      setCart([])
      setChargeToBooking('')
      setWalkInGuestName('')
      setAmountTendered(0)
    } catch (err: any) {
      showToast('Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Admin: save menu item
  async function saveMenuItem(e: React.FormEvent) {
    e.preventDefault()
    if (!menuForm.name || menuForm.price <= 0 || !menuForm.category_id) {
      showToast('Name, price, and category are required.'); return
    }
    if (editingItem) {
      const { error } = await supabase.from('menu_items').update(menuForm).eq('id', editingItem.id)
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`${menuForm.name} updated.`)
    } else {
      const { error } = await supabase.from('menu_items').insert(menuForm)
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`${menuForm.name} added.`)
    }
    setEditingItem(null)
    setMenuForm({ name: '', price: 0, category_id: '', is_available: true })
    load()
  }

  async function toggleAvailable(item: any) {
    await supabase.from('menu_items').update({ is_available: !item.is_available }).eq('id', item.id)
    load()
  }

  async function saveCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!catForm.trim()) return
    const { error } = await supabase.from('menu_categories').insert({ name: catForm.trim() })
    if (error) { showToast('Error: ' + error.message); return }
    showToast(`Category "${catForm}" added.`)
    setCatForm('')
    setShowCatForm(false)
    load()
  }

  const availableItems = items.filter(i => i.is_available)
  const visibleItems = availableItems.filter(i => i.menu_categories?.name === activeCategory)
  const availableCatNames = Array.from(new Set(availableItems.map(i => i.menu_categories?.name).filter(Boolean))) as string[]

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50 max-w-xs">
          {toast}
        </div>
      )}

      {/* Admin: menu manager toggle */}
      {isAdmin && (
        <div className="mb-4">
          <button onClick={() => setShowMenuManager(!showMenuManager)}
            className="px-3 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs rounded-lg">
            {showMenuManager ? 'Back to POS' : '⚙ Manage Menu Items'}
          </button>
        </div>
      )}

      {/* Admin: menu manager panel */}
      {isAdmin && showMenuManager ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Add/Edit item form */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-sm font-medium text-gray-700 mb-3">
              {editingItem ? `Edit: ${editingItem.name}` : 'Add Menu Item'}
            </div>
            <form onSubmit={saveMenuItem} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Item Name</label>
                <input value={menuForm.name} onChange={e => setMenuForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Price</label>
                  <input type="number" value={menuForm.price} onChange={e => setMenuForm(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Category</label>
                  <select value={menuForm.category_id} onChange={e => setMenuForm(p => ({ ...p, category_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                    <option value="">-- Select --</option>
                    {allCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={menuForm.is_available} onChange={e => setMenuForm(p => ({ ...p, is_available: e.target.checked }))} />
                Available (visible in POS)
              </label>
              <div className="flex gap-2">
                <button type="submit" className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-lg">
                  {editingItem ? 'Save Changes' : 'Add Item'}
                </button>
                {editingItem && (
                  <button type="button" onClick={() => { setEditingItem(null); setMenuForm({ name: '', price: 0, category_id: '', is_available: true }) }}
                    className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-gray-700">Categories</div>
                <button onClick={() => setShowCatForm(!showCatForm)} className="text-xs text-blue-600 hover:text-blue-800">+ Add</button>
              </div>
              {showCatForm && (
                <form onSubmit={saveCategory} className="flex gap-2 mb-2">
                  <input value={catForm} onChange={e => setCatForm(e.target.value)} placeholder="Category name"
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
                  <button type="submit" className="px-3 py-1.5 bg-blue-700 text-white text-xs rounded-lg">Save</button>
                </form>
              )}
              <div className="space-y-1">
                {allCategories.map(c => (
                  <div key={c.id} className="text-sm text-gray-600 px-2 py-1 bg-gray-50 rounded">{c.name}</div>
                ))}
              </div>
            </div>
          </div>

          {/* All items list */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5">Item</th>
                  <th className="text-left px-4 py-2.5">Category</th>
                  <th className="text-left px-4 py-2.5">Price</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-left px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2">{item.name}</td>
                    <td className="px-4 py-2 text-gray-500">{(item.menu_categories as any)?.name ?? '—'}</td>
                    <td className="px-4 py-2">₱{Number(item.price).toLocaleString()}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${item.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {item.is_available ? 'Available' : 'Hidden'}
                      </span>
                    </td>
                    <td className="px-4 py-2 flex gap-1.5">
                      <button onClick={() => { setEditingItem(item); setMenuForm({ name: item.name, price: item.price, category_id: item.category_id, is_available: item.is_available }) }}
                        className="text-xs text-gray-400 hover:text-gray-600">Edit</button>
                      <button onClick={() => toggleAvailable(item)}
                        className="text-xs text-gray-400 hover:text-gray-600">{item.is_available ? 'Hide' : 'Show'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* POS interface */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Menu */}
          <div className="md:col-span-2">
            <div className="flex gap-2 mb-3 flex-wrap">
              {availableCatNames.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${activeCategory === cat ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {cat}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {visibleItems.map(item => (
                <button key={item.id} onClick={() => addToCart(item)}
                  className="bg-white border border-gray-100 hover:border-blue-200 hover:bg-blue-50 rounded-xl p-3 text-left transition-colors">
                  <div className="text-sm font-medium text-gray-700">{item.name}</div>
                  <div className="text-xs text-blue-600 font-medium mt-1">₱{Number(item.price).toLocaleString()}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Cart + Payment */}
          <div className="space-y-3">
            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <div className="text-sm font-medium text-gray-700 mb-2">Order</div>

              {/* Guest name for walk-in */}
              {!chargeToBooking && (
                <div className="mb-2">
                  <input value={walkInGuestName} onChange={e => setWalkInGuestName(e.target.value)}
                    placeholder="Guest name (optional)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white" />
                </div>
              )}

              {cart.length === 0 ? (
                <div className="text-center py-6 text-gray-300 text-xs">No items in cart.</div>
              ) : (
                <div className="space-y-1.5 mb-3 max-h-40 overflow-y-auto">
                  {cart.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 text-gray-700 text-xs">{c.name}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQty(c.id, c.qty - 1)}
                          className="w-5 h-5 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 text-xs">−</button>
                        <span className="text-xs w-4 text-center">{c.qty}</span>
                        <button onClick={() => updateQty(c.id, c.qty + 1)}
                          className="w-5 h-5 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 text-xs">+</button>
                      </div>
                      <span className="text-xs text-gray-500 w-16 text-right">₱{(c.price * c.qty).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between text-sm font-medium text-gray-700 border-t border-gray-100 pt-2 mb-3">
                <span>Total</span>
                <span>₱{subtotal.toLocaleString()}</span>
              </div>

              {/* Charge to room OR direct payment */}
              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1">Charge to room (optional)</label>
                <select value={chargeToBooking} onChange={e => setChargeToBooking(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white">
                  <option value="">Direct payment (walk-in)</option>
                  {activeBookings.map(b => (
                    <option key={b.id} value={b.id}>
                      {(b.guests as any)?.full_name} — {(b.rooms as any) ? `Room ${(b.rooms as any).room_number}` : b.booking_number}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment calculator — only for direct payment */}
              {!chargeToBooking && (
                <PaymentCalculator
                  totalDue={subtotal}
                  method={paymentMethod}
                  onMethodChange={setPaymentMethod}
                  amountTendered={amountTendered}
                  onAmountTenderedChange={setAmountTendered}
                />
              )}

              {chargeToBooking && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 text-xs text-amber-700 mb-3">
                  Will be added to the room bill — collected at check-out.
                </div>
              )}

              <button onClick={processPayment} disabled={loading || cart.length === 0}
                className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm rounded-lg mt-3">
                {loading ? 'Processing...' : chargeToBooking ? 'Charge to Room' : `Process Payment ₱${subtotal.toLocaleString()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
