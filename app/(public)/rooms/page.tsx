import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getResortSettings } from '@/lib/resort-settings'
import TideLine from '@/components/public/TideLine'

const IMG_ROOM     = 'https://images.unsplash.com/photo-1746549855427-57e6da7040db'
const IMG_COTTAGES = 'https://images.unsplash.com/photo-1756573345813-7caa2f412606'

export default async function RoomsPage() {
  const supabase = await createClient()
  const settings = await getResortSettings()

  const { data: roomTypes } = await supabase
    .from('room_types_config')
    .select('*')
    .eq('is_active', true)
    .order('base_rate')

  const { data: rooms } = await supabase
    .from('rooms')
    .select('room_number, status, room_type_id')
    .order('room_number')

  const availableByType: Record<string, number> = {}
  ;(rooms ?? []).forEach(r => {
    if (r.status === 'available') {
      availableByType[r.room_type_id] = (availableByType[r.room_type_id] ?? 0) + 1
    }
  })

  return (
    <>
      {/* ===== HERO ===== */}
      <section className="relative h-[52vh] min-h-[380px] flex items-end overflow-hidden">
        <img src={`${IMG_ROOM}?w=1800&q=80&auto=format&fit=crop`} alt="Hotel room interior" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(15,38,38,0.25) 0%, rgba(15,38,38,0.75) 100%)' }} />
        <div className="relative max-w-7xl mx-auto px-5 md:px-8 pb-14 md:pb-16 w-full">
          <div className="text-white/70 text-[12.5px] tracking-[0.2em] uppercase mb-4" style={{ fontFamily: 'Work Sans, sans-serif' }}>Accommodations</div>
          <h1 className="text-white text-[38px] md:text-[54px] leading-tight" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>
            Rooms &amp; Rates
          </h1>
        </div>
      </section>

      {/* ===== INTRO ===== */}
      <section className="pt-16 pb-4" style={{ background: '#FAF6EF' }}>
        <div className="max-w-3xl mx-auto px-5 md:px-8 text-center">
          <p className="text-[18px] md:text-[22px] leading-relaxed" style={{ fontFamily: 'Fraunces, serif', fontWeight: 400, color: '#1A2E2B' }}>
            Each room is built around the same idea — let the outside in, and give you
            one less reason to leave.
          </p>
          <TideLine />
        </div>
      </section>

      {/* ===== ROOM LIST ===== */}
      <section className="py-16 md:py-20" style={{ background: '#FAF6EF' }}>
        <div className="max-w-5xl mx-auto px-5 md:px-8">
          {!roomTypes || roomTypes.length === 0 ? (
            <div className="text-center py-20" style={{ color: '#6B6355', fontFamily: 'Work Sans, sans-serif' }}>
              No rooms available at this time. Please check back soon.
            </div>
          ) : (
            <div className="space-y-6">
              {roomTypes.map((rt, i) => {
                const available = availableByType[rt.id] ?? 0
                return (
                  <div key={rt.id} className="rounded-2xl overflow-hidden flex flex-col md:flex-row" style={{ background: '#fff' }}>
                    <div className="md:w-72 h-56 md:h-auto flex-shrink-0 relative">
                      <img
                        src={`${[IMG_ROOM, IMG_COTTAGES][i % 2]}?w=700&q=80&auto=format&fit=crop`}
                        alt={rt.name}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-6 md:p-8 flex-1">
                      <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
                        <div>
                          <h2 className="text-[22px] mb-1.5" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#1A2E2B' }}>{rt.name}</h2>
                          <p className="text-[14.5px]" style={{ fontFamily: 'Work Sans, sans-serif', color: '#6B6355' }}>
                            {rt.description || `Comfortable ${rt.type} room for up to ${rt.max_capacity} guests.`}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-[24px]" style={{ fontFamily: 'Work Sans, sans-serif', color: '#1F6E63', fontWeight: 500 }}>
                            ₱{Number(rt.base_rate).toLocaleString()}
                          </div>
                          <div className="text-[12.5px]" style={{ fontFamily: 'Work Sans, sans-serif', color: '#9A9182' }}>per night</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-5">
                        <span className="text-[12.5px] px-3 py-1.5 rounded-full" style={{ background: '#EAE3D4', color: '#5C5240', fontFamily: 'Work Sans, sans-serif' }}>
                          Up to {rt.max_capacity} guests
                        </span>
                        <span
                          className="text-[12.5px] px-3 py-1.5 rounded-full"
                          style={{
                            background: available > 0 ? '#E4F0E9' : '#F5E6E3',
                            color: available > 0 ? '#1F6E63' : '#B5542E',
                            fontFamily: 'Work Sans, sans-serif',
                          }}
                        >
                          {available > 0 ? `${available} room${available > 1 ? 's' : ''} available` : 'Currently unavailable'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-[12.5px]" style={{ fontFamily: 'Work Sans, sans-serif', color: '#9A9182' }}>
                          50% deposit to reserve · balance on arrival
                        </div>
                        <Link
                          href={`/booking?type=${rt.id}`}
                          className="px-5 py-2.5 rounded-full text-[13.5px] font-medium tracking-wide transition-all"
                          style={{
                            background: available > 0 ? '#C97B4A' : '#E5E0D3',
                            color: available > 0 ? '#fff' : '#9A9182',
                            fontFamily: 'Work Sans, sans-serif',
                            pointerEvents: available > 0 ? 'auto' : 'none',
                          }}
                        >
                          {available > 0 ? 'Book This Room' : 'Unavailable'}
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

      {/* ===== POLICIES ===== */}
      <section className="py-20 md:py-24" style={{ background: '#0F2626' }}>
        <div className="max-w-5xl mx-auto px-5 md:px-8">
          <h2 className="text-white text-[26px] md:text-[32px] text-center mb-14" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>
            Booking Policies
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
            {[
              { title: 'Reservation Fee', desc: 'A 50% deposit of your total bill confirms your booking online. This amount is non-refundable.' },
              { title: 'Check-in / Check-out', desc: `Check-in from ${settings.check_in_time}. Check-out by ${settings.check_out_time}. Early or late arrangements available on request.` },
              { title: 'Cancellations', desc: 'Cancellations made 48 hours before check-in may be rescheduled. The reservation fee is non-refundable.' },
            ].map(p => (
              <div key={p.title}>
                <div className="w-8 h-px mb-4" style={{ background: '#C97B4A' }} />
                <h3 className="text-white text-[17px] mb-2.5" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>{p.title}</h3>
                <p className="text-white/60 text-[14px] leading-relaxed" style={{ fontFamily: 'Work Sans, sans-serif' }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
