'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { printReceipt } from './receipt'
import PaymentCalculator, { isPaymentValid, paymentValidationMessage } from './PaymentCalculator'
import { logActivity } from './activityLog'
import { usePermissions } from './permissions'

interface MenuItem { id: string; name: string; price: number; category_id: string; is_available: boolean; direct_inventory_item_id: string | null; menu_categories: { name: string; id: string } | null }
interface CartItem  { id: string; name: string; price: number; qty: number }
interface InventoryItemLite { id: string; name: string; current_stock: number; unit: string }
interface RecipeRow { id: string; menu_item_id: string; inventory_item_id: string; quantity_per_unit: number; inventory_items: { name: string; current_stock: number; unit: string } | null }
interface DirectStockInfo { inventory_item_id: string; name: string; current_stock: number; unit: string }

export default function POSPage() {
  const supabase = createClient()
  const { role } = usePermissions()
  const isAdmin = role === 'super_admin' || role === 'resort_owner'

  const [hasActiveShift, setHasActiveShift] = useState<boolean | null>(null)
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
  const [editingCat, setEditingCat] = useState<{ id: string; name: string } | null>(null)

  // Recipe / ingredients (optional link to Inventory — enables stock check + auto-deduct on sale)
  const [inventoryItems, setInventoryItems] = useState<InventoryItemLite[]>([])
  const [recipes, setRecipes] = useState<Record<string, RecipeRow[]>>({})
  const [ingredientForm, setIngredientForm] = useState({ inventory_item_id: '', quantity_per_unit: 1 })
  const [savingIngredient, setSavingIngredient] = useState(false)

  // Direct Stock (merchandise — always exactly 1:1, no recipe needed).
  // Keyed by menu_item_id so the editor can show the current link at a glance.
  const [directStock, setDirectStock] = useState<Record<string, DirectStockInfo>>({})
  const [directStockForm, setDirectStockForm] = useState('')
  const [savingDirectStock, setSavingDirectStock] = useState(false)

  async function load() {
    const [{ data: menuItems }, { data: bookings }, { data: cats }, { data: invItems }, { data: recipeRows }] = await Promise.all([
      // Cast: direct_inventory_item_id isn't in the generated Database types
      // yet — run `npx supabase gen types typescript` after the migration,
      // then this cast can be removed.
      (supabase as any).from('menu_items').select('id, name, price, category_id, is_available, direct_inventory_item_id, inventory_items(id, name, current_stock, unit), menu_categories(id, name)').order('name'),
      supabase.from('bookings').select('id, booking_number, accommodation_type, guests(full_name), rooms(room_number)').eq('status', 'checked_in'),
      supabase.from('menu_categories').select('id, name').order('name'),
      supabase.from('inventory_items').select('id, name, current_stock, unit').eq('is_active', true).order('name'),
      supabase.from('menu_item_ingredients').select('id, menu_item_id, inventory_item_id, quantity_per_unit, inventory_items(name, current_stock, unit)'),
    ])
    const list = (menuItems as any) ?? []
    setItems(list)

    const directMap: Record<string, DirectStockInfo> = {}
    list.forEach((i: any) => {
      if (i.direct_inventory_item_id && i.inventory_items) {
        directMap[i.id] = {
          inventory_item_id: i.direct_inventory_item_id,
          name: i.inventory_items.name,
          current_stock: i.inventory_items.current_stock,
          unit: i.inventory_items.unit,
        }
      }
    })
    setDirectStock(directMap)
    setAllCategories(cats ?? [])
    const catNames = Array.from(new Set(list.filter((i: any) => i.is_available).map((i: any) => i.menu_categories?.name).filter(Boolean))) as string[]
    if (catNames.length && !catNames.includes(activeCategory)) setActiveCategory(catNames[0])
    setActiveBookings(bookings ?? [])
    setInventoryItems(invItems ?? [])

    const recipeMap: Record<string, RecipeRow[]> = {}
    ;((recipeRows as any) ?? []).forEach((r: RecipeRow) => {
      if (!recipeMap[r.menu_item_id]) recipeMap[r.menu_item_id] = []
      recipeMap[r.menu_item_id].push(r)
    })
    setRecipes(recipeMap)

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

  // For cart items that have a recipe (menu_item_ingredients) and/or a direct
  // stock link (direct_inventory_item_id — merchandise, always 1:1), compute
  // how much of each inventory item the current cart would consume, and
  // whether that exceeds what's currently in stock. Items with neither are
  // skipped — the inventory link is optional per menu item.
  function getStockRequirements() {
    const required: Record<string, { qty: number; name: string; unit: string; available: number }> = {}

    function addRequirement(key: string, need: number, name: string, unit: string, available: number) {
      if (!required[key]) required[key] = { qty: 0, name, unit, available }
      required[key].qty += need
    }

    for (const c of cart) {
      const ingredients = recipes[c.id] ?? []
      for (const ing of ingredients) {
        addRequirement(
          ing.inventory_item_id,
          ing.quantity_per_unit * c.qty,
          ing.inventory_items?.name ?? 'item',
          ing.inventory_items?.unit ?? '',
          ing.inventory_items?.current_stock ?? 0
        )
      }

      const direct = directStock[c.id]
      if (direct) {
        addRequirement(direct.inventory_item_id, c.qty, direct.name, direct.unit, direct.current_stock)
      }
    }
    return required
  }

  async function processPayment() {
    if (cart.length === 0) { showToast('No items in cart.'); return }

    // For direct payment (not room charge), validate cash amount
    if (!chargeToBooking) {
      const paymentError = paymentValidationMessage(paymentMethod, subtotal, amountTendered)
      if (paymentError) { showToast(paymentError); return }
    }

    // Block checkout if any recipe-linked ingredient doesn't have enough stock.
    const required = getStockRequirements()
    const insufficient = Object.values(required).filter(r => r.qty > r.available)
    if (insufficient.length > 0) {
      showToast(
        `Not enough stock — ${insufficient.map(r =>
          `${r.name} (need ${r.qty}${r.unit}, have ${r.available}${r.unit})`
        ).join(', ')}`
      )
      return
    }

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

      // Auto-deduct inventory stock for any recipe-linked ingredients consumed
      // by this order (movement rows — actual current_stock updates the same
      // way manual Stock Out does in the Inventory module).
      const movementRows = Object.entries(required).map(([inventory_item_id, r]) => ({
        item_id: inventory_item_id,
        movement_type: 'out' as const,
        quantity: r.qty,
        reference: orderNumber,
        notes: `POS sale — ${orderNumber}`,
      }))
      if (movementRows.length > 0) {
        await supabase.from('inventory_movements').insert(movementRows)
      }

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
          status: 'completed',
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
      load() // refresh inventory stock levels shown in the recipe editor
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

  async function removeMenuItem(item: any) {
    if (!confirm(`Delete "${item.name}"? This can't be undone.`)) return
    const { error } = await supabase.from('menu_items').delete().eq('id', item.id)
    if (error) {
      // Likely a foreign-key conflict — this item has past orders tied to it.
      if (error.code === '23503') {
        showToast(`Can't delete "${item.name}" — it has past orders on record. Hide it instead to remove it from the POS.`)
      } else {
        showToast('Error: ' + error.message)
      }
      return
    }
    showToast(`${item.name} deleted.`)
    if (editingItem?.id === item.id) { setEditingItem(null); setMenuForm({ name: '', price: 0, category_id: '', is_available: true }) }
    load()
  }

  async function addIngredient() {
    if (!editingItem) return
    if (!ingredientForm.inventory_item_id || ingredientForm.quantity_per_unit <= 0) {
      showToast('Select an inventory item and a valid quantity.'); return
    }
    setSavingIngredient(true)
    const { error } = await supabase.from('menu_item_ingredients').insert({
      menu_item_id: editingItem.id,
      inventory_item_id: ingredientForm.inventory_item_id,
      quantity_per_unit: ingredientForm.quantity_per_unit,
    })
    setSavingIngredient(false)
    if (error) { showToast('Error: ' + error.message); return }
    setIngredientForm({ inventory_item_id: '', quantity_per_unit: 1 })
    load()
  }

  async function removeIngredient(id: string) {
    const { error } = await supabase.from('menu_item_ingredients').delete().eq('id', id)
    if (error) { showToast('Error: ' + error.message); return }
    load()
  }

  // Direct Stock (merchandise — t-shirts, bottled water, souvenirs). Always
  // exactly 1:1 with the inventory item, so there's no quantity to set —
  // just pick the item and link it.
  async function setDirectStockLink() {
    if (!editingItem || !directStockForm) return
    setSavingDirectStock(true)
    const { error } = await (supabase as any)
      .from('menu_items')
      .update({ direct_inventory_item_id: directStockForm })
      .eq('id', editingItem.id)
    setSavingDirectStock(false)
    if (error) { showToast('Error: ' + error.message); return }
    setDirectStockForm('')
    load()
  }

  async function removeDirectStockLink() {
    if (!editingItem) return
    const { error } = await (supabase as any)
      .from('menu_items')
      .update({ direct_inventory_item_id: null })
      .eq('id', editingItem.id)
    if (error) { showToast('Error: ' + error.message); return }
    load()
  }

  async function saveCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!catForm.trim()) return
    if (editingCat) {
      const { error } = await supabase.from('menu_categories').update({ name: catForm.trim() }).eq('id', editingCat.id)
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`Category renamed to "${catForm}".`)
      setEditingCat(null)
      setCatForm('')
      load()
    } else {
      const { error } = await supabase.from('menu_categories').insert({ name: catForm.trim() })
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`Category "${catForm}" added.`)
      setCatForm('')
      setShowCatForm(false)
      load()
    }
  }

  function openEditCategory(cat: { id: string; name: string }) {
    setEditingCat(cat)
    setCatForm(cat.name)
    setShowCatForm(true)
  }

  function cancelEditCategory() {
    setEditingCat(null)
    setCatForm('')
    setShowCatForm(false)
  }

  async function deleteCategory(cat: { id: string; name: string }) {
    const inUse = items.some(i => i.category_id === cat.id)
    if (inUse) {
      showToast(`Can't delete "${cat.name}" — still used by one or more menu items. Move those items to another category first.`)
      return
    }
    if (!confirm(`Delete category "${cat.name}"?`)) return
    const { error } = await supabase.from('menu_categories').delete().eq('id', cat.id)
    if (error) { showToast('Error: ' + error.message); return }
    showToast(`Category "${cat.name}" deleted.`)
    if (editingCat?.id === cat.id) cancelEditCategory()
    load()
  }

  const availableItems = items.filter(i => i.is_available)
  const visibleItems = availableItems.filter(i => i.menu_categories?.name === activeCategory)
  const availableCatNames = Array.from(new Set(availableItems.map(i => i.menu_categories?.name).filter(Boolean))) as string[]

  return (
    <div>
      {hasActiveShift === false && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-red-500 text-lg">🔒</span>
          <div>
            <div className="text-sm font-medium text-red-700">No Active Shift</div>
            <div className="text-xs text-red-500">You must open a shift in the <strong>Remittance</strong> section before processing orders.</div>
          </div>
        </div>
      )}
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

            {/* Direct Stock — for merchandise (t-shirts, bottled water, souvenirs).
                Always exactly 1:1, one pick, no quantity to configure. Hidden once
                a Recipe exists for this item, so the two can't both be set up. */}
            {editingItem && (recipes[editingItem.id] ?? []).length === 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-sm font-medium text-gray-700 mb-1">Direct Stock (optional)</div>
                <div className="text-xs text-gray-400 mb-2">
                  For merchandise, not food — 1 pc deducted per order. Use this instead of Recipe below.
                </div>

                {directStock[editingItem.id] ? (
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 text-xs">
                    <span className="text-gray-700">
                      📦 {directStock[editingItem.id].name} — 1 {directStock[editingItem.id].unit} / order
                    </span>
                    <button onClick={removeDirectStockLink} className="text-red-400 hover:text-red-600">
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <select value={directStockForm}
                      onChange={e => setDirectStockForm(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white">
                      <option value="">-- Inventory item --</option>
                      {inventoryItems.map(i => (
                        <option key={i.id} value={i.id}>{i.name} ({i.current_stock} {i.unit} left)</option>
                      ))}
                    </select>
                    <button onClick={setDirectStockLink} disabled={savingDirectStock || !directStockForm}
                      className="px-3 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-xs rounded-lg whitespace-nowrap">
                      + Link
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Recipe / ingredients — optional. Links this menu item to Inventory
                so the POS can check stock and auto-deduct on sale. Only shown
                once the item exists (editingItem set), and hidden once a Direct
                Stock link exists so the two can't both be set up. */}
            {editingItem && !directStock[editingItem.id] && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-sm font-medium text-gray-700 mb-1">Recipe (optional)</div>
                <div className="text-xs text-gray-400 mb-2">
                  For food with more than one ingredient — link each raw material and how much it uses per order.
                </div>

                {(recipes[editingItem.id] ?? []).length > 0 && (
                  <div className="space-y-1 mb-3">
                    {(recipes[editingItem.id] ?? []).map(r => (
                      <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 text-xs">
                        <span className="text-gray-700">
                          {r.inventory_items?.name ?? 'Item'} — {r.quantity_per_unit} {r.inventory_items?.unit ?? ''} / order
                        </span>
                        <button onClick={() => removeIngredient(r.id)} className="text-red-400 hover:text-red-600">
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <select value={ingredientForm.inventory_item_id}
                    onChange={e => setIngredientForm(p => ({ ...p, inventory_item_id: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white">
                    <option value="">-- Inventory item --</option>
                    {inventoryItems.map(i => (
                      <option key={i.id} value={i.id}>{i.name} ({i.current_stock} {i.unit} left)</option>
                    ))}
                  </select>
                  <input type="number" min={0} step="any" value={ingredientForm.quantity_per_unit}
                    onChange={e => setIngredientForm(p => ({ ...p, quantity_per_unit: parseFloat(e.target.value) || 0 }))}
                    placeholder="Qty"
                    className="w-20 px-2 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white" />
                  <button onClick={addIngredient} disabled={savingIngredient}
                    className="px-3 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-xs rounded-lg whitespace-nowrap">
                    + Add
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-gray-700">Categories</div>
                {!showCatForm && (
                  <button onClick={() => { setEditingCat(null); setCatForm(''); setShowCatForm(true) }}
                    className="text-xs text-blue-600 hover:text-blue-800">+ Add</button>
                )}
              </div>
              {showCatForm && (
                <form onSubmit={saveCategory} className="flex gap-2 mb-2">
                  <input value={catForm} onChange={e => setCatForm(e.target.value)} placeholder="Category name"
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
                  <button type="submit" className="px-3 py-1.5 bg-blue-700 text-white text-xs rounded-lg whitespace-nowrap">
                    {editingCat ? 'Rename' : 'Save'}
                  </button>
                  <button type="button" onClick={cancelEditCategory}
                    className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs rounded-lg">
                    Cancel
                  </button>
                </form>
              )}
              <div className="space-y-1">
                {allCategories.length === 0 ? (
                  <div className="text-xs text-gray-400 text-center py-2">No categories yet.</div>
                ) : allCategories.map(c => (
                  <div key={c.id} className="flex items-center justify-between text-sm text-gray-600 px-2 py-1 bg-gray-50 rounded">
                    <span>{c.name}</span>
                    <div className="flex gap-2">
                      <button onClick={() => openEditCategory(c)} className="text-xs text-gray-400 hover:text-gray-600">Edit</button>
                      <button onClick={() => deleteCategory(c)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                    </div>
                  </div>
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
                      <button onClick={() => removeMenuItem(item)}
                        className="text-xs text-red-400 hover:text-red-600">Delete</button>
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
                  {activeBookings
                    .filter(b => b.accommodation_type !== 'day_use')
                    .map(b => (
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

              <button onClick={processPayment}
                disabled={loading || cart.length === 0 || (!chargeToBooking && !isPaymentValid(paymentMethod, subtotal, amountTendered)) || hasActiveShift === false}
                className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm rounded-lg mt-3">
                {hasActiveShift === false ? '🔒 Open a shift first' : loading ? 'Processing...' : chargeToBooking ? 'Charge to Room' : `Process Payment ₱${subtotal.toLocaleString()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
