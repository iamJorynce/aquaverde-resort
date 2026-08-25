import Link from 'next/link'
import { getResortSettings } from '@/lib/resort-settings'

export default async function Footer() {
  const settings = await getResortSettings()

  return (
    <footer style={{ background: '#0F2626' }} className="text-white/70">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-16 md:py-20 grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
        <div className="md:col-span-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #C97B4A 0%, #1F6E63 100%)' }}>
              <span className="text-white text-sm" style={{ fontFamily: 'Fraunces, serif' }}>AV</span>
            </div>
            <span className="text-white text-lg" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>{settings.resort_name}</span>
          </div>
          <p className="text-[14.5px] leading-relaxed max-w-sm" style={{ fontFamily: 'Work Sans, sans-serif' }}>
            A quiet stretch of coastline in Sarangani, South Cotabato — where the tide sets the schedule
            and the only agenda is the one you bring with you.
          </p>
        </div>
        <div className="md:col-span-3">
          <div className="text-white text-[13px] tracking-[0.12em] uppercase mb-5" style={{ fontFamily: 'Work Sans, sans-serif' }}>Explore</div>
          <div className="flex flex-col gap-3 text-[14.5px]" style={{ fontFamily: 'Work Sans, sans-serif' }}>
            <Link href="/" className="hover:text-white transition-colors w-fit">Home</Link>
            <Link href="/about" className="hover:text-white transition-colors w-fit">About Us</Link>
            <Link href="/rooms" className="hover:text-white transition-colors w-fit">Rooms &amp; Rates</Link>
            <Link href="/contact" className="hover:text-white transition-colors w-fit">Contact</Link>
            <Link href="/booking" className="hover:text-white transition-colors w-fit">Book Now</Link>
          </div>
        </div>
        <div className="md:col-span-4">
          <div className="text-white text-[13px] tracking-[0.12em] uppercase mb-5" style={{ fontFamily: 'Work Sans, sans-serif' }}>Find Us</div>
          <div className="flex flex-col gap-3 text-[14.5px]" style={{ fontFamily: 'Work Sans, sans-serif' }}>
            <div>{settings.address}</div>
            <div>{settings.contact}</div>
            <div>{settings.email}</div>
            <div className="opacity-60">Front desk open 24/7</div>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-[13px] opacity-50" style={{ fontFamily: 'Work Sans, sans-serif' }}>
          <span>© {new Date().getFullYear()} {settings.resort_name}. All rights reserved.</span>
          <span>{settings.address}</span>
        </div>
      </div>
    </footer>
  )
}
