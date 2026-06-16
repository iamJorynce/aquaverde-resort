'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface MenuItem {
  id: string
  name: string
  price: number
  category_id: string
  menu_categories: { name: string } | null
}

interface CartItem {
  id: string
  name: string
  price: number
  qty: number
}

export default function POSPage() {
  const supabase = createClient()
  const [items, setItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [activeBookings, setActiveBookings] = useState<any[]>([])
  const [chargeToBooking, setChargeToBooking] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    async function load() {
      const { data: menuItems } = await supabase
        .from('menu_items')
        .select('id, name, price, category_id, menu_categories(name)')
        .eq('is_available', true)
        .order('name')

      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, booking_number, guests(full_name), rooms(room_number)')
        .eq('status', 'checked_in')

      const list = (menuItems as any) ?? []
      setItems(list)
      const cats = Array.from(new Set(list.map((i: any) => i.menu_categories?.name).filter(Boolean))) as string[]
      setCategories(cats)
      if (cats.length) setActiveCategory(cats[0])
      setActiveBookings(bookings ?? [])
    }
    load()
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function addToCart(item: MenuItem) {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id)
      if (existing) {
        return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c)
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }]
    })
  }

  function changeQty(id: string, delta: number) {
    setCart(prev => prev
      .map(c => c.id === id ? { ...c, qty: c.qty + delta } : c)
      .filter(c => c.qty > 0)
    )
  }

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0)

  async function processPayment() {
    if (cart.length === 0) { showToast('Walay items sa cart.'); return }
    setLoading(true)

    try {
      const orderNumber = `ORD-${Date.now()}`
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber,
          booking_id: chargeToBooking || null,
          order_type: 'dine_in',
          status: 'pending',
          subtotal,
          total: subtotal,
          payment_method: chargeToBooking ? 'room_charge' : paymentMethod,
        })
        .select()
        .single()

      if (orderError) throw orderError

      await supabase.from('order_items').insert(
        cart.map(c => ({
          order_id: order.id,
          menu_item_id: c.id,
          quantity: c.qty,
          unit_price: c.price,
        }))
      )

      if (chargeToBooking) {
        await supabase.from('booking_addons').insert({
          booking_id: chargeToBooking,
          name: `POS Order #${orderNumber}`,
          quantity: 1,
          unit_price: subtotal,
        })
      } else {
        await supabase.from('transactions').insert({
          txn_number: `TXN-${Date.now()}`,
          txn_type: 'pos',
          description: `POS Order #${orderNumber}`,
          amount: subtotal,
          payment_method: paymentMethod,
        })
      }

      showToast(`Order ${orderNumber} processed! ₱${subtotal.toLocaleString()}`)
      setCart([])
      setChargeToBooking('')
    } catch (err: any) {
      showToast('Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredItems = items.filter(i => i.menu_categories?.name === activeCategory)

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50 max-w-xs">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Menu */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-700 mb-3">Menu Items</div>

          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-3 overflow-x-auto">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  activeCategory === cat ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="space-y-1 max-h-96 overflow-y-auto">
            {filteredItems.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-xs">Walay items niini nga category.</div>
            ) : filteredItems.map(item => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                <div>
                  <div className="text-sm font-medium text-gray-700">{item.name}</div>
                  <div className="text-xs text-gray-400">₱{item.price}</div>
                </div>
                <button
                  onClick={() => addToCart(item)}
                  className="px-3 py-1 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg"
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Cart */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-700 mb-3">Order Summary</div>

          <div className="min-h-[160px] mb-3">
            {cart.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-xs">Walay items sa cart</div>
            ) : cart.map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                <div>
                  <div className="text-sm font-medium text-gray-700">{c.name}</div>
                  <div className="text-xs text-gray-400">₱{c.price} × {c.qty}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => changeQty(c.id, -1)} className="w-6 h-6 rounded-full border border-gray-200 text-sm flex items-center justify-center">−</button>
                  <span className="text-sm w-5 text-center">{c.qty}</span>
                  <button onClick={() => changeQty(c.id, 1)} className="w-6 h-6 rounded-full border border-gray-200 text-sm flex items-center justify-center">+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-blue-50 rounded-lg p-3 mb-3">
            <div className="flex justify-between text-sm font-semibold text-blue-700">
              <span>Total</span>
              <span>₱{subtotal.toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-2 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
                disabled={!!chargeToBooking}
              >
                <option value="cash">Cash</option>
                <option value="gcash">GCash</option>
                <option value="maya">Maya</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="credit_card">Credit Card</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Charge to Room (optional)</label>
              <select
                value={chargeToBooking}
                onChange={e => setChargeToBooking(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
              >
                <option value="">— Walk-in / Direct —</option>
                {activeBookings.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.rooms ? `Room ${(b.rooms as any).room_number}` : b.booking_number} — {(b.guests as any)?.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={processPayment}
              disabled={loading || cart.length === 0}
              className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg"
            >
              {loading ? 'Processing...' : 'Process Payment'}
            </button>
            <button
              onClick={() => setCart([])}
              className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
