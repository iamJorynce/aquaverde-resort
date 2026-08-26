'use client'

import { useState } from 'react'

interface RoomGalleryProps {
  images: string[]
  alt: string
  className?: string
}

export default function RoomGallery({ images, alt, className = '' }: RoomGalleryProps) {
  const [index, setIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  if (images.length === 0) return null

  function prev(e?: React.MouseEvent) {
    e?.stopPropagation()
    setIndex(i => (i - 1 + images.length) % images.length)
  }
  function next(e?: React.MouseEvent) {
    e?.stopPropagation()
    setIndex(i => (i + 1) % images.length)
  }

  return (
    <>
      <div className={`relative group ${className}`}>
        <img
          src={images[index]}
          alt={`${alt} — photo ${index + 1}`}
          onClick={() => setLightboxOpen(true)}
          className="absolute inset-0 w-full h-full object-cover cursor-pointer transition-transform duration-700 group-hover:scale-105"
        />

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-white text-lg opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(15,38,38,0.55)' }}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-white text-lg opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(15,38,38,0.55)' }}
            >
              ›
            </button>
            <div className="absolute bottom-2.5 left-0 right-0 flex justify-center gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={e => { e.stopPropagation(); setIndex(i) }}
                  aria-label={`Show photo ${i + 1}`}
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: i === index ? '16px' : '6px', background: i === index ? '#fff' : 'rgba(255,255,255,0.55)' }}
                />
              ))}
            </div>
            <div
              className="absolute top-2.5 right-2.5 text-[11px] px-2 py-1 rounded-full text-white"
              style={{ background: 'rgba(15,38,38,0.55)', fontFamily: 'Work Sans, sans-serif' }}
            >
              {index + 1}/{images.length}
            </div>
          </>
        )}
      </div>

      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(15,38,38,0.94)' }}
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label="Close"
            className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center text-white text-2xl leading-none"
            style={{ background: 'rgba(255,255,255,0.12)' }}
          >
            ×
          </button>

          <img
            src={images[index]}
            alt={`${alt} — photo ${index + 1}`}
            className="max-w-full max-h-[85vh] rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={prev}
                aria-label="Previous photo"
                className="absolute left-3 md:left-8 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-white text-2xl"
                style={{ background: 'rgba(255,255,255,0.12)' }}
              >
                ‹
              </button>
              <button
                type="button"
                onClick={next}
                aria-label="Next photo"
                className="absolute right-3 md:right-8 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-white text-2xl"
                style={{ background: 'rgba(255,255,255,0.12)' }}
              >
                ›
              </button>
              <div
                className="absolute bottom-6 left-0 right-0 text-center text-white/70 text-sm"
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                {index + 1} / {images.length}
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
