// ============================================================================
// Transaction Utility Functions
// Use these throughout your app for consistent transaction handling
// ============================================================================

import { SupabaseClient } from '@supabase/supabase-js'

export type TransactionType = 'pos' | 'checkin' | 'checkout' | 'dayuse' | 'booking' | 'payment' | 'refund'
export type TransactionStatus = 'pending' | 'completed' | 'cancelled'

export interface Transaction {
  id: string
  txn_number: string
  txn_type: TransactionType
  description: string
  amount: number
  payment_method: string
  status: TransactionStatus
  created_at: string
  completed_at?: string
  booking_id?: string
  order_id?: string
}

// ============================================================================
// CREATE TRANSACTION
// ============================================================================

export async function createTransaction(
  supabase: SupabaseClient,
  data: {
    txn_type: TransactionType
    description: string
    amount: number
    payment_method?: string
    booking_id?: string
    order_id?: string
  }
) {
  try {
    const txnNumber = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const { data: transaction, error } = await supabase
      .from('transactions')
      .insert({
        txn_number: txnNumber,
        txn_type: data.txn_type,
        description: data.description,
        amount: data.amount,
        payment_method: data.payment_method || null,
        status: 'pending',
        booking_id: data.booking_id || null,
        order_id: data.order_id || null,
      })
      .select()
      .single()

    if (error) throw error
    return { success: true, transaction }
  } catch (error: any) {
    console.error('Error creating transaction:', error)
    return { success: false, error: error.message }
  }
}

// ============================================================================
// MARK TRANSACTION AS COMPLETED
// ============================================================================

export async function completeTransaction(
  supabase: SupabaseClient,
  transactionId: string
) {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', transactionId)
      .select()
      .single()

    if (error) throw error
    return { success: true, transaction: data }
  } catch (error: any) {
    console.error('Error completing transaction:', error)
    return { success: false, error: error.message }
  }
}

// ============================================================================
// MARK TRANSACTION AS CANCELLED
// ============================================================================

export async function cancelTransaction(
  supabase: SupabaseClient,
  transactionId: string,
  reason?: string
) {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .update({
        status: 'cancelled',
        description: reason ? `${reason} [CANCELLED]` : '[CANCELLED]',
        completed_at: new Date().toISOString(),
      })
      .eq('id', transactionId)
      .select()
      .single()

    if (error) throw error
    return { success: true, transaction: data }
  } catch (error: any) {
    console.error('Error cancelling transaction:', error)
    return { success: false, error: error.message }
  }
}

// ============================================================================
// GET PENDING TRANSACTIONS
// ============================================================================

export async function getPendingTransactions(
  supabase: SupabaseClient,
  txnType?: TransactionType
) {
  try {
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (txnType) {
      query = query.eq('txn_type', txnType)
    }

    const { data, error } = await query

    if (error) throw error
    return { success: true, transactions: data || [] }
  } catch (error: any) {
    console.error('Error fetching pending transactions:', error)
    return { success: false, error: error.message, transactions: [] }
  }
}

// ============================================================================
// GET TRANSACTION COUNTS BY TYPE
// ============================================================================

export async function getTransactionCounts(
  supabase: SupabaseClient,
  status: TransactionStatus = 'pending'
) {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('txn_type')
      .eq('status', status)

    if (error) throw error

    const counts = {
      pos: 0,
      checkin: 0,
      checkout: 0,
      dayuse: 0,
      booking: 0,
      payment: 0,
      refund: 0,
    }

    data?.forEach((txn: any) => {
      if (txn.txn_type in counts) {
        counts[txn.txn_type as TransactionType]++
      }
    })

    return { success: true, counts }
  } catch (error: any) {
    console.error('Error fetching transaction counts:', error)
    return { success: false, error: error.message, counts: {} }
  }
}

// ============================================================================
// GET TRANSACTION SUMMARY
// ============================================================================

