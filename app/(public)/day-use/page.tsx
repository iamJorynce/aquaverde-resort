import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getResortSettings } from '@/lib/resort-settings'
import TideLine from '@/components/public/TideLine'
import Reveal from '@/components/public/Reveal'

const IMG_POOL_AERIAL = 'https://images.unsplash.com/photo-1526865046467-312f4d616a42'
const IMG_COTTAGES    = 'https://images.unsplash.com/photo-1756573345813-7caa2f412606'

const GUEST_TYPE_LABEL: Record<string, string> = {
  adult: 'Adult',
  child: 'Child',
  senior: 'Senior Citizen',
  pwd: 'PWD',
  infant: 'Infant',
}

// Order guest types consistently regardless of insertion order in the DB.
const GUEST_TYPE_ORDER = ['adult', 'child', 'senior', 'pwd', 'infant']

interface DayUseRate {
  id: string
  name: string
  guest_type: string
  area: string
  rate: number
  description: string | null
  period: string
}

interface CottageType {
  id: string
  name: string
  default_day_rate: number | null
  max_capacity: number | null
  description: string | null
}

export default async function DayUsePage() {
  const supabase = await createClient()
  const settings = await getResortSettings()

  const { data: rateRows } = await supabase
    .from('day_use_rates')
    .select('id, name, guest_type, area, rate, description, period')
    .eq('is_active', true)
    .order('area')

  const { data: cottageTypes } = await supabase
    .from('cottage_types_config')
    .select('id, name, default_day_rate, max_capacity, description')
    .eq('is_active', true)
    .not('default_day_rate', 'is', null)
    .order('default_day_rate')

  const rates = (rateRows ?? []) as DayUseRate[]
  const cottages = (cottageTypes ?? []) as CottageType[]

  const areas = Array.from(new Set(rates.map(r => r.area))).sort()
  const dayRates = rates.filter(r => r.period !== 'night')
  const nightRates = rates.filter(r => r.period === 'night')
  const dayAreas = Array.from(new Set(dayRates.map(r => r.area))).sort()
  const nightAreas = Array.from(new Set(nightRates.map(r => r.area))).sort()

  return (
    <>
      {/* ===== HERO ===== */}
      <section className="relative h-[52vh] min-h-[380px] flex items-end overflow-hidden">
        <img
          src={`${IMG_POOL_AERIAL}?w=1800&q=80&auto=format&fit=crop`}
          alt="Guests enjoying the pool and beach during the day"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(15,38,38,0.25) 0%, rgba(15,38,38,0.75) 100%)' }} />
        <div className="relative max-w-7xl mx-auto px-5 md:px-8 pb-14 md:pb-16 w-full">
          <div className="pub-hero-in text-white/70 text-[12.5px] tracking-[0.2em] uppercase mb-4" style={{ fontFamily: 'Work Sans, sans-serif' }}>
            No Overnight Stay Needed
          </div>
          <h1 className="pub-hero-in text-white text-[38px] md:text-[54px] leading-tight" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, animationDelay: '120ms' }}>
            Day/Night Pass
          </h1>
        </div>
      </section>

      {/* ===== INTRO ===== */}
      <section className="pt-16 pb-4" style={{ background: '#FAF6EF' }}>
        <div className="max-w-3xl mx-auto px-5 md:px-8 text-center">
          <Reveal variant="scale">
          <p className="text-[18px] md:text-[22px] leading-relaxed" style={{ fontFamily: 'Fraunces, serif', fontWeight: 400, color: '#1A2E2B' }}>
            Spend the day or evening by the water — swim, rent a cottage, and head home after.
            No room booking required.
          </p>
          <TideLine />
          </Reveal>
        </div>
      </section>

      {/* ===== RATES ===== */}
      <section className="py-16 md:py-20" style={{ background: '#FAF6EF' }}>
        <div className="max-w-4xl mx-auto px-5 md:px-8">
          {areas.length === 0 ? (
            <div className="text-center py-16 rounded-2xl" style={{ background: '#fff', color: '#6B6355', fontFamily: 'Work Sans, sans-serif' }}>
              Day use rates aren't posted online yet — please contact us for current pricing.
            </div>
          ) : (
            <>
              {dayAreas.length > 0 && (
                <div className="space-y-6">
                  <Reveal>
                    <div className="text-[13px] tracking-[0.2em] uppercase text-center" style={{ fontFamily: 'Work Sans, sans-serif', color: '#C97B4A' }}>
                      ☀️ Day Pass Rates
                    </div>
                  </Reveal>
                  {dayAreas.map((area, ai) => {
                    const areaRates = dayRates
                      .filter(r => r.area === area)
                      .sort((a, b) => GUEST_TYPE_ORDER.indexOf(a.guest_type) - GUEST_TYPE_ORDER.indexOf(b.guest_type))
                    return (
                      <Reveal key={`day-${area}`} delay={ai * 80}>
                      <div className="pub-hover-lift rounded-2xl overflow-hidden" style={{ background: '#fff' }}>
                        <div className="px-6 md:px-8 py-5 border-b" style={{ borderColor: '#EAE3D4' }}>
                          <h2 className="text-[19px]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#1A2E2B' }}>
                            {area}
                          </h2>
                        </div>
                        <div className="p-6 md:p-8 grid grid-cols-2 sm:grid-cols-4 gap-5">
                          {areaRates.map(r => (
                            <div key={r.id}>
                              <div className="text-[13px] mb-1" style={{ fontFamily: 'Work Sans, sans-serif', color: '#6B6355' }}>
                                {GUEST_TYPE_LABEL[r.guest_type] ?? r.guest_type}
                              </div>
                              <div className="text-[20px]" style={{ fontFamily: 'Work Sans, sans-serif', color: '#1F6E63', fontWeight: 500 }}>
                                ₱{Number(r.rate).toLocaleString()}
                              </div>
                              {r.description && (
                                <div className="text-[12px] mt-0.5" style={{ fontFamily: 'Work Sans, sans-serif', color: '#9A9182' }}>
                                  {r.description}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      </Reveal>
                    )
                  })}
                </div>
              )}

              {nightAreas.length > 0 && (
                <div className={`space-y-6 ${dayAreas.length > 0 ? 'mt-14' : ''}`}>
                  <Reveal>
                    <div className="text-[13px] tracking-[0.2em] uppercase text-center" style={{ fontFamily: 'Work Sans, sans-serif', color: '#1F6E63' }}>
                      🌙 Night Pass Rates
                    </div>
                  </Reveal>
                  {nightAreas.map((area, ai) => {
                    const areaRates = nightRates
                      .filter(r => r.area === area)
                      .sort((a, b) => GUEST_TYPE_ORDER.indexOf(a.guest_type) - GUEST_TYPE_ORDER.indexOf(b.guest_type))
                    return (
                      <Reveal key={`night-${area}`} delay={ai * 80}>
                      <div className="pub-hover-lift rounded-2xl overflow-hidden" style={{ background: '#0F2626' }}>
                        <div className="px-6 md:px-8 py-5 border-b border-white/10">
                          <h2 className="text-[19px] text-white" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>
                            {area}
                          </h2>
                        </div>
                        <div className="p-6 md:p-8 grid grid-cols-2 sm:grid-cols-4 gap-5">
                          {areaRates.map(r => (
                            <div key={r.id}>
                              <div className="text-[13px] mb-1 text-white/60" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                                {GUEST_TYPE_LABEL[r.guest_type] ?? r.guest_type}
                              </div>
                              <div className="text-[20px]" style={{ fontFamily: 'Work Sans, sans-serif', color: '#C97B4A', fontWeight: 500 }}>
                                ₱{Number(r.rate).toLocaleString()}
                              </div>
                              {r.description && (
                                <div className="text-[12px] mt-0.5 text-white/50" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                                  {r.description}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      </Reveal>
                    )
                  })}
                </div>
              )}
            </>
          )}

          <div className="mt-6 text-[13px] text-center" style={{ fontFamily: 'Work Sans, sans-serif', color: '#9A9182' }}>
            Rates are per person, per day. Parking and cottage rentals are billed separately below.
          </div>
        </div>
      </section>

      {/* ===== COTTAGES ===== */}
      {cottages.length > 0 && (
        <section className="py-20 md:py-24" style={{ background: '#0F2626' }}>
          <div className="max-w-5xl mx-auto px-5 md:px-8">
            <div className="text-center mb-14">
              <div className="text-[13px] tracking-[0.2em] uppercase mb-4" style={{ fontFamily: 'Work Sans, sans-serif', color: '#C97B4A' }}>
                Add a Cottage
              </div>
              <h2 className="text-white text-[26px] md:text-[32px]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>
                A shaded base for the day
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
              {cottages.map((c, i) => (
                <Reveal key={c.id} delay={i * 90}>
                <div className="pub-hover-lift rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <h3 className="text-white text-[18px] mb-1.5" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>{c.name}</h3>
                  {c.max_capacity && (
                    <p className="text-white/60 text-[13.5px] mb-3" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      Up to {c.max_capacity} guests
                    </p>
                  )}
                  {c.description && (
                    <p className="text-white/60 text-[13.5px] mb-4 leading-relaxed" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {c.description}
                    </p>
                  )}
                  <div className="text-[20px]" style={{ fontFamily: 'Work Sans, sans-serif', color: '#C97B4A', fontWeight: 500 }}>
                    ₱{Number(c.default_day_rate).toLocaleString()}
                    <span className="text-[13px] font-normal text-white/50"> / day</span>
                  </div>
                </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== HOW IT WORKS / CTA ===== */}
      <section className="relative py-24 md:py-28 overflow-hidden">
        <img
          src={`${IMG_COTTAGES}?w=1800&q=80&auto=format&fit=crop`}
          alt="Cottages along the beach"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0" style={{ background: 'rgba(15,38,38,0.78)' }} />
        <div className="relative max-w-2xl mx-auto px-5 md:px-8 text-center">
          <Reveal variant="scale">
          <h2 className="text-white text-[26px] md:text-[34px] leading-tight mb-5" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>
            Walk-ins welcome
          </h2>
          <p className="text-white/80 text-[15px] mb-3" style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Day/Night Pass entries are registered on arrival at the front desk — no online reservation
            needed. Groups planning a large outing are welcome to call ahead so we can prepare a
            cottage for you.
          </p>
          <p className="text-white/60 text-[13.5px] mb-9" style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Open daily — Day Pass mornings through sunset, Night Pass evenings after.
          </p>
          <Link href="/contact" className="inline-block px-8 py-4 rounded-full text-[15px] font-medium tracking-wide transition-all duration-300 hover:brightness-110 hover:-translate-y-0.5 hover:shadow-xl active:scale-95" style={{ background: '#C97B4A', color: '#fff', fontFamily: 'Work Sans, sans-serif' }}>
            Contact Us
          </Link>
          </Reveal>
        </div>
      </section>
    </>
  )
}
