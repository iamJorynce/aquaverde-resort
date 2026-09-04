import TideLine from '@/components/public/TideLine'
import Reveal from '@/components/public/Reveal'
import { getResortSettings } from '@/lib/resort-settings'

const IMG_COTTAGES = '/images/3.jpg'
const IMG_POOL      = '/images/citihotel.jpg'

export default async function AboutPage() {
  const settings = await getResortSettings()
  return (
    <>
      {/* ===== HERO ===== */}
      <section className="relative h-[52vh] min-h-[380px] flex items-end overflow-hidden">
        <img src={`${IMG_COTTAGES}?w=1800&q=80&auto=format&fit=crop`} alt="Beach cottages at AquaVerde" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(15,38,38,0.25) 0%, rgba(15,38,38,0.75) 100%)' }} />
        <div className="relative max-w-7xl mx-auto px-5 md:px-8 pb-14 md:pb-16 w-full">
          <div className="pub-hero-in text-white/70 text-[12.5px] tracking-[0.2em] uppercase mb-4" style={{ fontFamily: 'Work Sans, sans-serif' }}>Our Story</div>
          <h1 className="pub-hero-in text-white text-[38px] md:text-[54px] leading-tight" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, animationDelay: '120ms' }}>
            About {settings.resort_name}
          </h1>
        </div>
      </section>

      {/* ===== STORY ===== */}
      <section className="py-24 md:py-28" style={{ background: '#FAF6EF' }}>
        <div className="max-w-3xl mx-auto px-5 md:px-8">
          <Reveal variant="scale">
          <p className="text-[22px] md:text-[28px] leading-[1.5] mb-8" style={{ fontFamily: 'Fraunces, serif', fontWeight: 400, color: '#1A2E2B' }}> {settings.resort_name} began as a simple idea — a place where comfort, thoughtful design, and warm hospitality come together. </p>
          </Reveal>
          <Reveal delay={150}>
          <div className="space-y-5 text-[15.5px] leading-relaxed" style={{ fontFamily: 'Work Sans, sans-serif', color: '#5C5240' }}>
            <p> Located in {settings.address}, the hotel was built around a simple idea: every detail should make your stay feel comfortable and effortless. From thoughtfully designed rooms to welcoming spaces, everything is created with comfort and a sense of calm in mind. </p> <p> What started as a family project has grown into a warm, quietly-run hotel — still family-operated, still guided by the same genuine approach to hospitality. We'd rather remember your name than hand you a lanyard. </p>
          </div>
          </Reveal>
        </div>
      </section>

      <div style={{ background: '#FAF6EF' }}>
        <TideLine />
      </div>

      {/* ===== IMAGE + VALUES ===== */}
      <section className="py-24 md:py-28" style={{ background: '#FAF6EF' }}>
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-16 items-center">
            <Reveal className="md:col-span-6" variant="left">
            <div className="pub-hover-lift relative rounded-2xl overflow-hidden h-[320px] md:h-[440px]">
              <img src={`${IMG_POOL}?w=1000&q=80&auto=format&fit=crop`} alt="Infinity pool at AquaVerde" className="absolute inset-0 w-full h-full object-cover" />
            </div>
            </Reveal>
            <div className="md:col-span-6 space-y-9">
              {[
                { n: '01', title: 'Warm, Not Performed', desc: 'Every guest is welcomed like they\'ve been here before — no scripts, no forced enthusiasm.' },

{ n: '02', title: 'Comfort Comes First', desc: 'From thoughtfully designed rooms to the smallest details, everything is considered to make your stay feel easy and comfortable.' },

{ n: '03', title: 'Quiet Consistency', desc: 'Clean rooms, good food, and a staff that remembers how you take your coffee — every time.' },
              ].map((v, i) => (
                <Reveal key={v.n} variant="right" delay={i * 100}>
                <div className="flex gap-5">
                  <div className="text-[13px] pt-1.5 flex-shrink-0" style={{ fontFamily: 'Work Sans, sans-serif', color: '#C97B4A' }}>{v.n}</div>
                  <div>
                    <h3 className="text-[18px] mb-1.5" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#1A2E2B' }}>{v.title}</h3>
                    <p className="text-[14.5px] leading-relaxed" style={{ fontFamily: 'Work Sans, sans-serif', color: '#6B6355' }}>{v.desc}</p>
                  </div>
                </div>
                </Reveal>
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
  'Free WiFi',
  'Restaurant',
  'Room Service',
  '24/7 Front Desk',
  'Parking',
  'Air Conditioning',
  'Daily Housekeeping',
  'Non-Smoking Rooms',
].map((a, i) => (
              <Reveal key={a} delay={i * 40}>
              <div className="text-white/70 text-[14.5px]" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                {a}
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
