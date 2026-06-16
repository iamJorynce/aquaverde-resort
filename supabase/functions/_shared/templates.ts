// =============================================================================
// supabase/functions/_shared/templates.ts
// =============================================================================

export const emailTemplates = {
  bookingConfirmation: (data: {
    guestName: string
    bookingNumber: string
    roomName: string
    checkIn: string
    checkOut: string
    numNights: number
    totalAmount: number
    paymentStatus: string
  }) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: #0C447C; padding: 32px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 22px; }
    .header p { color: #C9DEFF; margin: 6px 0 0; font-size: 14px; }
    .body { padding: 32px; background: #fff; }
    .booking-card { background: #E6F1FB; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .row { display: flex; justify-content: space-between; padding: 6px 0;
           border-bottom: 1px solid #D0E4F5; font-size: 14px; }
    .row:last-child { border-bottom: none; }
    .label { color: #555; }
    .value { font-weight: 600; }
    .total-row { font-size: 16px; font-weight: 700; color: #0C447C; margin-top: 8px; }
    .btn { display: block; background: #0C447C; color: #fff; text-decoration: none;
           padding: 12px 28px; border-radius: 6px; text-align: center;
           font-size: 15px; margin: 24px auto; width: fit-content; }
    .footer { background: #f5f5f5; padding: 20px 32px; text-align: center;
              font-size: 12px; color: #888; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px;
             font-size: 12px; font-weight: 600; }
    .badge-pending { background: #FAEEDA; color: #BA7517; }
    .badge-paid    { background: #EAF3DE; color: #3B6D11; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌊 AquaVerde Beach Resort</h1>
      <p>Your booking is confirmed!</p>
    </div>
    <div class="body">
      <p>Hi <strong>${data.guestName}</strong>,</p>
      <p>Thank you for choosing AquaVerde Beach Resort. Here are your booking details:</p>
      <div class="booking-card">
        <div class="row"><span class="label">Booking #</span><span class="value">${data.bookingNumber}</span></div>
        <div class="row"><span class="label">Accommodation</span><span class="value">${data.roomName}</span></div>
        <div class="row"><span class="label">Check-in</span><span class="value">${data.checkIn} (2:00 PM)</span></div>
        <div class="row"><span class="label">Check-out</span><span class="value">${data.checkOut} (12:00 PM)</span></div>
        <div class="row"><span class="label">Duration</span><span class="value">${data.numNights} night(s)</span></div>
        <div class="row total-row">
          <span>Total Amount</span>
          <span>₱${data.totalAmount.toLocaleString()}</span>
        </div>
        <div class="row">
          <span class="label">Payment Status</span>
          <span class="badge ${data.paymentStatus === 'paid' ? 'badge-paid' : 'badge-pending'}">
            ${data.paymentStatus.toUpperCase()}
          </span>
        </div>
      </div>
      <p style="font-size:14px;color:#666;">
        Please bring a valid government-issued ID and your booking confirmation on check-in day.
        For questions, call us at <strong>${Deno.env.get('RESORT_PHONE')}</strong>.
      </p>
      <a class="btn" href="${Deno.env.get('SUPABASE_URL')?.replace('supabase.co','vercel.app')}/my-bookings">
        View My Booking
      </a>
    </div>
    <div class="footer">
      AquaVerde Beach Resort &bull; Sarangani, South Cotabato &bull; ${Deno.env.get('RESORT_PHONE')}<br>
      &copy; ${new Date().getFullYear()} AquaVerde Beach Resort. All rights reserved.
    </div>
  </div>
</body>
</html>`,

  paymentConfirmation: (data: {
    guestName: string
    bookingNumber: string
    amount: number
    paymentMethod: string
    reference: string
    remainingBalance: number
  }) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: #3B6D11; padding: 28px 32px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 20px; }
    .body { padding: 32px; background: #fff; }
    .amount-box { background: #EAF3DE; border-radius: 8px; padding: 20px;
                  text-align: center; margin: 20px 0; }
    .amount { font-size: 36px; font-weight: 700; color: #3B6D11; }
    .footer { background: #f5f5f5; padding: 16px 32px; text-align: center;
              font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>✅ Payment Received</h1></div>
    <div class="body">
      <p>Hi <strong>${data.guestName}</strong>,</p>
      <p>We received your payment for booking <strong>${data.bookingNumber}</strong>.</p>
      <div class="amount-box">
        <div style="font-size:13px;color:#555;margin-bottom:4px">Amount Paid</div>
        <div class="amount">₱${data.amount.toLocaleString()}</div>
        <div style="font-size:13px;color:#555;margin-top:8px">via ${data.paymentMethod}</div>
        ${data.reference ? `<div style="font-size:12px;color:#888">Ref: ${data.reference}</div>` : ''}
      </div>
      ${data.remainingBalance > 0
        ? `<p style="color:#BA7517;font-weight:600">Remaining balance: ₱${data.remainingBalance.toLocaleString()} — payable on check-in.</p>`
        : `<p style="color:#3B6D11;font-weight:600">Your booking is fully paid. See you at the resort! 🏖️</p>`
      }
    </div>
    <div class="footer">AquaVerde Beach Resort &bull; ${Deno.env.get('RESORT_PHONE')}</div>
  </div>
</body>
</html>`,

  checkInReminder: (data: {
    guestName: string
    bookingNumber: string
    roomName: string
    checkInDate: string
  }) => `
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>body{font-family:Arial,sans-serif;color:#333}.container{max-width:600px;margin:0 auto}
.header{background:#0C447C;padding:28px 32px;text-align:center}.header h1{color:#fff;margin:0;font-size:20px}
.body{padding:32px;background:#fff}.footer{background:#f5f5f5;padding:16px 32px;text-align:center;font-size:12px;color:#888}
</style></head><body>
<div class="container">
  <div class="header"><h1>⏰ Check-in Reminder</h1></div>
  <div class="body">
    <p>Hi <strong>${data.guestName}</strong>,</p>
    <p>This is a friendly reminder that your check-in at <strong>AquaVerde Beach Resort</strong> is <strong>tomorrow, ${data.checkInDate}</strong>.</p>
    <p>📋 <strong>Booking:</strong> ${data.bookingNumber}<br>
       🏠 <strong>Accommodation:</strong> ${data.roomName}<br>
       🕑 <strong>Check-in time:</strong> 2:00 PM onwards</p>
    <p>Please bring:<br>
      ✅ Valid government-issued ID<br>
      ✅ This booking confirmation<br>
      ✅ Security deposit (if not yet paid)</p>
    <p>We look forward to welcoming you! 🌊</p>
  </div>
  <div class="footer">AquaVerde Beach Resort &bull; ${Deno.env.get('RESORT_PHONE')}</div>
</div>
</body></html>`,
}

export const smsTemplates = {
  bookingConfirmation: (bookingNumber: string, checkIn: string, roomName: string) =>
    `AquaVerde Resort: Your booking ${bookingNumber} is confirmed! ${roomName} on ${checkIn}. Check-in: 2PM. Bring valid ID. Questions? Call ${Deno.env.get('RESORT_PHONE')}`,

  paymentConfirmation: (bookingNumber: string, amount: number, balance: number) =>
    `AquaVerde Resort: Payment of P${amount.toLocaleString()} received for ${bookingNumber}. ${balance > 0 ? `Remaining balance: P${balance.toLocaleString()}.` : 'Fully paid!'}`,

  checkInReminder: (guestName: string, checkIn: string) =>
    `AquaVerde Resort: Hi ${guestName}! Reminder: your check-in is tomorrow ${checkIn} at 2PM. See you! - AquaVerde Team`,

  checkOutReminder: (guestName: string, checkOut: string) =>
    `AquaVerde Resort: Hi ${guestName}! Friendly reminder: check-out today by 12:00 PM (${checkOut}). Thank you for staying with us!`,

  promoAlert: (promoTitle: string, promoCode: string, validUntil: string) =>
    `AquaVerde Resort: ${promoTitle}! Use code ${promoCode} when booking. Valid until ${validUntil}. Book: aquaverde.ph`,
}
