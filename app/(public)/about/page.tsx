import TideLine from '@/components/public/TideLine'
import { getResortSettings } from '@/lib/resort-settings'

const IMG_COTTAGES = 'https://images.trvl-media.com/lodging/115000000/114410000/114404400/114404355/19c38da4.jpg?impolicy=resizecrop&rw=1200&ra=fit'
const IMG_POOL      = 'https://images.trvl-media.com/lodging/115000000/114410000/114404400/114404355/f345d1cd.jpg?impolicy=resizecrop&rw=1200&ra=fit'

export default async function AboutPage() {
  const settings = await getResortSettings()
  return (
    <>
      {/* ===== HERO ===== */}
      <section className="relative h-[52vh] min-h-[380px] flex items-end overflow-hidden">
        <img src={`${IMG_COTTAGES}?w=1800&q=80&auto=format&fit=crop`} alt="Beach cottages at AquaVerde" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(15,38,38,0.25) 0%, rgba(15,38,38,0.75) 100%)' }} />
        <div className="relative max-w-7xl mx-auto px-5 md:px-8 pb-14 md:pb-16 w-full">
          <div className="text-white/70 text-[12.5px] tracking-[0.2em] uppercase mb-4" style={{ fontFamily: 'Work Sans, sans-serif' }}>Our Story</div>
          <h1 className="text-white text-[38px] md:text-[54px] leading-tight" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>
            About {settings.resort_name}
          </h1>
        </div>
      </section>

      {/* ===== STORY ===== */}
      <section className="py-24 md:py-28" style={{ background: '#FAF6EF' }}>
        <div className="max-w-3xl mx-auto px-5 md:px-8">
          <p className="text-[22px] md:text-[28px] leading-[1.5] mb-8" style={{ fontFamily: 'Fraunces, serif', fontWeight: 400, color: '#1A2E2B' }}>
            {settings.resort_name} began as a simple idea — a place where the pace of the tide
            replaces the pace of everything else.
          </p>
          <div className="space-y-5 text-[15.5px] leading-relaxed" style={{ fontFamily: 'Work Sans, sans-serif', color: '#5C5240' }}>
            <p>
              Set along the coast of Sarangani, South Cotabato, the resort was built with one
              rule guiding every decision: nothing should get in the way of the view. Rooms open
              toward the water. Cottages sit close enough to hear the waves. Even the restaurant
              faces the horizon.
            </p>
            <p>
              What started as a family project has grown into a small, quietly-run resort —
              still family-operated, still built around the same instinct for hospitality that
              doesn't try too hard. We'd rather remember your name than hand you a lanyard.
            </p>
          </div>
        </div>
      </section>

      <div style={{ background: '#FAF6EF' }}>
        <TideLine />
      </div>

      {/* ===== IMAGE + VALUES ===== */}
      <section className="py-24 md:py-28" style={{ background: '#FAF6EF' }}>
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-16 items-center">
            <div className="md:col-span-6 relative rounded-2xl overflow-hidden h-[320px] md:h-[440px]">
              <img src={`${IMG_POOL}?w=1000&q=80&auto=format&fit=crop`} alt="Infinity pool at AquaVerde" className="absolute inset-0 w-full h-full object-cover" />
            </div>
            <div className="md:col-span-6 space-y-9">
              {[
                { n: '01', title: 'Warm, Not Performed', desc: 'Every guest is welcomed like they\'ve been here before — no scripts, no forced enthusiasm.' },
                { n: '02', title: 'Nature Comes First', desc: 'We build around the coastline, not over it. Preserving what brought you here is the whole point.' },
                { n: '03', title: 'Quiet Consistency', desc: 'Clean rooms, good food, and a staff that remembers how you take your coffee — every time.' },
              ].map(v => (
                <div key={v.n} className="flex gap-5">
                  <div className="text-[13px] pt-1.5 flex-shrink-0" style={{ fontFamily: 'Work Sans, sans-serif', color: '#C97B4A' }}>{v.n}</div>
                  <div>
                    <h3 className="text-[18px] mb-1.5" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#1A2E2B' }}>{v.title}</h3>
                    <p className="text-[14.5px] leading-relaxed" style={{ fontFamily: 'Work Sans, sans-serif', color: '#6B6355' }}>{v.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== AMENITIES STRIP ===== */}
      <section className="py-20 md:py-24" style={{ background: '#0F2626' }}>
        <div className="max-w-5xl mx-auto px-5 md:px-8 text-center">
          <h2 className="text-white text-[26px] md:text-[32px] mb-12" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>
            What's Here
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8">
            {[
              'Private Beach', 'Swimming Pool', 'Restaurant', 'Cottages',
              'Parking', 'Kayaking', 'Beach Bar', 'Free WiFi',
            ].map(a => (
              <div key={a} className="text-white/70 text-[14.5px]" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                {a}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
