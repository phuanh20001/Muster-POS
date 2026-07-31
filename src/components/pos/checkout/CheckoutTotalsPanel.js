'use client'

import { formatCurrency } from '@/lib/formatters'
import { lineTotalForItem } from '@/lib/orderTotals'
import { gt } from '@/lib/money'

export default function CheckoutTotalsPanel({
  items,
  itemsSubtotal,
  surchargeAmount,
  surchargeType,
  parsedSurchargeValue,
  parsedManualDiscount,
  loyaltyDiscount,
  grandTotal,
}) {
  return (
    <>
      <div className="bg-gray-50 rounded-xl p-3 space-y-1 max-h-36 overflow-y-auto">
        {items.map((item) => {
          const lineTotal = lineTotalForItem(item)
          return (
            <div key={item.cartItemId} className="flex justify-between text-sm">
              <span className="text-gray-700">
                {item.product.name}{item.size ? ` (${item.size})` : ''} × {item.quantity}
                {(item.modifiers ?? []).map((m) => (
                  <span key={m.id} className="text-gray-400 text-xs block ml-2">+ {m.name}</span>
                ))}
              </span>
              <span className="font-medium font-mono">{formatCurrency(lineTotal)}</span>
            </div>
          )
        })}
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Subtotal</span>
          <span className="font-mono">{formatCurrency(itemsSubtotal)}</span>
        </div>
        {gt(surchargeAmount, 0) && (
          <div className="flex justify-between text-gray-600">
            <span>Surcharge{surchargeType === 'PERCENT' ? ` (${parsedSurchargeValue}%)` : ''}</span>
            <span className="font-mono">+{formatCurrency(surchargeAmount)}</span>
          </div>
        )}
        {gt(parsedManualDiscount, 0) && (
          <div className="flex justify-between text-gray-600">
            <span>Discount</span>
            <span className="font-mono text-gray-700">−{formatCurrency(parsedManualDiscount)}</span>
          </div>
        )}
        {gt(loyaltyDiscount, 0) && (
          <div className="flex justify-between text-gray-600">
            <span>Loyalty Reward</span>
            <span className="font-mono text-gray-700">−{formatCurrency(loyaltyDiscount)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base pt-1 border-t border-gray-200">
          <span>Total</span>
          <span className="font-mono">{formatCurrency(grandTotal)}</span>
        </div>
      </div>
    </>
  )
}
