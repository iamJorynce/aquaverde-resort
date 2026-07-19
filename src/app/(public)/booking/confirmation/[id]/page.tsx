import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*, guests(full_name, email, phone), rooms(room_number, room_types_config(name, base_rate)), cottages(name, cottage_code)')
    .eq('id', id)
    .single()

  if (error || !booking) notFound()

  // If this booking is part of a multi-room group, fetch all rooms in the group
  let groupBookings: any[] = [booking]
  if (booking.group_number) {
    const { data: allInGroup } = await supabase
      .from('bookings')
      .select('*, rooms(room_number, room_types_config(name, base_rate))')
      .eq('group_number', booking.group_number)
      .order('created_at')
    if (allInGroup && allInGroup.length > 0) groupBookings = allInGroup
  }

  const nights = Math.max(1, Math.ceil(
    (new Date(booking.check_out_date).getTime() - new Date(booking.check_in_date).getTime()) / 86400000
  ))

  const groupTotal = groupBookings.reduce((s, b) => s + Number(b.total_amount), 0)
  const primaryRoomRate = (groupBookings[0]?.rooms as any)?.room_types_config?.base_rate ?? 0
  const reservationFee = Math.ceil((primaryRoomRate * (1 / nights)) * 0.5 * nights) // 50% of first night, matches booking flow
  const reservationFeeSimple = Math.ceil(primaryRoomRate * 0.5)

  return (
    <>
      <section className="bg-gradient-to-br from-green-800 to-teal-700 text-white py-20">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-4xl font-bold mb-3">Booking Submitted!</h1>
          <p className="text-green-100 text-lg">
            Your reservation request has been received. We're verifying your payment now.
          </p>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="max-w-lg mx-auto px-4 space-y-5">

          {/* Status banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4">
            <div className="text-2xl">⏳</div>
            <div>
              <div className="font-semibold text-amber-800 mb-1">Pending Payment Verification</div>
              <div className="text-sm text-amber-700">
                Our team is verifying your deposit payment and will confirm your booking within 24 hours.
                We'll reach out to you via the contact information you provided.
              </div>
            </div>
          </div>

          {/* Booking details */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Booking Details {groupBookings.length > 1 && `(${groupBookings.length} rooms)`}
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Booking Reference</span>
                <span className="font-bold text-blue-700">{booking.booking_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Guest Name</span>
                <span className="font-medium">{(booking.guests as any)?.full_name}</span>
              </div>

              {groupBookings.map((b, i) => (
                <div key={b.id} className="flex justify-between">
                  <span className="text-gray-500">{groupBookings.length > 1 ? `Room ${i + 1}` : 'Room'}</span>
                  <span className="font-medium">
                    {(b.rooms as any)?.room_types_config?.name ?? 'Room'}
                    {(b.rooms as any)?.room_number ? ` (${(b.rooms as any).room_number})` : ''}
                  </span>
                </div>
              ))}

              <div className="flex justify-between">
                <span className="text-gray-500">Check-in</span>
                <span className="font-medium">
                  {new Date(booking.check_in_date).toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Check-out</span>
                <span className="font-medium">
                  {new Date(booking.check_out_date).toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Duration</span>
                <span className="font-medium">{nights} night{nights > 1 ? 's' : ''}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Guests</span>
                <span className="font-medium">
                  {booking.num_adults} adult{booking.num_adults > 1 ? 's' : ''}
                  {booking.num_children > 0 ? `, ${booking.num_children} child${booking.num_children > 1 ? 'ren' : ''}` : ''}
                </span>
              </div>
            </div>

            <div className="border-t border-gray-100 mt-4 pt-4 space-y-2 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Total Bill</span>
                <span>₱{groupTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-semibold text-blue-700">
                <span>Reservation Fee (submitted)</span>
                <span>₱{reservationFeeSimple.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-gray-400 text-xs">
                <span>Balance due on check-in</span>
                <span>₱{(groupTotal - reservationFeeSimple).toLocaleString()}</span>
              </div>
            </div>

            {booking.payment_reference && (
              <div className="border-t border-gray-100 mt-4 pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Payment Method</span>
                  <span className="font-medium capitalize">{booking.payment_method_used?.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500">Reference Number</span>
                  <span className="font-medium">{booking.payment_reference}</span>
                </div>
              </div>
            )}
          </div>

          {/* What's next */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">What Happens Next</div>
            <div className="space-y-4">
              {[
                { n: '1', title: 'We verify your payment', desc: 'Our team checks your proof of payment against the reference number you provided.' },
                { n: '2', title: 'You receive confirmation', desc: `We'll contact you at ${(booking.guests as any)?.email || (booking.guests as any)?.phone || 'the contact info you provided'} once your booking is confirmed.` },
                { n: '3', title: 'Arrive on your check-in date', desc: `Pay the remaining balance of ₱${(groupTotal - reservationFeeSimple).toLocaleString()} at check-in.` },
              ].map(s => (
                <div key={s.n} className="flex gap-4">
                  <div className="w-7 h-7 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    {s.n}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">{s.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {booking.special_requests && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Special Requests</div>
              <p className="text-sm text-gray-600">{booking.special_requests}</p>
            </div>
          )}

          <div className="text-center space-y-3">
            <div className="text-xs text-gray-400">
              Please save your booking reference: <strong className="text-gray-600">{booking.booking_number}</strong>
            </div>
            <div className="flex gap-3 justify-center">
              <Link href="/" className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50">
                Back to Home
              </Link>
              <Link href="/contact" className="px-5 py-2.5 bg-blue-700 text-white rounded-xl text-sm hover:bg-blue-800">
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
