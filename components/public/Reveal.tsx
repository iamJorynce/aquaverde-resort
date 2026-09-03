'use client'

import { useEffect, useRef, useState } from 'react'

type Variant = 'up' | 'scale' | 'left' | 'right'

/**
 * Scroll-reveal wrapper for public marketing pages (home, rooms, about,
 * contact, day-use). Wrap any block of content — a section, a grid card,
 * a paragraph — and it fades/slides into place the first time it enters
 * the viewport. Plays once per mount (doesn't re-trigger on scroll back
 * up), and respects prefers-reduced-motion via the CSS in globals.css.
 *
 * Usage:
 *   <Reveal><h2>Heading</h2></Reveal>
 *   <Reveal variant="scale" delay={150}><Card /></Reveal>
 *   {items.map((item, i) => <Reveal key={item.id} delay={i * 80}>...</Reveal>)}
 */
export default function Reveal({
  children,
  delay = 0,
  variant = 'up',
  className = '',
}: {
  children: React.ReactNode
  delay?: number
  variant?: Variant
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // If IntersectionObserver isn't available for some reason, just show it.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const variantClass =
    variant === 'scale' ? 'pub-reveal-scale'
    : variant === 'left' ? 'pub-reveal-left'
    : variant === 'right' ? 'pub-reveal-right'
    : 'pub-reveal'

  return (
    <div
      ref={ref}
      className={`${variantClass} ${visible ? 'pub-reveal-in' : ''} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  )
}
