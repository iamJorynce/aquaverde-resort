'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const statusColor: Record<string, string> = {
  available:   'bg-green-100 text-green-700',
  occupied:    'bg-red-100 text-red-700',
  reserved:    'bg-blue-100 text-blue-700',
  cleaning:    'bg-yellow-100 text-yellow-700',
  maintenance: 'bg-gray-100 text-gray-700',
  out_of_order:'bg-gray-200 text-gray-800',
}

export default function RoomsPage() {
  const supabase = createClient()
  const [rooms, setRooms] = useState<any[]>([])
  const [roomTypes, setRoomTypes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [filter, setFilter] = useState('')

  const [showRoomForm, setShowRoomForm] = useState(false)
  const [editingRoom, setEditingRoom] = useState<any>(null)
  const [roomForm, setRoomForm] = useState({ room_number: '', room_type_id: '', floor: 1, status: 'available' })

  const [showTypeForm, setShowTypeForm] = useState(false)
  const [editingType, setEditingType] = useState<any>(null)
  const [typeForm, setTypeForm] = useState({ name: '', type: 'standard', base_rate: 0, max_capacity: 2, description: '' })

  async function load() {
    setLoading(true)
    const [{ data: roomData }, { data: typeData }] = await Promise.all([
      supabase.from('rooms').select('*, room_types_config(id, name, base_rate, max_capacity)').order('room_number'),
      supabase.from('room_types_config').select('*').eq('is_active', true).order('base_rate'),
    ])
    setRooms(roomData ?? [])
    setRoomTypes(typeData ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // ---- Room CRUD ----
  function openNewRoom() {
    setEditingRoom(null)
    setRoomForm({ room_number: '', room_type_id: roomTypes[0]?.id ?? '', floor: 1, status: 'available' })
    setShowRoomForm(true)
  }

  function openEditRoom(room: any) {
    setEditingRoom(room)
    setRoomForm({
      room_number: room.room_number,
      room_type_id: room.room_type_id ?? '',
      floor: room.floor ?? 1,
      status: room.status,
    })
    setShowRoomForm(true)
  }

  async function saveRoom(e: React.FormEvent) {
    e.preventDefault()
    if (!roomForm.room_number || !roomForm.room_type_id) {
      showToast('Room number and room type are required.')
      return
    }

    if (editingRoom) {
      const { error } = await supabase.from('rooms').update(roomForm).eq('id', editingRoom.id)
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`Room ${roomForm.room_number} updated.`)
    } else {
      const { error } = await supabase.from('rooms').insert(roomForm)
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`Room ${roomForm.room_number} added.`)
    }

    setShowRoomForm(false)
    load()
  }

  async function deleteRoom(room: any) {
    if (!confirm(`Delete Room ${room.room_number}? This cannot be undone.`)) return
    const { error } = await supabase.from('rooms').delete().eq('id', room.id)
    if (error) { showToast('Error: ' + error.message + ' (room may have linked bookings)'); return }
    showToast(`Room ${room.room_number} deleted.`)
    load()
  }

  // ---- Room Type CRUD ----
  function openNewType() {
    setEditingType(null)
    setTypeForm({ name: '', type: 'standard', base_rate: 0, max_capacity: 2, description: '' })
    setShowTypeForm(true)
  }

  function openEditType(rt: any) {
    setEditingType(rt)
    setTypeForm({
      name: rt.name, type: rt.type, base_rate: rt.base_rate,
      max_capacity: rt.max_capacity, description: rt.description ?? '',
    })
    setShowTypeForm(true)
  }

  async function saveType(e: React.FormEvent) {
    e.preventDefault()
    if (!typeForm.name || typeForm.base_rate <= 0) {
      showToast('Name and a valid rate are required.')
      return
    }

    if (editingType) {
      const { error } = await supabase.from('room_types_config').update(typeForm).eq('id', editingType.id)
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`${typeForm.name} updated.`)
    } else {
      const { error } = await supabase.from('room_types_config').insert(typeForm)
      if (error) { showToast('Error: ' + error.message); return }
      showToast(`${typeForm.name} added.`)
    }

    setShowTypeForm(false)
    load()
  }

  async function deactivateType(rt: any) {
    if (!confirm(`Deactivate "${rt.name}"? Existing rooms keep this type, but it won't appear for new rooms.`)) return
    const { error } = await supabase.from('room_types_config').update({ is_active: false }).eq('id', rt.id)
    if (error) { showToast('Error: ' + error.message); return }
    showToast(`${rt.name} deactivated.`)
    load()
  }

  async function quickStatusChange(roomId: string, status: string) {
    const { error } = await supabase.from('rooms').update({ status }).eq('id', roomId)
    if (error) { showToast('Error: ' + error.message); return }
    load()
  }

  const filteredRooms = filter
    ? rooms.filter(r => r.room_number.toLowerCase().includes(filter.toLowerCase()))
    : rooms

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-lg text-sm z-50 max-w-xs">
          {toast}
        </div>
      )}

      {/* Room Types management */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-gray-700">Room Types</div>
          <button onClick={openNewType} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg">
            + Add Room Type
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {roomTypes.map(rt => (
            <div key={rt.id} className="border border-gray-100 rounded-lg p-2.5">
              <div className="text-sm font-medium text-gray-700">{rt.name}</div>
              <div className="text-xs text-gray-400">₱{Number(rt.base_rate).toLocaleString()}/night · {rt.max_capacity} pax</div>
              <div className="flex gap-1 mt-1.5">
                <button onClick={() => openEditType(rt)} className="text-xs text-blue-600 hover:text-blue-800">Edit</button>
                <span className="text-xs text-gray-300">·</span>
                <button onClick={() => deactivateType(rt)} className="text-xs text-red-500 hover:text-red-700">Deactivate</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rooms list */}
      <div className="flex items-center justify-between mb-3 gap-3">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Search room number..."
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white w-48"
        />
        <button onClick={openNewRoom} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs rounded-lg whitespace-nowrap">
          + Add Room
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filteredRooms.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-400 text-sm">No rooms found.</div>
          ) : filteredRooms.map(r => (
            <div key={r.id} className="bg-white border border-gray-100 rounded-xl p-3">
              <div className="flex items-start justify-between">
                <div className="text-lg font-semibold text-gray-800">Room {r.room_number}</div>
                <button onClick={() => openEditRoom(r)} className="text-gray-400 hover:text-gray-600 text-xs">Edit</button>
              </div>
              <div className="text-xs text-gray-500 mb-2">{(r.room_types_config as any)?.name ?? 'Unassigned'}</div>
              <select
                value={r.status}
                onChange={e => quickStatusChange(r.id, e.target.value)}
                className={`w-full text-xs px-2 py-1 rounded-full font-medium border-0 ${statusColor[r.status] ?? 'bg-gray-100 text-gray-600'}`}
              >
                <option value="available">Available</option>
                <option value="occupied">Occupied</option>
                <option value="reserved">Reserved</option>
                <option value="cleaning">Cleaning</option>
                <option value="maintenance">Maintenance</option>
                <option value="out_of_order">Out of Order</option>
              </select>
              <div className="text-xs text-blue-600 font-medium mt-2">
                ₱{Number((r.room_types_config as any)?.base_rate ?? 0).toLocaleString()}/night
              </div>
              <button onClick={() => deleteRoom(r)} className="text-xs text-red-400 hover:text-red-600 mt-2">Delete</button>
            </div>
          ))}
        </div>
      )}

      {/* Room Form Modal */}
      {showRoomForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowRoomForm(false)}>
          <form onSubmit={saveRoom} className="bg-white rounded-xl p-5 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-1">{editingRoom ? 'Edit Room' : 'Add Room'}</div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Room Number</label>
              <input value={roomForm.room_number} onChange={e => setRoomForm(p => ({ ...p, room_number: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Room Type</label>
              <select value={roomForm.room_type_id} onChange={e => setRoomForm(p => ({ ...p, room_type_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                <option value="">-- Select --</option>
                {roomTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.name} (₱{rt.base_rate})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Floor</label>
              <input type="number" value={roomForm.floor} onChange={e => setRoomForm(p => ({ ...p, floor: parseInt(e.target.value) || 1 }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select value={roomForm.status} onChange={e => setRoomForm(p => ({ ...p, status: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                <option value="available">Available</option>
                <option value="occupied">Occupied</option>
                <option value="reserved">Reserved</option>
                <option value="cleaning">Cleaning</option>
                <option value="maintenance">Maintenance</option>
                <option value="out_of_order">Out of Order</option>
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-lg">
                {editingRoom ? 'Save Changes' : 'Add Room'}
              </button>
              <button type="button" onClick={() => setShowRoomForm(false)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Room Type Form Modal */}
      {showTypeForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowTypeForm(false)}>
          <form onSubmit={saveType} className="bg-white rounded-xl p-5 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-gray-700 mb-1">{editingType ? 'Edit Room Type' : 'Add Room Type'}</div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input value={typeForm.name} onChange={e => setTypeForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Deluxe Room"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <select value={typeForm.type} onChange={e => setTypeForm(p => ({ ...p, type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white">
                <option value="standard">Standard</option>
                <option value="deluxe">Deluxe</option>
                <option value="superior">Superior</option>
                <option value="suite">Suite</option>
                <option value="family">Family</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Rate / night</label>
                <input type="number" value={typeForm.base_rate} onChange={e => setTypeForm(p => ({ ...p, base_rate: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Max Capacity</label>
                <input type="number" value={typeForm.max_capacity} onChange={e => setTypeForm(p => ({ ...p, max_capacity: parseInt(e.target.value) || 1 }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <input value={typeForm.description} onChange={e => setTypeForm(p => ({ ...p, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm rounded-lg">
                {editingType ? 'Save Changes' : 'Add Type'}
              </button>
              <button type="button" onClick={() => setShowTypeForm(false)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
