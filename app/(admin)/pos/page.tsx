'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface MenuItem {
  id: string
  name: string
  description: string | null
  price: number
  category: string
  category_id: string | null
  image_url: string | null
  max_qty: number | null   // null = no stock constraint
}

interface CartItem extends MenuItem {
  quantity: number
  notes: string
}

type OrderType = 'dine_in' | 'takeout' | 'room_charge'
type PaymentMethod = 'cash' | 'gcash' | 'card' | 'room_charge'

/* ─── POS Page ───────────────────────────────────────────────────────────── */

export default function POSPage() {
  const supabase = createClient()

  // Menu state
  const [items, setItems]           = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [activeCategory, setCategory] = useState<string>('All')
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  // Cart state
  const [cart, setCart]             = useState<CartItem[]>([])
  const [discount, setDiscount]     = useState(0)
  const [orderType, setOrderType]   = useState<OrderType>('dine_in')
  const [payMethod, setPayMethod]   = useState<PaymentMethod>('cash')
  const [tableNo, setTableNo]       = useState('')
  const [bookingId, setBookingId]   = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess]       = useState<string | null>(null)

  // Cart panel visibility on mobile
  const [cartOpen, setCartOpen]     = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)

  /* ── Fetch available menu items ─────────────────────────────────────── */
  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      const res = await fetch(`/api/pos/menu-items?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load menu')
      const fetched: MenuItem[] = json.data ?? []
      setItems(fetched)

      // Build category list from fetched items
      const cats = Array.from(new Set(fetched.map(i => i.category))).sort()
      setCategories(cats)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { fetchItems() }, [fetchItems])

  /* ── Derived values ──────────────────────────────────────────────────── */
  const displayed = activeCategory === 'All'
    ? items
    : items.filter(i => i.category === activeCategory)

  const cartTotal   = cart.reduce((s, i) => s + i.price * i.quantity, 0)
  const cartCount   = cart.reduce((s, i) => s + i.quantity, 0)
  const totalAfterDiscount = Math.max(0, cartTotal - discount)

  /* ── Cart helpers ────────────────────────────────────────────────────── */
  function addToCart(item: MenuItem) {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id)
      if (existing) {
        const newQty = existing.quantity + 1
        if (item.max_qty !== null && newQty > item.max_qty) return prev  // cap at stock
        return prev.map(c => c.id === item.id ? { ...c, quantity: newQty } : c)
      }
      return [...prev, { ...item, quantity: 1, notes: '' }]
    })
  }

  function removeFromCart(id: string) {
    setCart(prev => prev.filter(c => c.id !== id))
  }

  function changeQty(id: string, delta: number) {
    setCart(prev => prev
      .map(c => {
        if (c.id !== id) return c
        const newQty = c.quantity + delta
        if (newQty <= 0) return c  // handled by remove button
        if (c.max_qty !== null && newQty > c.max_qty) return c
        return { ...c, quantity: newQty }
      })
    )
  }

  function clearCart() {
    setCart([])
    setDiscount(0)
    setTableNo('')
    setBookingId('')
    setOrderNotes('')
    setOrderType('dine_in')
    setPayMethod('cash')
  }

  /* ── Submit order ────────────────────────────────────────────────────── */
  async function submitOrder() {
    if (cart.length === 0) return
    setSubmitting(true)
    setError('')
    try {
      const body = {
        items: cart.map(c => ({
          menu_item_id: c.id,
          quantity:     c.quantity,
          unit_price:   c.price,
          notes:        c.notes || undefined,
        })),
        order_type:     orderType,
        payment_method: orderType === 'room_charge' ? 'room_charge' : payMethod,
        discount,
        table_number:   tableNo || undefined,
        booking_id:     bookingId || undefined,
        notes:          orderNotes || undefined,
      }

      const res = await fetch('/api/pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Order failed')

      setSuccess(`Order #${json.data?.order_number ?? '—'} placed!`)
      clearCart()
      fetchItems()   // refresh stock availability
      setTimeout(() => setSuccess(null), 5000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  /* ─────────────────────────────────────────────────────────────────────── */
  return (
    <div className="flex h-screen bg-[#f5f6fa] overflow-hidden">

      {/* ── LEFT: Menu panel ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-100">
          <div className="flex-1">
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search items…"
              className="w-full max-w-xs px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
            />
          </div>
          <button
            onClick={fetchItems}
            className="text-xs text-blue-600 hover:text-blue-800 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors"
          >
            ↻ Refresh
          </button>
          {/* Mobile cart toggle */}
          <button
            onClick={() => setCartOpen(o => !o)}
            className="relative md:hidden bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Cart
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 px-5 py-3 bg-white border-b border-gray-100 overflow-x-auto scrollbar-none">
          {['All', ...categories].map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Alerts */}
        {error && (
          <div className="mx-5 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
            <button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-red-600">✕</button>
          </div>
        )}
        {success && (
          <div className="mx-5 mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">
            ✓ {success}
          </div>
        )}

        {/* Item grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading available items…</div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <div className="text-4xl mb-2">🍽️</div>
              <div className="text-sm">
                {search ? `No results for "${search}"` : 'No items available right now'}
              </div>
              <div className="text-xs mt-1 text-gray-300">Items appear here only when they have stock in inventory</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {displayed.map(item => {
                const inCart = cart.find(c => c.id === item.id)
                const atMax  = item.max_qty !== null && (inCart?.quantity ?? 0) >= item.max_qty
                return (
                  <button
                    key={item.id}
                    onClick={() => !atMax && addToCart(item)}
                    disabled={atMax}
                    className={`relative text-left bg-white rounded-xl p-3 border transition-all active:scale-95 ${
                      atMax
                        ? 'border-gray-100 opacity-50 cursor-not-allowed'
                        : 'border-gray-100 hover:border-blue-300 hover:shadow-md cursor-pointer'
                    } ${inCart ? 'ring-2 ring-blue-400' : ''}`}
                  >
                    {/* Thumbnail */}
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full aspect-square object-cover rounded-lg mb-2 bg-gray-100"
                      />
                    ) : (
                      <div className="w-full aspect-square rounded-lg mb-2 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center text-2xl">
                        🍽️
                      </div>
                    )}

                    <div className="text-xs font-semibold text-gray-800 leading-tight mb-0.5 truncate">{item.name}</div>
                    <div className="text-xs text-gray-400 truncate mb-1">{item.category}</div>
                    <div className="text-sm font-bold text-blue-700">₱{item.price.toLocaleString()}</div>

                    {/* Stock row — shows remaining qty below price */}
                    <div className="mt-1 flex items-center gap-1">
                      {item.max_qty !== null ? (
                        <div className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          atMax
                            ? 'bg-red-100 text-red-600'
                            : item.max_qty <= 5
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {atMax ? 'Sold out' : `Stock: ${item.max_qty}`}
                        </div>
                      ) : (
                        <div className="text-[10px] text-gray-300">In stock</div>
                      )}
                    </div>

                    {/* Cart qty badge */}
                    {inCart && (
                      <div className="absolute top-2 left-2 bg-blue-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                        {inCart.quantity}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Cart panel ────────────────────────────────────────────── */}
      <div className={`
        fixed inset-y-0 right-0 z-30 w-80 bg-white border-l border-gray-100 flex flex-col shadow-xl transition-transform duration-200
        md:relative md:translate-x-0 md:shadow-none md:z-auto
        ${cartOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        {/* Cart header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">
            Current Order
            {cartCount > 0 && (
              <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                {cartCount} item{cartCount !== 1 ? 's' : ''}
              </span>
            )}
          </h2>
          <div className="flex gap-2">
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setCartOpen(false)}
              className="md:hidden text-gray-400 hover:text-gray-600 px-2 py-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Order type selector */}
        <div className="px-4 pt-3 pb-2">
          <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-lg p-1">
            {(['dine_in', 'takeout', 'room_charge'] as OrderType[]).map(type => (
              <button
                key={type}
                onClick={() => {
                  setOrderType(type)
                  if (type === 'room_charge') setPayMethod('room_charge')
                  else if (payMethod === 'room_charge') setPayMethod('cash')
                }}
                className={`py-1 rounded-md text-xs font-medium transition-colors ${
                  orderType === type ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {type === 'dine_in' ? 'Dine In' : type === 'takeout' ? 'Takeout' : 'Room'}
              </button>
            ))}
          </div>
        </div>

        {/* Table / Room inputs */}
        <div className="px-4 pb-2 flex gap-2">
          {orderType === 'dine_in' && (
            <input
              value={tableNo}
              onChange={e => setTableNo(e.target.value)}
              placeholder="Table #"
              className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          )}
          {orderType === 'room_charge' && (
            <input
              value={bookingId}
              onChange={e => setBookingId(e.target.value)}
              placeholder="Booking ID"
              className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-300">
              <div className="text-3xl mb-1">🛒</div>
              <div className="text-xs">Tap an item to add</div>
            </div>
          ) : (
            cart.map(c => (
              <div key={c.id} className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-800 truncate">{c.name}</div>
                    <div className="text-xs text-blue-700 font-medium">₱{(c.price * c.quantity).toLocaleString()}</div>
                  </div>
                  <button
                    onClick={() => removeFromCart(c.id)}
                    className="text-gray-300 hover:text-red-400 text-sm flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>

                {/* Qty controls */}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => c.quantity === 1 ? removeFromCart(c.id) : changeQty(c.id, -1)}
                    className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-bold flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="text-sm font-semibold text-gray-800 w-4 text-center">{c.quantity}</span>
                  <button
                    onClick={() => changeQty(c.id, 1)}
                    disabled={c.max_qty !== null && c.quantity >= c.max_qty}
                    className="w-6 h-6 rounded-full bg-blue-100 hover:bg-blue-200 disabled:opacity-30 text-blue-700 text-sm font-bold flex items-center justify-center"
                  >
                    +
                  </button>
                  {c.max_qty !== null && c.quantity >= c.max_qty && (
                    <span className="text-[10px] text-amber-500 font-medium">max stock</span>
                  )}
                </div>

                {/* Item notes */}
                <input
                  value={c.notes}
                  onChange={e => setCart(prev => prev.map(x => x.id === c.id ? { ...x, notes: e.target.value } : x))}
                  placeholder="Special instructions…"
                  className="mt-2 w-full px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                />
              </div>
            ))
          )}
        </div>

        {/* Totals & payment */}
        {cart.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 space-y-3">
            {/* Discount */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 flex-shrink-0">Discount ₱</label>
              <input
                type="number"
                min={0}
                value={discount || ''}
                onChange={e => setDiscount(Math.max(0, Number(e.target.value)))}
                placeholder="0"
                className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 text-right"
              />
            </div>

            {/* Subtotal / total */}
            <div className="space-y-1">
              {discount > 0 && (
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Subtotal</span>
                  <span>₱{cartTotal.toLocaleString()}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-xs text-green-600">
                  <span>Discount</span>
                  <span>−₱{discount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-gray-900">
                <span>Total</span>
                <span className="text-blue-700">₱{totalAfterDiscount.toLocaleString()}</span>
              </div>
            </div>

            {/* Payment method (hidden for room charge) */}
            {orderType !== 'room_charge' && (
              <div className="grid grid-cols-3 gap-1">
                {(['cash', 'gcash', 'card'] as PaymentMethod[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setPayMethod(m)}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      payMethod === m
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-200 text-gray-500 hover:border-blue-300'
                    }`}
                  >
                    {m === 'cash' ? '💵 Cash' : m === 'gcash' ? '📱 GCash' : '💳 Card'}
                  </button>
                ))}
              </div>
            )}

            {/* Order notes */}
            <input
              value={orderNotes}
              onChange={e => setOrderNotes(e.target.value)}
              placeholder="Order notes (optional)…"
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300"
            />

            {/* Place order */}
            <button
              onClick={submitOrder}
              disabled={submitting || cart.length === 0}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-3 rounded-xl text-sm font-bold transition-colors"
            >
              {submitting ? 'Placing order…' : `Place Order · ₱${totalAfterDiscount.toLocaleString()}`}
            </button>
          </div>
        )}
      </div>

      {/* Mobile cart backdrop */}
      {cartOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 md:hidden"
          onClick={() => setCartOpen(false)}
        />
      )}
    </div>
  )
}