export async function getTransactionSummary(
  supabase: SupabaseClient,
  startDate?: string,
  endDate?: string
) {
  try {
    let query = supabase
      .from('transactions')
      .select('txn_type, status, amount, created_at')

    if (startDate) {
      query = query.gte('created_at', startDate)
    }
    if (endDate) {
      query = query.lte('created_at', endDate)
    }

    const { data, error } = await query

    if (error) throw error

    const summary = {
      total_transactions: data?.length || 0,
      total_amount: 0,
      by_type: {} as Record<TransactionType, { count: number; amount: number }>,
      by_status: {} as Record<TransactionStatus, { count: number; amount: number }>,
    }

    data?.forEach((txn: { txn_type: TransactionType; status: TransactionStatus; amount: number; created_at: string }) => {
      summary.total_amount += txn.amount || 0

      // By type
      if (!summary.by_type[txn.txn_type]) {
        summary.by_type[txn.txn_type] = { count: 0, amount: 0 }
      }
      summary.by_type[txn.txn_type].count++
      summary.by_type[txn.txn_type].amount += txn.amount || 0

      // By status
      if (!summary.by_status[txn.status]) {
        summary.by_status[txn.status] = { count: 0, amount: 0 }
      }
      summary.by_status[txn.status].count++
      summary.by_status[txn.status].amount += txn.amount || 0
    })

    return { success: true, summary }
  } catch (error: any) {
    console.error('Error fetching transaction summary:', error)
    return { success: false, error: error.message, summary: null }
  }
}

// ============================================================================
// BULK COMPLETE TRANSACTIONS
// ============================================================================

