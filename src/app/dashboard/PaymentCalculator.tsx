'use client'

interface PaymentCalculatorProps {
  totalDue: number
  method: string
  onMethodChange: (method: string) => void
  amountTendered: number
  onAmountTenderedChange: (amount: number) => void
  showChangeForCashOnly?: boolean
}

const QUICK_AMOUNTS = [100, 200, 500, 1000]

// Returns true if payment can be processed — used to gate submit buttons.
// Cash: amountTendered must be >= totalDue
// Non-cash (GCash, Maya, etc.): always valid since exact amount is assumed
export function isPaymentValid(method: string, totalDue: number, amountTendered: number): boolean {
  if (totalDue <= 0) return true
  if (method === 'cash') return amountTendered >= totalDue
  return true // GCash, Maya, bank transfer, card — no cash tendering required
}

export function paymentValidationMessage(method: string, totalDue: number, amountTendered: number): string | null {
  if (totalDue <= 0) return null
  if (method === 'cash' && amountTendered <= 0) return 'Please enter the cash amount received.'
  if (method === 'cash' && amountTendered < totalDue) return `Cash received (₱${amountTendered.toLocaleString()}) is less than the total due (₱${totalDue.toLocaleString()}).`
  return null
}

export default function PaymentCalculator({
  totalDue, method, onMethodChange, amountTendered, onAmountTenderedChange,
  showChangeForCashOnly = true,
}: PaymentCalculatorProps) {
  const isCash = method === 'cash'
  const showCashHelper = isCash || !showChangeForCashOnly
  const change = Math.max(0, amountTendered - totalDue)
  const shortBy = Math.max(0, totalDue - amountTendered)
  const valid = isPaymentValid(method, totalDue, amountTendered)

  return (
    <div className={`border rounded-lg p-3 space-y-2.5 ${!valid ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Payment Method</label>
        <select
          value={method}
          onChange={e => onMethodChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
        >
          <option value="cash">Cash</option>
          <option value="gcash">GCash</option>
          <option value="maya">Maya</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="credit_card">Credit Card</option>
        </select>
      </div>

      {!isCash && totalDue > 0 && (
        <div className="bg-blue-50 rounded-lg p-2.5 text-xs text-blue-700">
          ₱{totalDue.toLocaleString()} will be collected via {method.replace('_', ' ')}. No change needed.
        </div>
      )}

      {showCashHelper && (
        <>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cash Received</label>
            <input
              type="number"
              value={amountTendered || ''}
              onChange={e => onAmountTenderedChange(parseFloat(e.target.value) || 0)}
              placeholder="Enter amount received"
              className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white ${
                !valid && isCash ? 'border-red-300 focus:border-red-400' : 'border-gray-200'
              }`}
            />
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {QUICK_AMOUNTS.filter(a => a >= totalDue).slice(0, 4).map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => onAmountTenderedChange(a)}
                  className="px-2 py-1 border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-50"
                >
                  ₱{a.toLocaleString()}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onAmountTenderedChange(totalDue)}
                className="px-2 py-1 border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-50"
              >
                Exact (₱{Math.round(totalDue).toLocaleString()})
              </button>
            </div>
          </div>

          <div className={`rounded-lg p-2.5 flex justify-between items-center text-sm font-medium ${
            shortBy > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
          }`}>
            <span>{shortBy > 0 ? '⚠ Amount Short' : '✓ Change Due'}</span>
            <span>₱{(shortBy > 0 ? shortBy : change).toLocaleString()}</span>
          </div>
        </>
      )}
    </div>
  )
}
