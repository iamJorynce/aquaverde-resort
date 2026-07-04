import Link from 'next/link'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center text-white font-bold text-sm">AV</div>
            <span className="font-semibold text-gray-800">AquaVerde Beach Resort</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-600">
            <Link href="/" className="hover:text-blue-700 transition-colors">Home</Link>
            <Link href="/about" className="hover:text-blue-700 transition-colors">About</Link>
            <Link href="/rooms" className="hover:text-blue-700 transition-colors">Rooms</Link>
            <Link href="/contact" className="hover:text-blue-700 transition-colors">Contact</Link>
            <Link href="/booking" className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-lg transition-colors">
              Book Now
            </Link>
          </nav>
          {/* Mobile nav */}
          <div className="md:hidden">
            <Link href="/booking" className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">Book Now</Link>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-blue-700 rounded-lg flex items-center justify-center text-white font-bold text-xs">AV</div>
              <span className="text-white font-semibold">AquaVerde Beach Resort</span>
            </div>
            <p className="text-sm leading-relaxed">
              Your perfect beachside getaway in Sarangani, South Cotabato. Experience the beauty of nature with world-class hospitality.
            </p>
          </div>
          <div>
            <div className="text-white font-medium mb-3">Quick Links</div>
            <div className="space-y-2 text-sm">
              <Link href="/" className="block hover:text-white transition-colors">Home</Link>
              <Link href="/about" className="block hover:text-white transition-colors">About Us</Link>
              <Link href="/rooms" className="block hover:text-white transition-colors">Rooms & Rates</Link>
              <Link href="/contact" className="block hover:text-white transition-colors">Contact</Link>
              <Link href="/booking" className="block hover:text-white transition-colors">Book Now</Link>
            </div>
          </div>
          <div>
            <div className="text-white font-medium mb-3">Contact Us</div>
            <div className="space-y-2 text-sm">
              <div>📍 Sarangani, South Cotabato, PH</div>
              <div>📞 +63 912 345 6789</div>
              <div>✉️ info@aquaverde.ph</div>
              <div>🕐 Open 24/7</div>
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 mt-8 pt-8 border-t border-gray-800 text-sm text-center">
          © {new Date().getFullYear()} AquaVerde Beach Resort. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
