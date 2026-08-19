import { create } from 'zustand'

interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
  notes?: string
}

interface POSStore {
  cart: CartItem[]
  addItem: (item: Omit<CartItem, 'quantity'>) => void
  removeItem: (id: string) => void
  updateQty: (id: string, qty: number) => void
  clearCart: () => void
  subtotal: () => number
  chargeToBookingId: string | null
  setChargeToBooking: (id: string | null) => void
  discount: number
  setDiscount: (d: number) => void
}

export const usePOSStore = create<POSStore>((set, get) => ({
  cart: [],
  chargeToBookingId: null,
  discount: 0,

  addItem: (item) => set(state => {
    const existing = state.cart.find(c => c.id === item.id)
    if (existing) {
      return { cart: state.cart.map(c =>
        c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
      )}
    }
    return { cart: [...state.cart, { ...item, quantity: 1 }] }
  }),

  removeItem: (id) => set(state => ({
    cart: state.cart.filter(c => c.id !== id)
  })),

  updateQty: (id, qty) => set(state => ({
    cart: qty <= 0
      ? state.cart.filter(c => c.id !== id)
      : state.cart.map(c => c.id === id ? { ...c, quantity: qty } : c)
  })),

  clearCart: () => set({ cart: [], discount: 0, chargeToBookingId: null }),

  subtotal: () => get().cart.reduce((sum, c) => sum + c.price * c.quantity, 0),

  setChargeToBooking: (id) => set({ chargeToBookingId: id }),

  setDiscount: (d) => set({ discount: d }),
}))
