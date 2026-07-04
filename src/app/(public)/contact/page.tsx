export default function ContactPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-900 to-teal-700 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-4">Contact Us</h1>
          <p className="text-blue-100 text-lg">We'd love to hear from you. Reach out anytime!</p>
        </div>
      </section>

      <section className="py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-12">

          {/* Contact info */}
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-8">Get in Touch</h2>
            <div className="space-y-6">
              {[
                { icon: '📍', label: 'Address', value: 'AquaVerde Beach Resort\nSarangani, South Cotabato\nPhilippines' },
                { icon: '📞', label: 'Phone', value: '+63 912 345 6789' },
                { icon: '✉️', label: 'Email', value: 'info@aquaverde.ph' },
                { icon: '💬', label: 'Facebook', value: 'facebook.com/aquaverderesort' },
                { icon: '🕐', label: 'Operating Hours', value: 'Open 24/7\nFront desk always available' },
              ].map(c => (
                <div key={c.label} className="flex gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                    {c.icon}
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">{c.label}</div>
                    <div className="text-gray-700 text-sm whitespace-pre-line">{c.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Message form (static — no backend needed, just a mailto or contact form service) */}
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-8">Send a Message</h2>
            <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Your Name</label>
                <input type="text" placeholder="Juan Dela Cruz"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
                <input type="email" placeholder="you@email.com"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
                <textarea rows={5} placeholder="How can we help you?"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-none" />
              </div>
              <a href="mailto:info@aquaverde.ph"
                className="block w-full bg-blue-700 hover:bg-blue-800 text-white text-center py-3 rounded-xl text-sm font-medium transition-colors">
                Send Message
              </a>
              <p className="text-xs text-gray-400 text-center">
                This will open your email app. Or message us directly at info@aquaverde.ph
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Map placeholder */}
      <section className="bg-gray-200 h-72 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-2">🗺️</div>
          <div className="font-medium">Sarangani, South Cotabato</div>
          <div className="text-sm mt-1">Google Maps embed — add your coordinates in the code</div>
        </div>
      </section>
    </>
  )
}
