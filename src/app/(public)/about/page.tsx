export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-900 to-teal-700 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-4">About AquaVerde</h1>
          <p className="text-blue-100 text-lg">A family-owned beach resort dedicated to authentic Filipino hospitality.</p>
        </div>
      </section>

      {/* Story */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-5">Our Story</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              AquaVerde Beach Resort was founded with a simple dream — to create a place where families and friends
              could escape the hustle of city life and reconnect with nature.
            </p>
            <p className="text-gray-600 leading-relaxed mb-4">
              Nestled along the pristine shores of Sarangani, South Cotabato, our resort offers a perfect blend
              of natural beauty and modern comfort. From our well-appointed rooms to our beachside cottages,
              every corner of AquaVerde is designed to make you feel at home.
            </p>
            <p className="text-gray-600 leading-relaxed">
              We take pride in our warm, personalized service — because to us, every guest is family.
            </p>
          </div>
          <div className="bg-gradient-to-br from-blue-100 to-teal-100 rounded-2xl h-72 flex items-center justify-center">
            <span className="text-8xl">🌊</span>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-gray-800 text-center mb-12">What We Stand For</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: '🤝', title: 'Warm Hospitality', desc: 'Every guest is welcomed like family. Our staff goes above and beyond to make your stay memorable.' },
              { icon: '🌿', title: 'Nature First', desc: 'We are committed to preserving the natural beauty of our surroundings for future generations to enjoy.' },
              { icon: '⭐', title: 'Quality Experience', desc: 'From clean, comfortable rooms to fresh, delicious food — we never compromise on quality.' },
            ].map(v => (
              <div key={v.title} className="bg-white rounded-2xl p-6 text-center shadow-sm">
                <div className="text-4xl mb-4">{v.icon}</div>
                <h3 className="font-semibold text-gray-800 mb-2">{v.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Amenities */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-gray-800 text-center mb-12">Resort Amenities</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              '🏖️ Private Beach', '🏊 Swimming Pool', '🍽️ Restaurant',
              '⛺ Cottages', '🚗 Parking', '🤿 Water Sports',
              '🛶 Kayaking', '🌅 Beach Bar', '📶 Free WiFi',
              '🎣 Fishing', '🏐 Beach Volleyball', '🌙 Night Events',
            ].map(a => (
              <div key={a} className="bg-gray-50 rounded-xl p-4 text-center text-sm text-gray-700 font-medium">
                {a}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
