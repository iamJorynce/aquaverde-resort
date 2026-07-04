import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()

  const { data: roomTypes } = await supabase
    .from('room_types_config')
    .select('id, name, base_rate, max_capacity, description, type')
    .eq('is_active', true)
    .order('base_rate')
    .limit(3)

  return (
    <>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-blue-900 via-blue-800 to-teal-700 text-white">
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative max-w-6xl mx-auto px-4 py-28 text-center">
          <div className="inline-block bg-white/20 backdrop-blur-sm text-white text-sm px-4 py-1.5 rounded-full mb-6">
            🌊 Sarangani, South Cotabato
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Your Perfect<br />Beach Escape
          </h1>
          <p className="text-lg md:text-xl text-blue-100 max-w-2xl mx-auto mb-10 leading-relaxed">
            Experience the pristine beauty of AquaVerde — where crystal-clear waters,
            lush greenery, and warm Filipino hospitality come together.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/booking"
              className="bg-white text-blue-800 hover:bg-blue-50 font-semibold px-8 py-4 rounded-xl text-lg transition-colors">
              Book Your Stay
            </Link>
            <Link href="/rooms"
              className="border-2 border-white text-white hover:bg-white/10 font-semibold px-8 py-4 rounded-xl text-lg transition-colors">
              View Rooms
            </Link>
          </div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 60L60 50C120 40 240 20 360 15C480 10 600 20 720 25C840 30 960 30 1080 25C1200 20 1320 10 1380 5L1440 0V60H0Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* Highlights */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-800 mb-3">Why Choose AquaVerde?</h2>
            <p className="text-gray-500 max-w-xl mx-auto">Everything you need for an unforgettable beach vacation.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: '🏖️', title: 'Pristine Beach', desc: 'Wake up to stunning ocean views and soft white sand right at your doorstep.' },
              { icon: '🏊', title: 'Swimming Pool', desc: 'Enjoy our sparkling swimming pool open to all resort guests during your stay.' },
              { icon: '🍽️', title: 'Fresh Cuisine', desc: 'Savor fresh local seafood and Filipino favorites at our beachside restaurant.' },
              { icon: '⛺', title: 'Cozy Cottages', desc: 'Perfect for groups and families — our cottages offer space, privacy and comfort.' },
              { icon: '🤿', title: 'Water Activities', desc: 'Kayaking, snorkeling, and more — adventure awaits just steps from your room.' },
              { icon: '🌅', title: 'Breathtaking Sunsets', desc: 'Every evening is a masterpiece. Watch the sun dip below the horizon in paradise.' },
            ].map(h => (
              <div key={h.title} className="text-center p-6 rounded-2xl hover:bg-blue-50 transition-colors group">
                <div className="text-4xl mb-4">{h.icon}</div>
                <h3 className="font-semibold text-gray-800 mb-2 text-lg group-hover:text-blue-700">{h.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{h.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Rooms */}
      {roomTypes && roomTypes.length > 0 && (
        <section className="py-20 bg-gray-50">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-14">
              <h2 className="text-3xl font-bold text-gray-800 mb-3">Our Rooms</h2>
              <p className="text-gray-500">Comfortable, well-appointed rooms for every kind of traveler.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {roomTypes.map(rt => (
                <div key={rt.id} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="bg-gradient-to-br from-blue-400 to-teal-500 h-48 flex items-center justify-center">
                    <span className="text-6xl">🛏️</span>
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-800 text-lg">{rt.name}</h3>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full capitalize">{rt.type}</span>
                    </div>
                    <p className="text-sm text-gray-500 mb-4 leading-relaxed">
                      {rt.description || `Comfortable ${rt.name} accommodating up to ${rt.max_capacity} guests.`}
                    </p>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-2xl font-bold text-blue-700">₱{Number(rt.base_rate).toLocaleString()}</span>
                        <span className="text-gray-400 text-sm">/night</span>
                      </div>
                      <span className="text-xs text-gray-400">Up to {rt.max_capacity} guests</span>
                    </div>
                    <Link href="/booking"
                      className="mt-4 block w-full bg-blue-700 hover:bg-blue-800 text-white text-center py-2.5 rounded-lg text-sm font-medium transition-colors">
                      Book This Room
                    </Link>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-8">
              <Link href="/rooms" className="text-blue-700 hover:text-blue-800 font-medium">
                View all rooms & rates →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* CTA Banner */}
      <section className="bg-blue-700 text-white py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready for Your Beach Getaway?</h2>
          <p className="text-blue-100 mb-8 text-lg">
            Book now and pay the reservation fee online. Settle the balance on arrival.
          </p>
          <Link href="/booking"
            className="inline-block bg-white text-blue-700 hover:bg-blue-50 font-semibold px-10 py-4 rounded-xl text-lg transition-colors">
            Reserve Your Room Now
          </Link>
        </div>
      </section>
    </>
  )
}
