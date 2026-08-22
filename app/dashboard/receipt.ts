'use client'

interface ReceiptLineItem {
  label: string
  qty?: number
  amount: number
}

interface ReceiptData {
  title: string                // e.g. "AquaVerde Beach Resort"
  subtitle?: string            // e.g. resort address — defaults below if omitted
  receiptNumber: string        // e.g. "BK-2026-1042" or "TXN-..."
  receiptType: string          // e.g. "Booking Confirmation", "Official Receipt"
  date: string                 // formatted date string
  guestName: string
  guestContact?: string
  lineItems: ReceiptLineItem[]
  checkindate?: string
  checkoutdate?: string
  discount?: number
  total: number
  amountPaid?: number
  balance?: number
  paymentMethod?: string
  footerNote?: string
}

// Escapes HTML-significant characters before interpolating a value into
// the receipt markup below. Several of these fields — guestName and
// guestContact especially — originate from the public, unauthenticated
// booking form (full_name/email/phone), which does not restrict what
// characters a guest can type. Without this, a guest could submit a name
// like `<img src=x onerror=...>` and have it execute in a staff member's
// browser the next time that booking's receipt is printed via
// `document.write` below.
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Renders nothing visible inline — call printReceipt(data) to open a
// print-formatted window. Keeping this as a function (not a modal component)
// avoids fighting with the dashboard's own layout/scroll containers.
export function printReceipt(data: ReceiptData) {
  const win = window.open('', '_blank', 'width=400,height=600')
  if (!win) {
    alert('Please allow popups to print receipts.')
    return
  }

  const lineItemsHtml = data.lineItems.map(item => `
    <tr>
      <td style="padding:4px 0;">${escapeHtml(item.label)}${item.qty ? ` × ${escapeHtml(item.qty)}` : ''}</td>
      <td style="padding:4px 0; text-align:right;">₱${item.amount.toLocaleString()}</td>
    </tr>
  `).join('')

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(data.receiptType)} — ${escapeHtml(data.receiptNumber)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', monospace;
    font-size: 13px;
    color: #111;
    padding: 24px;
    max-width: 360px;
    margin: 0 auto;
  }
  .center { text-align: center; }
  .title { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
  .subtitle { font-size: 11px; color: #555; margin-bottom: 12px; }
  .divider { border-top: 1px dashed #999; margin: 10px 0; }
  .row { display: flex; justify-content: space-between; padding: 2px 0; }
  table { width: 100%; border-collapse: collapse; }
  .total-row td { font-weight: bold; font-size: 14px; padding-top: 8px; border-top: 1px solid #333; }
  .footer { text-align: center; font-size: 11px; color: #555; margin-top: 16px; }
  @media print {
    body { padding: 8px; }
  }
</style>
</head>
<body>
  <div class="center">
    <div class="title">${escapeHtml(data.title)}</div>
    <div class="subtitle">${escapeHtml(data.subtitle ?? 'Sarangani, South Cotabato, PH')}</div>
  </div>

  <div class="divider"></div>

  <div class="row"><span>${escapeHtml(data.receiptType)}</span><span>${escapeHtml(data.receiptNumber)}</span></div>
  <div class="row"><span>Date</span><span>${escapeHtml(data.date)}</span></div>
  <div class="row"><span>Guest</span><span>${escapeHtml(data.guestName)}</span></div>

  ${data.guestContact ? `<div class="row"><span>Contact</span><span>${escapeHtml(data.guestContact)}</span></div>` : ''}

  <div class="divider"></div>
  ${data.checkindate ? `<div class="row"><span>Check-in Date</span><span>${escapeHtml(data.checkindate)}</span></div>` : ''}
  ${data.checkoutdate ? `<div class="row"><span>Check-out Date</span><span>${escapeHtml(data.checkoutdate)}</span></div>` : ''}
  <table>
    <tbody>
      ${lineItemsHtml}
      ${data.discount ? `<tr><td style="padding:4px 0;">Discount</td><td style="padding:4px 0; text-align:right;">-₱${data.discount.toLocaleString()}</td></tr>` : ''}
      <tr class="total-row"><td>Total</td><td style="text-align:right;">₱${data.total.toLocaleString()}</td></tr>
      ${data.amountPaid !== undefined ? `<tr><td style="padding:4px 0;">Amount Paid</td><td style="padding:4px 0; text-align:right;">₱${data.amountPaid.toLocaleString()}</td></tr>` : ''}
      ${data.balance !== undefined && data.balance > 0 ? `<tr><td style="padding:4px 0; color:#a00;">Balance Due</td><td style="padding:4px 0; text-align:right; color:#a00;">₱${data.balance.toLocaleString()}</td></tr>` : ''}
    </tbody>
  </table>

  ${data.paymentMethod ? `<div class="row" style="margin-top:8px;"><span>Payment Method</span><span style="text-transform:capitalize;">${escapeHtml(data.paymentMethod.replace('_',' '))}</span></div>` : ''}

  <div class="divider"></div>

  <div class="footer">
    ${escapeHtml(data.footerNote ?? 'Thank you for staying with us!')}<br>
    Thank you for your payment.
  </div>

  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>
  `.trim()

  win.document.open()
  win.document.write(html)
  win.document.close()
}
