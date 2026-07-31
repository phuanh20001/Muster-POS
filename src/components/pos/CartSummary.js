import { formatCurrency } from '@/lib/formatters'
import { D, max, gt } from '@/lib/money'

export default function CartSummary({ total, discount = 0, surchargeAmount = 0, surchargeType, surchargeValue, onOpenAdjustment }) {
  const hasAdjustment = gt(discount, 0) || gt(surchargeAmount, 0)
  const adjustedTotal = max(D(0), D(total).plus(surchargeAmount).minus(discount))

  return (
    <div className="space-y-1">
      {hasAdjustment && (
        <div className="flex justify-between text-sm text-gray-400">
          <span>Subtotal</span>
          <span className="font-mono">{formatCurrency(total)}</span>
        </div>
      )}
      {gt(discount, 0) && (
        <div className="flex justify-between text-sm text-green-600">
          <span>Discount</span>
          <span className="font-mono">−{formatCurrency(discount)}</span>
        </div>
      )}
      {gt(surchargeAmount, 0) && (
        <div className="flex justify-between text-sm text-gray-500">
          <span>Surcharge{surchargeType === 'PERCENT' && surchargeValue > 0 ? ` (${surchargeValue}%)` : ''}</span>
          <span className="font-mono">+{formatCurrency(surchargeAmount)}</span>
        </div>
      )}
      <button
        onClick={onOpenAdjustment}
        className="w-full flex justify-between items-center text-base font-bold text-gray-900 pt-1 hover:opacity-70 transition-opacity text-left"
      >
        <span>Total</span>
        <span className="font-mono">{formatCurrency(adjustedTotal)}</span>
      </button>
    </div>
  )
}
