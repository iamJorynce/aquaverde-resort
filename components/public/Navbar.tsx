'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useResortSettings } from '@/hooks/useResortSettings'

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/rooms', label: 'Rooms' },
  { href: '/day-use', label: 'Day Use' },
  { href: '/contact', label: 'Contact' },
]

export default function Navbar() {
  const { settings } = useResortSettings()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 40) }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => { setMenuOpen(false) }, [pathname])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  const isSolid = scrolled || menuOpen

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          background: isSolid ? 'rgba(15, 38, 38, 0.92)' : 'transparent',
          backdropFilter: isSolid ? 'blur(10px)' : 'none',
          boxShadow: isSolid ? '0 1px 0 rgba(255,255,255,0.06)' : 'none',
        }}
      >
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <div className="flex items-center justify-between h-[72px] md:h-20">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0">
  <img
    src="/images/logo.png"
    alt="AquaVerde Resort"
    className="w-full h-full object-cover"
  />
</div>
              <span className="text-white tracking-wide text-[15px] md:text-lg leading-none" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>
                {settings.resort_name}
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-10">
              {NAV_LINKS.map(link => (
                <Link key={link.href} href={link.href}
                  className="text-[14px] tracking-wide text-white/85 hover:text-white transition-colors"
                  style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  {link.label}
                </Link>
              ))}
              <Link href="/booking"
                className="px-5 py-2.5 rounded-full text-[13.5px] font-medium tracking-wide transition-all hover:brightness-110"
                style={{ background: '#C97B4A', color: '#fff', fontFamily: 'Work Sans, sans-serif' }}>
                Book Your Stay
              </Link>
            </nav>

            <button
              onClick={() => setMenuOpen(v => !v)}
              className="md:hidden relative w-9 h-9 flex flex-col items-center justify-center gap-[5px]"
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              <span className="block w-6 h-[1.5px] bg-white transition-transform duration-300"
                style={{ transform: menuOpen ? 'translateY(6.5px) rotate(45deg)' : 'none' }} />
              <span className="block w-6 h-[1.5px] bg-white transition-opacity duration-200"
                style={{ opacity: menuOpen ? 0 : 1 }} />
              <span className="block w-6 h-[1.5px] bg-white transition-transform duration-300"
                style={{ transform: menuOpen ? 'translateY(-6.5px) rotate(-45deg)' : 'none' }} />
            </button>
          </div>
        </div>
      </header>

      <div
        className="fixed inset-0 z-40 md:hidden transition-opacity duration-300"
        style={{ background: '#0F2626', opacity: menuOpen ? 1 : 0, pointerEvents: menuOpen ? 'auto' : 'none' }}
      >
        <div className="flex flex-col justify-center items-center h-full gap-8 px-8">
          {NAV_LINKS.map((link, i) => (
            <Link key={link.href} href={link.href}
              className="text-white text-3xl transition-all duration-300"
              style={{
                fontFamily: 'Fraunces, serif', fontWeight: 400,
                transitionDelay: menuOpen ? `${i * 60}ms` : '0ms',
                opacity: menuOpen ? 1 : 0,
                transform: menuOpen ? 'translateY(0)' : 'translateY(12px)',
              }}>
              {link.label}
            </Link>
          ))}
          <Link href="/booking"
            className="mt-4 px-8 py-3.5 rounded-full text-base font-medium tracking-wide"
            style={{
              background: '#C97B4A', color: '#fff', fontFamily: 'Work Sans, sans-serif',
              transitionDelay: menuOpen ? '240ms' : '0ms', opacity: menuOpen ? 1 : 0,
            }}>
            Book Your Stay
          </Link>
        </div>
      </div>
    </>
  )
}
