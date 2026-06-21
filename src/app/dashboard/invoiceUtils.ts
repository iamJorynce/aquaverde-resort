import type { SupabaseClient } from '@supabase/supabase-js'

interface CreateInvoiceParams {
  booking_id: string
  guest_id: string
  subtotal: number
  total: number
  amount_paid: number
  notes?: string
}

/**
 * Creates an invoice for a booking and returns the invoice record.
 * Called at walk-in registration and can be called again at check-out
 * to update the final payment. Safe to call multiple times — it will
 * update an existing invoice for the same booking rather than creating
 * a duplicate.
 */
export async function createOrUpdateInvoice(
  supabase: SupabaseClient,
  params: CreateInvoiceParams
) {
  const { booking_id, guest_id, subtotal, total, amount_paid, notes } = params

  // Check if an invoice already exists for this booking
  const { data: existing } = await supabase
    .from('invoices')
    .select('id, invoice_number')
    .eq('booking_id', booking_id)
    .maybeSingle()

  const status = amount_paid <= 0 ? 'unpaid'
    : amount_paid >= total ? 'paid'
    : 'partial'

  if (existing) {
    // Update existing invoice (e.g. on check-out when final payment is made)
    const { data, error } = await supabase
      .from('invoices')
      .update({ subtotal, total, paid: amount_paid, status, notes: notes ?? null })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) throw error
    return data
  } else {
    // Create new invoice (e.g. on walk-in registration)
    const invoiceNumber = `INV-${Date.now().toString().slice(-8)}`
    const due_date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        booking_id,
        guest_id,
        subtotal,
        total,
        paid: amount_paid,
        status,
        due_date,
        notes: notes ?? null,
      })
      .select()
      .single()

    if (error) throw error
    return data
  }
}