export async function bulkCompleteTransactions(
  supabase: SupabaseClient,
  txnType?: TransactionType
) {
  try {
    let query = supabase
      .from('transactions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('status', 'pending')

    if (txnType) {
      query = query.eq('txn_type', txnType)
    }

    const { data, error, count } = await query.select()

    if (error) throw error

    return { 
      success: true, 
      completed_count: count || 0,
      transactions: data || []
    }
  } catch (error: any) {
    console.error('Error bulk completing transactions:', error)
    return { success: false, error: error.message, completed_count: 0 }
  }
}

// ============================================================================
// GET TRANSACTION HISTORY (with pagination)
// ============================================================================

export async function getTransactionHistory(
  supabase: SupabaseClient,
  page: number = 1,
  pageSize: number = 20,
  filters?: {
    txn_type?: TransactionType
    status?: TransactionStatus
    startDate?: string
    endDate?: string
  }
) {
  try {
    const start = (page - 1) * pageSize
    const end = start + pageSize - 1

    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })

    if (filters?.txn_type) {
      query = query.eq('txn_type', filters.txn_type)
    }
    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    if (filters?.startDate) {
      query = query.gte('created_at', filters.startDate)
    }
    if (filters?.endDate) {
      query = query.lte('created_at', filters.endDate)
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(start, end)

    if (error) throw error

    return {
      success: true,
      transactions: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  } catch (error: any) {
    console.error('Error fetching transaction history:', error)
    return {
      success: false,
      error: error.message,
      transactions: [],
      total: 0,
      page,
      pageSize,
      totalPages: 0,
    }
  }
}

// ============================================================================
// FORMAT TRANSACTION FOR DISPLAY
// ============================================================================

export function formatTransaction(txn: Transaction) {
  return {
    id: txn.id,
    number: txn.txn_number,
    type: txn.txn_type.toUpperCase(),
    description: txn.description,
    amount: `₱${Number(txn.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
    method: txn.payment_method ? txn.payment_method.toUpperCase() : 'N/A',
    status: txn.status.charAt(0).toUpperCase() + txn.status.slice(1),
    created: new Date(txn.created_at).toLocaleString('en-PH'),
    completed: txn.completed_at 
      ? new Date(txn.completed_at).toLocaleString('en-PH')
      : 'Pending',
  }
}

// ============================================================================
// GET STATUS BADGE INFO
// ============================================================================

export function getStatusBadgeInfo(status: TransactionStatus) {
  const badges: Record<TransactionStatus, { bg: string; text: string; icon: string }> = {
    pending: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-700',
      icon: '⏳',
    },
    completed: {
      bg: 'bg-green-100',
      text: 'text-green-700',
      icon: '✓',
    },
    cancelled: {
      bg: 'bg-red-100',
      text: 'text-red-700',
      icon: '✕',
    },
  }
  return badges[status]
}

// ============================================================================
// GET TYPE ICON
// ============================================================================

export function getTypeIcon(txnType: TransactionType) {
  const icons: Record<TransactionType, string> = {
    pos: '🧾',
    checkin: '📥',
    checkout: '📤',
    dayuse: '☀️',
    booking: '📅',
    payment: '💳',
    refund: '↩️',
  }
  return icons[txnType] || '💬'
}

// ============================================================================
// VALIDATE TRANSACTION AMOUNT
// ============================================================================

export function validateTransactionAmount(amount: number): { valid: boolean; error?: string } {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return { valid: false, error: 'Amount must be a valid number' }
  }
  if (amount <= 0) {
    return { valid: false, error: 'Amount must be greater than 0' }
  }
  if (amount > 999999.99) {
    return { valid: false, error: 'Amount exceeds maximum limit' }
  }
  return { valid: true }
}

// ============================================================================
// CALCULATE COMPLETION TIME
// ============================================================================

export function calculateCompletionTime(
  createdAt: string,
  completedAt?: string
): { hours: number; minutes: number } | null {
  if (!completedAt) return null

  const created = new Date(createdAt).getTime()
  const completed = new Date(completedAt).getTime()
  const diffMs = completed - created
  const diffMins = Math.floor(diffMs / 60000)

  return {
    hours: Math.floor(diffMins / 60),
    minutes: diffMins % 60,
  }
}

// ============================================================================
// EXPORT TRANSACTIONS TO CSV
// ============================================================================

export function exportTransactionsToCSV(
  transactions: Transaction[],
  filename: string = 'transactions.csv'
) {
  const headers = ['Transaction #', 'Type', 'Description', 'Amount', 'Method', 'Status', 'Created', 'Completed']
  const rows = transactions.map(txn => [
    txn.txn_number,
    txn.txn_type,
    txn.description,
    txn.amount,
    txn.payment_method || 'N/A',
    txn.status,
    new Date(txn.created_at).toLocaleString('en-PH'),
    txn.completed_at ? new Date(txn.completed_at).toLocaleString('en-PH') : 'N/A',
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.URL.revokeObjectURL(url)
}

// ============================================================================
// RETRY FAILED TRANSACTION
// ============================================================================

export async function retryFailedTransaction(
  supabase: SupabaseClient,
  originalTransactionId: string,
  newPaymentMethod: string
) {
  try {
    // Get original transaction
    const { data: original, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', originalTransactionId)
      .single()

    if (fetchError) throw fetchError

    // Create new transaction with retry
    const { data: retryTxn, error: createError } = await supabase
      .from('transactions')
      .insert({
        txn_number: `${original.txn_number}-RETRY`,
        txn_type: original.txn_type,
        description: `RETRY: ${original.description}`,
        amount: original.amount,
        payment_method: newPaymentMethod,
        status: 'pending',
        booking_id: original.booking_id,
        order_id: original.order_id,
      })
      .select()
      .single()

    if (createError) throw createError

    // Mark original as cancelled
    await supabase
      .from('transactions')
      .update({
        status: 'cancelled',
        description: `${original.description} [SUPERSEDED BY RETRY]`,
      })
      .eq('id', originalTransactionId)

    return { success: true, retryTransaction: retryTxn }
  } catch (error: any) {
    console.error('Error retrying transaction:', error)
    return { success: false, error: error.message }
  }
}
