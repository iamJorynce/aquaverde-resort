'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from './permissions'

export default function InventoryPage() {
  const supabase = createClient()
  const { can } = usePermissions()
  const canManage = can('canManageInventoryCatalog')
  const [items, setItems] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [stockModal, setStockModal] = useState<any>(null)
  const [stockAmount, setStockAmount] = useState(0)
  const [stockType, setStockType] = useState<'in' | 'out'>('in')
  const [showItemForm, setShowItemForm] = useState(false)
  const [itemForm, setItemForm] = useState({
    name: '', category_id: '', unit: 'pcs', current_stock: 0, reorder_level: 10,
  })

  async function load() {
    setLoading(true)
    const [{ data: itemData }, { data: catData }] = await Promise.all([
      supabase.from('inventory_items').select('*, inventory_categories(name)').eq('is_active', true).order('name'),
      supabase.from('inventory_categories').select('*').order('name'),
    ])
    setItems(itemData ?? [])
    setCategories(catData ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function getStatus(item: any) {
    if (item.current_stock <= item.reorder_level) return { label: 'Low Stock', cls: 'bg-red-100 text-red-700' }
    if (item.current_stock <= item.reorder_level * 1.5) return { label: 'Monitor', cls: 'bg-yellow-100 text-yellow-700' }
    return { label: 'OK', cls: 'bg-green-100 text-green-700' }
  }

  async function submitMovement() {
    if (!stockModal || stockAmount <= 0) return

    const { error } = await supabase.from('inventory_movements').insert({
      item_id: stockModal.id,
      movement_type: stockType,
      quantity: stockAmount,
    })

    if (error) { showToast('Error: ' + error.message); return }
    showToast(`${stockType === 'in' ? 'Stock in' : 'Stock out'} recorded for ${stockModal.name}.`)
    setStockModal(null)
    setStockAmount(0)
    load()
  }

  function openNewItem() {
    setItemForm({ name: '', category_id: categories[0]?.id ?? '', unit: 'pcs', current_stock: 0, reorder_level: 10 })
    setShowItemForm(true)
  }

  async function createItem(e: React.FormEvent) {
    e.preventDefault()
    if (!itemForm.name) { showToast('Item name is required.'); return }

    const { error } = await supabase.from('inventory_items').insert(itemForm)
    if (error) { showToast('Error: ' + error.message); return }
    showToast(`${itemForm.name} added to inventory.`)
    setShowItemForm(false)
    load()
  }

  async function deactivateItem(item: any) {
    if (!confirm(`Remove "${item.name}" from inventory? It will be hidden but movement history is kept.`)) return
    const { error } = await supabase.from('inventory_items').update({ is_active: false }).eq('id', item.id)
    if (error) { showToast('Error: ' + error.message); return }
    showToast(`${item.name} removed.`)
    load()
  }

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-medium text-gray-700">{items.length} Items</div>
        {canManage && (
          <button onClick={openNewItem} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg">
            + Add Item
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5">Item</th>
                <th className="text-left px-4 py-2.5">Category</th>
                <th className="text-left px-4 py-2.5">Stock</th>
                <th className="text-left px-4 py-2.5">Reorder Lvl</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-xs">No items found.</td></tr>
              ) : items.map(i => {
                const status = getStatus(i)
                return (
                  <tr key={i.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-700">{i.name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{(i.inventory_categories as any)?.name ?? '—'}</td>
                    <td className="px-4 py-2.5">{i.current_stock} {i.unit}</td>
                    <td className="px-4 py-2.5 text-gray-500">{i.reorder_level} {i.unit}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.cls}`}>{status.label}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => { setStockModal(i); setStockType('in') }}
                        className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg mr-1">
                        Stock In
                      </button>
                      <button onClick={() => { setStockModal(i); setStockType('out') }}
                        className="px-2.5 py-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs rounded-lg mr-1">
                        Stock Out
                      </button>
                      {canManage && (
                        <button onClick={() => deactivateItem(i)}
                          className="px-2.5 py-1 text-red-400 hover:text-red-600 text-xs">
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {stockModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setStockModal(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-3">
              {stockType === 'in' ? 'Stock In' : 'Stock Out'} — {stockModal.name}
            </div>
            <div className="text-xs text-gray-500 mb-2">Current stock: {stockModal.current_stock} {stockModal.unit}</div>
            <input
              type="number"
              value={stockAmount}
              onChange={e => setStockAmount(parseFloat(e.target.value) || 0)}
              placeholder={`Quantity (${stockModal.unit})`}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white mb-3"
            />
            <div className="flex gap-2">
              <button onClick={submitMovement}
                className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-lg">
                Confirm
              </button>
              <button onClick={() => setStockModal(null)}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {showItemForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowItemForm(false)}>
          <form onSubmit={createItem} className="bg-white rounded-xl p-5 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-1">Add Inventory Item</div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Item Name</label>
              <input value={itemForm.name} onChange={e => setItemForm(p => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <select value={itemForm.category_id} onChange={e => setItemForm(p => ({ ...p, category_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                <option value="">-- Select --</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Unit</label>
                <input value={itemForm.unit} onChange={e => setItemForm(p => ({ ...p, unit: e.target.value }))}
                  placeholder="pcs" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Initial Stock</label>
                <input type="number" value={itemForm.current_stock} onChange={e => setItemForm(p => ({ ...p, current_stock: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Reorder Lvl</label>
                <input type="number" value={itemForm.reorder_level} onChange={e => setItemForm(p => ({ ...p, reorder_level: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-lg">
                Add Item
              </button>
              <button type="button" onClick={() => setShowItemForm(false)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
