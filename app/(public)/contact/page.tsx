import Reveal from '@/components/public/Reveal'
import { getResortSettings } from '@/lib/resort-settings'

const IMG_SUNSET = '/images/1.jpg'

export default async function ContactPage() {
  const settings = await getResortSettings()

  return (
    <>
      {/* ===== HERO ===== */}
      <section className="relative h-[42vh] min-h-[320px] flex items-end overflow-hidden">
        <img src={`${IMG_SUNSET}?w=1800&q=80&auto=format&fit=crop`} alt="Sunset at AquaVerde Beach Resort" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(15,38,38,0.25) 0%, rgba(15,38,38,0.8) 100%)' }} />
        <div className="relative max-w-7xl mx-auto px-5 md:px-8 pb-14 w-full">
          <div className="pub-hero-in text-white/70 text-[12.5px] tracking-[0.2em] uppercase mb-4" style={{ fontFamily: 'Work Sans, sans-serif' }}>Get in Touch</div>
          <h1 className="pub-hero-in text-white text-[38px] md:text-[54px] leading-tight" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, animationDelay: '120ms' }}>
            Contact Us
          </h1>
        </div>
      </section>

      {/* ===== CONTACT GRID ===== */}
      <section className="py-20 md:py-24" style={{ background: '#FAF6EF' }}>
        <div className="max-w-5xl mx-auto px-5 md:px-8 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">

          {/* Contact info */}
          <Reveal variant="left">
          <div>
            <h2 className="text-[24px] mb-8" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#1A2E2B' }}>
              We'd Love to Hear From You
            </h2>
            <div className="space-y-7">
              {[
                { label: 'Address', value: `${settings.resort_name}\n${settings.address}` },
                { label: 'Phone', value: settings.contact },
                { label: 'Email', value: settings.email },
                { label: 'Facebook', value: settings.facebook_url || 'Not set — add this in Settings' },
                { label: 'Hours', value: 'Open 24/7 — front desk always staffed' },
              ].map((c, i) => (
                <Reveal key={c.label} delay={i * 60}>
                <div>
                  <div className="text-[12px] tracking-[0.15em] uppercase mb-1.5" style={{ fontFamily: 'Work Sans, sans-serif', color: '#C97B4A' }}>{c.label}</div>
                  <div className="text-[15px] whitespace-pre-line leading-relaxed" style={{ fontFamily: 'Work Sans, sans-serif', color: '#3A362E' }}>{c.value}</div>
                </div>
                </Reveal>
              ))}
            </div>
          </div>
          </Reveal>

          {/* Message form */}
          <Reveal variant="right" delay={100}>
          <div>
            <h2 className="text-[24px] mb-8" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, color: '#1A2E2B' }}>
              Send a Message
            </h2>
            <div className="rounded-2xl p-6 md:p-7 space-y-4" style={{ background: '#fff' }}>
              <div>
                <label className="block text-[13px] mb-1.5" style={{ fontFamily: 'Work Sans, sans-serif', color: '#6B6355' }}>Your Name</label>
                <input
                  type="text"
                  placeholder="Juan Dela Cruz"
                  className="w-full px-4 py-3 rounded-xl text-[14.5px] outline-none transition-all duration-200 focus:shadow-md"
                  style={{ fontFamily: 'Work Sans, sans-serif', background: '#FAF6EF', border: '1px solid #E5E0D3', color: '#1A2E2B' }}
                />
              </div>
              <div>
                <label className="block text-[13px] mb-1.5" style={{ fontFamily: 'Work Sans, sans-serif', color: '#6B6355' }}>Email Address</label>
                <input
                  type="email"
                  placeholder="you@email.com"
                  className="w-full px-4 py-3 rounded-xl text-[14.5px] outline-none transition-all duration-200 focus:shadow-md"
                  style={{ fontFamily: 'Work Sans, sans-serif', background: '#FAF6EF', border: '1px solid #E5E0D3', color: '#1A2E2B' }}
                />
              </div>
              <div>
                <label className="block text-[13px] mb-1.5" style={{ fontFamily: 'Work Sans, sans-serif', color: '#6B6355' }}>Message</label>
                <textarea
                  rows={5}
                  placeholder="How can we help you?"
                  className="w-full px-4 py-3 rounded-xl text-[14.5px] outline-none resize-none transition-all duration-200 focus:shadow-md"
                  style={{ fontFamily: 'Work Sans, sans-serif', background: '#FAF6EF', border: '1px solid #E5E0D3', color: '#1A2E2B' }}
                />
              </div>
              <a
                href={`mailto:${settings.email}`}
                className="block w-full text-center py-3.5 rounded-full text-[14.5px] font-medium tracking-wide transition-all duration-300 hover:brightness-110 hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
                style={{ background: '#C97B4A', color: '#fff', fontFamily: 'Work Sans, sans-serif' }}
              >
                Send Message
              </a>
              <p className="text-[12.5px] text-center" style={{ fontFamily: 'Work Sans, sans-serif', color: '#9A9182' }}>
                This opens your email app, addressed to {settings.email}
              </p>
            </div>
          </div>
          </Reveal>
        </div>
      </section>

      {/* ===== MAP ===== */}
      <section className="relative h-[420px] w-full" style={{ background: '#0F2626' }}>
        <iframe
          title="Location map"
          // Pinpoint marker at Citi Hotel's exact coordinates.
          src="https://www.google.com/maps?q=7.444940037218176,125.80734148928384&z=17&output=embed"
          width="100%"
          height="100%"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </section>
    </>
  )
}
