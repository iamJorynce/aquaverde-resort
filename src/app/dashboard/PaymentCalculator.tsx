'use client'

interface PaymentCalculatorProps {
  totalDue: number
  method: string
  onMethodChange: (method: string) => void
  amountTendered: number
  onAmountTenderedChange: (amount: number) => void
  /** Hide the cash-tendered/change UI for non-cash methods like GCash where there's no "change" concept. Defaults to true. */
  showChangeForCashOnly?: boolean
}

const QUICK_AMOUNTS = [100, 200, 500, 1000]

export default function PaymentCalculator({
  totalDue, method, onMethodChange, amountTendered, onAmountTenderedChange,
  showChangeForCashOnly = true,
}: PaymentCalculatorProps) {
  const isCash = method === 'cash'
  const showCashHelper = isCash || !showChangeForCashOnly
  const change = Math.max(0, amountTendered - totalDue)
  const shortBy = Math.max(0, totalDue - amountTendered)

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2.5">
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

      {showCashHelper && (
        <>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cash Received</label>
            <input
              type="number"
              value={amountTendered || ''}
              onChange={e => onAmountTenderedChange(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white"
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
            <span>{shortBy > 0 ? 'Amount Short' : 'Change Due'}</span>
            <span>₱{(shortBy > 0 ? shortBy : change).toLocaleString()}</span>
          </div>
        </>
      )}
    </div>
  )
}
