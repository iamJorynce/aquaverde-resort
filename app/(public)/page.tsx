import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getResortSettings } from '@/lib/resort-settings'
import TideLine from '@/components/public/TideLine'

// Verified real Unsplash CDN URLs (confirmed via direct fetch — do not
// swap these for guessed IDs, they must be re-verified the same way).
const IMG_POOL_AERIAL = 'https://images.trvl-media.com/lodging/115000000/114410000/114404400/114404355/f345d1cd.jpg?impolicy=resizecrop&rw=1200&ra=fit'
const IMG_COTTAGES    = 'https://www.lamudi.com.ph/journal/wp-content/uploads/2014/09/island-philippines-resort-ingimage-small.jpg'
const IMG_ROOM        = 'https://images.unsplash.com/photo-1746549855427-57e6da7040db'
const IMG_SUNSET      = 'https://images.unsplash.com/photo-1587942342372-238de24880a0'

export default async function HomePage() {
  const supabase = await createClient()
  const settings = await getResortSettings()
  const { data: allRoomTypes } = await supabase
    .from('room_types_config')
    .select('id, name, base_rate, max_capacity, description, type, image_urls')
    .eq('is_active', true)
    .order('base_rate')

  // Prefer showing room types that already have a photo set, so a newly
  // uploaded image shows up on the homepage right away instead of being
  // hidden behind cheaper room types with no photo yet. Falls back to
  // cheapest-first for the rest.
  const roomTypes = (allRoomTypes ?? [])
    .slice()
    .sort((a, b) => {
      const aHasImg = a.image_urls?.length ? 0 : 1
      const bHasImg = b.image_urls?.length ? 0 : 1
      return aHasImg - bHasImg
    })
    .slice(0, 3)

  return (
    <>
      {/* ===== HERO ===== */}
      <section className="relative h-[92vh] min-h-[560px] flex items-end overflow-hidden">
        <img
          src={`${IMG_POOL_AERIAL}?w=1800&q=80&auto=format&fit=crop`}
          alt="Aerial view of an infinity pool beside the ocean"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(15,38,38,0.35) 0%, rgba(15,38,38,0.15) 40%, rgba(15,38,38,0.75) 100%)' }}
        />
        <div className="relative max-w-7xl mx-auto px-5 md:px-8 pb-16 md:pb-24 w-full">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-white/80 text-[12.5px] tracking-[0.2em] uppercase mb-6" style={{ fontFamily: 'Work Sans, sans-serif' }}>
              <span className="w-6 h-px bg-white/50" />
              {settings.address}
            </div>
            <h1 className="text-white text-[42px] leading-[1.08] md:text-[68px] md:leading-[1.05] mb-6" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, letterSpacing: '-0.01em' }}>
              Where the tide<br />sets the pace.
            </h1>
            <p className="text-white/85 text-[16px] md:text-[18px] leading-relaxed max-w-lg mb-9" style={{ fontFamily: 'Work Sans, sans-serif' }}>
              A quiet stretch of coastline, unhurried mornings, and water clear enough
              to forget what day it is.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/booking" className="px-7 py-3.5 rounded-full text-[14.5px] font-medium tracking-wide transition-all hover:brightness-110" style={{ background: '#C97B4A', color: '#fff', fontFamily: 'Work Sans, sans-serif' }}>
                Reserve Your Stay
              </Link>
              <Link href="/rooms" className="px-7 py-3.5 rounded-full text-[14.5px] font-medium tracking-wide text-white border border-white/40 hover:bg-white/10 transition-colors" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                View Rooms
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== INTRO STATEMENT ===== */}
      <section className="py-24 md:py-32" style={{ background: '#FAF6EF' }}>
        <div className="max-w-3xl mx-auto px-5 md:px-8 text-center">
          <div className="text-[13px] tracking-[0.2em] uppercase mb-6" style={{ fontFamily: 'Work Sans, sans-serif', color: '#C97B4A' }}>
            Welcome to {settings.resort_name}
          </div>
          <p className="text-[26px] md:text-[34px] leading-[1.4]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 400, color: '#1A2E2B' }}>
            Every room opens to the sound of water. Every evening ends the same way —
            <span style={{ color: '#1F6E63', fontStyle: 'italic' }}> slowly</span>, and facing the horizon.
          </p>
          <TideLine />
        </div>
      </section>

      {/* ===== FEATURE GRID ===== */}
      <section className="pb-24 md:pb-32" style={{ background: '#FAF6EF' }}>
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-6">
            <div className="md:col-span-7 relative rounded-2xl overflow-hidden group h-[380px] md:h-[520px]">
              <img
                src={`${IMG_COTTAGES}?w=1200&q=80&auto=format&fit=crop`}
                alt="Thatched-roof cottages along a tropical beach"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(15,38,38,0.7) 0%, transparent 50%)' }} />
              <div className="absolute bottom-0 left-0 right-0 p-7 md:p-9">
                <div className="text-white/70 text-[12.5px] tracking-[0.15em] uppercase mb-2" style={{ fontFamily: 'Work Sans, sans-serif' }}>Stay</div>
                <h3 className="text-white text-[26px] md:text-[32px] mb-2" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>
                  Cottages on the sand
                </h3>
                <p className="text-white/80 text-[14.5px] max-w-md" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  Private, breezy, and steps from the shoreline — built for slow mornings and longer evenings.
                </p>
              </div>
            </div>

            <div className="md:col-span-5 flex flex-col gap-5 md:gap-6">
              <div className="relative rounded-2xl overflow-hidden group h-[180px] md:h-[250px]">
                <img
                  src={`${IMG_ROOM}?w=900&q=80&auto=format&fit=crop`}
                  alt="A calm hotel room interior"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(15,38,38,0.65) 0%, transparent 55%)' }} />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <h3 className="text-white text-[20px]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>Rooms, reimagined</h3>
                </div>
              </div>
              <div className="relative rounded-2xl overflow-hidden group h-[180px] md:h-[250px]">
                <img
                  src={`${IMG_POOL_AERIAL}?w=900&q=80&auto=format&fit=crop&crop=entropy`}
                  alt="Infinity pool overlooking the ocean"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(15,38,38,0.65) 0%, transparent 55%)' }} />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <h3 className="text-white text-[20px]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>Water, always near</h3>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== AMENITIES ===== */}
      <section className="py-20 md:py-28" style={{ background: '#0F2626' }}>
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-16">
            <div className="md:col-span-4">
              <div className="text-[13px] tracking-[0.2em] uppercase mb-4" style={{ fontFamily: 'Work Sans, sans-serif', color: '#C97B4A' }}>
                On the Property
              </div>
              <h2 className="text-white text-[30px] md:text-[38px] leading-tight" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>
                Everything you need, nothing you don't.
              </h2>
            </div>
            <div className="md:col-span-8 grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-6">
              {[
                'Private Beach', 'Swimming Pool', 'Beachside Restaurant',
                'Cottage Rentals', 'Kayaking & Snorkeling', 'Free Parking',
                'Beach Bar', 'Fishing Access', 'Free WiFi',
              ].map(item => (
                <div key={item} className="flex items-center gap-3 text-white/80" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#C97B4A' }} />
                  <span className="text-[15px]">{item}</span>
                </div>
              ))}
              <Link href="/day-use" className="col-span-2 md:col-span-3 mt-2 text-[14px] underline underline-offset-4 w-fit hover:opacity-80 transition-opacity" style={{ fontFamily: 'Work Sans, sans-serif', color: '#C97B4A' }}>
                Not staying overnight? See Day Use rates →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FEATURED ROOMS ===== */}
      {roomTypes && roomTypes.length > 0 && (
        <section className="py-24 md:py-32" style={{ background: '#FAF6EF' }}>
          <div className="max-w-7xl mx-auto px-5 md:px-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-14 gap-4">
              <div>
                <div className="text-[13px] tracking-[0.2em] uppercase mb-4" style={{ fontFamily: 'Work Sans, sans-serif', color: '#C97B4A' }}>
                  Accommodations
                </div>
                <h2 className="text-[30px] md:text-[38px] leading-tight" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#1A2E2B' }}>
                  Rooms built around the view.
                </h2>
              </div>
              <Link href="/rooms" className="text-[14.5px] underline underline-offset-4 hover:opacity-70 transition-opacity w-fit" style={{ fontFamily: 'Work Sans, sans-serif', color: '#1F6E63' }}>
                See all rooms &amp; rates →
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
              {roomTypes.map((rt, i) => (
                <Link key={rt.id} href="/booking" className="group block">
                  <div className="relative rounded-2xl overflow-hidden h-64 mb-5">
                    <img
                      src={rt.image_urls?.[0] || `${[IMG_ROOM, IMG_COTTAGES, IMG_POOL_AERIAL][i % 3]}?w=800&q=80&auto=format&fit=crop`}
                      alt={rt.name}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex items-start justify-between mb-1.5">
                    <h3 className="text-[19px]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#1A2E2B' }}>{rt.name}</h3>
                    <span className="text-[12px] px-2.5 py-1 rounded-full capitalize flex-shrink-0" style={{ background: '#EAE3D4', color: '#5C5240', fontFamily: 'Work Sans, sans-serif' }}>
                      {rt.type}
                    </span>
                  </div>
                  <p className="text-[14px] mb-3" style={{ fontFamily: 'Work Sans, sans-serif', color: '#6B6355' }}>
                    Up to {rt.max_capacity} guests
                  </p>
                  <div className="text-[17px]" style={{ fontFamily: 'Work Sans, sans-serif', color: '#1F6E63', fontWeight: 500 }}>
                    ₱{Number(rt.base_rate).toLocaleString()}<span className="text-[13px] font-normal" style={{ color: '#6B6355' }}> / night</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== CTA BANNER ===== */}
      <section className="relative py-28 md:py-36 overflow-hidden">
        <img
          src={`${IMG_SUNSET}?w=1800&q=80&auto=format&fit=crop`}
          alt="Silhouette of palm trees on the beach at sunset"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0" style={{ background: 'rgba(15,38,38,0.72)' }} />
        <div className="relative max-w-2xl mx-auto px-5 md:px-8 text-center">
          <h2 className="text-white text-[30px] md:text-[42px] leading-tight mb-5" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>
            Your seat by the water is waiting.
          </h2>
          <p className="text-white/80 text-[15.5px] mb-9" style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Reserve online with a 50% deposit — settle the rest when you arrive.
          </p>
          <Link href="/booking" className="inline-block px-8 py-4 rounded-full text-[15px] font-medium tracking-wide transition-all hover:brightness-110" style={{ background: '#C97B4A', color: '#fff', fontFamily: 'Work Sans, sans-serif' }}>
            Book Your Stay
          </Link>
        </div>
      </section>
    </>
  )
}
