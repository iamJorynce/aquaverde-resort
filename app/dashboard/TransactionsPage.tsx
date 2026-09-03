'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getPendingTransactions,
  getTransactionCounts,
  bulkCompleteTransactions,
  completeTransaction,
  cancelTransaction,
  getTransactionSummary,
  getStatusBadgeInfo,
  getTypeIcon,
  formatTransaction,
  exportTransactionsToCSV,
  Transaction,
} from '@/lib/transactionUtils'

interface TransactionCounts {
  pos: number
  checkin: number
  checkout: number
  dayuse: number
  booking: number
  payment: number
  refund: number
}

export default function TransactionsPage() {
  const supabase = createClient()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([])
  const [counts, setCounts] = useState<TransactionCounts>({
    pos: 0,
    checkin: 0,
    checkout: 0,
    dayuse: 0,
    booking: 0,
    payment: 0,
    refund: 0,
  })
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'cancelled'>('pending')
  const [txnTypeFilter, setTxnTypeFilter] = useState<string>('all')
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set())
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'complete' | 'cancel' | null>(null)
  const [toast, setToast] = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function loadData() {
    try {
      setLoading(true)

      const [countResult, summaryResult] = await Promise.all([
        getTransactionCounts(supabase, 'pending'),
        getTransactionSummary(supabase),
      ])

      if (countResult.success) {
        setCounts(countResult.counts as any)
      }

      if (summaryResult.success) {
        setSummary(summaryResult.summary)
      }

      // Load transactions
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setTransactions(data || [])

      // Load pending transactions
      const pendingResult = await getPendingTransactions(supabase)
      if (pendingResult.success) {
        setPendingTransactions(pendingResult.transactions as any)
      }
    } catch (err) {
      console.error('Error loading data:', err)
      showToast('Error loading transactions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    // Real-time subscription
    const subscription = supabase
      .channel('transactions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => loadData()
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function handleCompleteSelected() {
    if (selectedTransactions.size === 0) {
      showToast('Please select transactions to complete')
      return
    }

    setConfirmAction('complete')
    setShowConfirm(true)
  }

  async function handleCancelSelected() {
    if (selectedTransactions.size === 0) {
      showToast('Please select transactions to cancel')
      return
    }

    setConfirmAction('cancel')
    setShowConfirm(true)
  }

  async function confirmAction_execute() {
    try {
      setLoading(true)

      for (const txnId of selectedTransactions) {
        if (confirmAction === 'complete') {
          await completeTransaction(supabase, txnId)
        } else if (confirmAction === 'cancel') {
          await cancelTransaction(supabase, txnId, 'Cancelled by user')
        }
      }

      setSelectedTransactions(new Set())
      setShowConfirm(false)
      showToast(`${selectedTransactions.size} transactions ${confirmAction}d`)
      await loadData()
    } catch (err: any) {
      showToast('Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleBulkComplete(txnType?: string) {
    if (!txnType || txnType === 'all') {
      const result = await bulkCompleteTransactions(supabase)
      if (result.success) {
        showToast(`Completed ${result.completed_count} transactions`)
        await loadData()
      }
    } else {
      const result = await bulkCompleteTransactions(supabase, txnType as any)
      if (result.success) {
        showToast(`Completed ${result.completed_count} ${txnType} transactions`)
        await loadData()
      }
    }
  }

  const filteredTransactions = transactions.filter(txn => {
    if (filter !== 'all' && txn.status !== filter) return false
    if (txnTypeFilter !== 'all' && txn.txn_type !== txnTypeFilter) return false
    return true
  })

  const totalPending = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-blue-500 text-white px-4 py-3 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Confirm Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <div className="text-lg font-semibold mb-2">
              {confirmAction === 'complete' ? 'Complete Transactions?' : 'Cancel Transactions?'}
            </div>
            <div className="text-sm text-gray-600 mb-4">
              {confirmAction === 'complete'
                ? `Are you sure you want to mark ${selectedTransactions.size} transaction(s) as completed?`
                : `Are you sure you want to cancel ${selectedTransactions.size} transaction(s)? This cannot be undone.`}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction_execute}
                className={`flex-1 px-4 py-2 text-white rounded-lg ${
                  confirmAction === 'complete'
                    ? 'bg-blue-700 hover:bg-blue-800'
                    : 'bg-red-700 hover:bg-red-800'
                }`}
              >
                {confirmAction === 'complete' ? 'Complete' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Transaction Management</h1>
        <p className="text-sm text-gray-500 mt-1">Monitor and manage all system transactions</p>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Total Transactions</div>
            <div className="text-2xl font-bold text-gray-800">{summary.total_transactions}</div>
            <div className="text-xs text-blue-600 mt-2">₱{Number(summary.total_amount).toLocaleString()}</div>
          </div>

          <div className="bg-red-50 border border-red-100 rounded-xl p-4">
            <div className="text-xs text-red-600 font-semibold mb-1">⚠️ PENDING</div>
            <div className="text-2xl font-bold text-red-700">{totalPending}</div>
            <div className="text-xs text-red-600 mt-2">
              ₱{Number(summary.by_status?.pending?.amount || 0).toLocaleString()}
            </div>
          </div>

          <div className="bg-green-50 border border-green-100 rounded-xl p-4">
            <div className="text-xs text-green-600 font-semibold mb-1">✓ COMPLETED</div>
            <div className="text-2xl font-bold text-green-700">{summary.by_status?.completed?.count || 0}</div>
            <div className="text-xs text-green-600 mt-2">
              ₱{Number(summary.by_status?.completed?.amount || 0).toLocaleString()}
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
            <div className="text-xs text-gray-600 font-semibold mb-1">✕ CANCELLED</div>
            <div className="text-2xl font-bold text-gray-700">{summary.by_status?.cancelled?.count || 0}</div>
            <div className="text-xs text-gray-600 mt-2">
              ₱{Number(summary.by_status?.cancelled?.amount || 0).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Pending by Type */}
      {totalPending > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <div className="text-sm font-semibold text-amber-900 mb-3">Pending by Type:</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            {Object.entries(counts).map(([type, count]) => (
              count > 0 && (
                <button
                  key={type}
                  onClick={() => handleBulkComplete(type)}
                  className="bg-white border border-amber-200 rounded-lg p-3 hover:bg-amber-50 text-center transition-colors"
                >
                  <div className="text-2xl mb-1">{getTypeIcon(type as any)}</div>
                  <div className="text-xs font-semibold text-amber-700">{count}</div>
                  <div className="text-xs text-amber-600 capitalize">{type}</div>
                </button>
              )
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1">
            <label className="block text-xs text-gray-600 mb-1">Status</label>
            <select
              value={filter}
              onChange={e => setFilter(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending Only</option>
              <option value="completed">Completed Only</option>
              <option value="cancelled">Cancelled Only</option>
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-xs text-gray-600 mb-1">Type</label>
            <select
              value={txnTypeFilter}
              onChange={e => setTxnTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="all">All Types</option>
              <option value="pos">POS</option>
              <option value="checkin">Check-in</option>
              <option value="checkout">Check-out</option>
              <option value="dayuse">Day/Night Pass</option>
              <option value="booking">Booking</option>
              <option value="payment">Payment</option>
              <option value="refund">Refund</option>
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-xs text-gray-600 mb-1">&nbsp;</label>
            <button
              onClick={() => exportTransactionsToCSV(filteredTransactions)}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
            >
              📥 Export CSV
            </button>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedTransactions.size > 0 && (
          <div className="flex gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg mb-4">
            <div className="flex-1 text-sm text-blue-700 font-medium">
              {selectedTransactions.size} selected
            </div>
            <button
              onClick={handleCompleteSelected}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
            >
              ✓ Complete
            </button>
            <button
              onClick={handleCancelSelected}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg"
            >
              ✕ Cancel
            </button>
          </div>
        )}
      </div>

      {/* Transactions Table */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium">
                  <input
                    type="checkbox"
                    checked={selectedTransactions.size === filteredTransactions.length && filteredTransactions.length > 0}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedTransactions(new Set(filteredTransactions.map(t => t.id)))
                      } else {
                        setSelectedTransactions(new Set())
                      }
                    }}
                    className="w-4 h-4"
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium">Transaction</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Type</th>
                <th className="text-left px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Created</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No transactions found
                  </td>
                </tr>
              ) : (
                filteredTransactions.map(txn => {
                  const badge = getStatusBadgeInfo(txn.status as any)
                  const isSelected = selectedTransactions.has(txn.id)

                  return (
                    <tr key={txn.id} className={`border-b border-gray-50 hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => {
                            const newSet = new Set(selectedTransactions)
                            if (e.target.checked) {
                              newSet.add(txn.id)
                            } else {
                              newSet.delete(txn.id)
                            }
                            setSelectedTransactions(newSet)
                          }}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-blue-600">{txn.txn_number}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{txn.description}</div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1 text-xs bg-gray-100 px-2 py-1 rounded">
                          {getTypeIcon(txn.txn_type as any)} {txn.txn_type.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        ₱{Number(txn.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-xs text-gray-500">
                        {new Date(txn.created_at).toLocaleString('en-PH')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.bg} ${badge.text}`}>
                          {badge.icon} {txn.status.charAt(0).toUpperCase() + txn.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs space-x-2">
                        {txn.status === 'pending' && (
                          <>
                            <button
                              onClick={() => {
                                completeTransaction(supabase, txn.id).then(() => {
                                  showToast('Transaction completed')
                                  loadData()
                                })
                              }}
                              className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                              Complete
                            </button>
                            <button
                              onClick={() => {
                                cancelTransaction(supabase, txn.id).then(() => {
                                  showToast('Transaction cancelled')
                                  loadData()
                                })
                              }}
                              className="text-red-600 hover:text-red-800 font-medium"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Info */}
      <div className="text-xs text-gray-500 text-center">
        Showing {filteredTransactions.length} of {transactions.length} transactions
      </div>
    </div>
  )
}
