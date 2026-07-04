import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function RoomsPage() {
  const supabase = await createClient()

  const { data: roomTypes } = await supabase
    .from('room_types_config')
    .select('*')
    .eq('is_active', true)
    .order('base_rate')

  const { data: rooms } = await supabase
    .from('rooms')
    .select('room_number, status, room_type_id')
    .order('room_number')

  // Count available rooms per type
  const availableByType: Record<string, number> = {}
  ;(rooms ?? []).forEach(r => {
    if (r.status === 'available') {
      availableByType[r.room_type_id] = (availableByType[r.room_type_id] ?? 0) + 1
    }
  })

  const typeColors: Record<string, string> = {
    standard: 'from-blue-400 to-blue-600',
    deluxe:   'from-teal-400 to-teal-600',
    superior: 'from-indigo-400 to-indigo-600',
    suite:    'from-purple-400 to-purple-600',
    family:   'from-green-400 to-green-600',
  }

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-900 to-teal-700 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-4">Rooms & Rates</h1>
          <p className="text-blue-100 text-lg">
            Choose from our carefully appointed rooms — each designed for comfort and relaxation.
          </p>
        </div>
      </section>

      {/* Rooms list */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4">
          {!roomTypes || roomTypes.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              No rooms available at this time. Please check back soon.
            </div>
          ) : (
            <div className="space-y-6">
              {roomTypes.map(rt => {
                const available = availableByType[rt.id] ?? 0
                const gradient = typeColors[rt.type] ?? 'from-blue-400 to-blue-600'
                return (
                  <div key={rt.id} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row">
                    <div className={`bg-gradient-to-br ${gradient} md:w-64 h-48 md:h-auto flex items-center justify-center flex-shrink-0`}>
                      <div className="text-center text-white">
                        <div className="text-5xl mb-2">🛏️</div>
                        <div className="text-sm font-medium capitalize">{rt.type}</div>
                      </div>
                    </div>
                    <div className="p-6 flex-1">
                      <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
                        <div>
                          <h2 className="text-xl font-bold text-gray-800">{rt.name}</h2>
                          <p className="text-gray-500 text-sm mt-1">
                            {rt.description || `Comfortable ${rt.type} room for up to ${rt.max_capacity} guests.`}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-blue-700">
                            ₱{Number(rt.base_rate).toLocaleString()}
                          </div>
                          <div className="text-gray-400 text-sm">per night</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-4">
                        <span className="bg-blue-50 text-blue-700 text-xs px-3 py-1 rounded-full">
                          👥 Up to {rt.max_capacity} guests
                        </span>
                        <span className={`text-xs px-3 py-1 rounded-full ${available > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                          {available > 0 ? `✓ ${available} room${available > 1 ? 's' : ''} available` : '✗ No rooms available'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-400">
                          50% reservation fee required · Balance paid on arrival
                        </div>
                        <Link href={`/booking?type=${rt.id}`}
                          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            available > 0
                              ? 'bg-blue-700 hover:bg-blue-800 text-white'
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none'
                          }`}>
                          {available > 0 ? 'Book Now' : 'Unavailable'}
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* Policies */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-800 text-center mb-10">Booking Policies</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: '💳', title: 'Reservation Fee', desc: '50% of the first night rate is required to confirm your booking. This is non-refundable.' },
              { icon: '🕐', title: 'Check-in / Check-out', desc: 'Check-in at 2:00 PM. Check-out at 12:00 PM. Early/late arrangements upon request.' },
              { icon: '📋', title: 'Cancellation', desc: 'Cancellations made 48 hours before check-in may be rescheduled. Reservation fee is non-refundable.' },
            ].map(p => (
              <div key={p.title} className="border border-gray-100 rounded-xl p-5">
                <div className="text-2xl mb-3">{p.icon}</div>
                <h3 className="font-semibold text-gray-700 mb-2">{p.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
