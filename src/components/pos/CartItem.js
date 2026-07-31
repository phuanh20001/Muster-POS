import { formatCurrency } from '@/lib/formatters'
import { lineTotalForItem } from '@/lib/orderTotals'
import { gt } from '@/lib/money'
import ProductThumb from '@/components/shared/ProductThumb'

const SIZE_ABBR = { Small: 'S', Medium: 'M', Large: 'L' }

export default function CartItem({ item, onUpdateQty, onRemove, onEdit }) {
  const lineTotal = lineTotalForItem(item)

  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => onEdit(item.cartItemId)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-70 transition-opacity"
        >
          <ProductThumb product={item.product} emojiClassName="text-xl shrink-0" imgClassName="w-8 h-8 rounded-lg object-cover shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-gray-900 truncate">{item.product.name}</span>
              {item.size && (
                <span className="flex-shrink-0 text-xs font-semibold bg-gray-100 text-gray-600 rounded-md px-1.5 py-0.5">
                  {SIZE_ABBR[item.size] ?? item.size}
                </span>
              )}
            </div>
            <div className="text-xs text-gray-400 font-mono">{formatCurrency(item.unitPrice)} each</div>
            {(item.modifiers ?? []).map((m) => (
              <div key={m.id} className="text-xs text-gray-400">+ {m.name}{gt(m.price, 0) ? ` (${formatCurrency(m.price)})` : ''}</div>
            ))}
            {item.priceAdjustment !== 0 && item.priceAdjustment != null && (
              <div className="text-xs font-mono text-gray-500">
                adj: {item.priceAdjustment > 0 ? '+' : ''}{formatCurrency(item.priceAdjustment)}
                {item.priceAdjustmentNote ? ` (${item.priceAdjustmentNote})` : ''}
              </div>
            )}
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onUpdateQty(item.cartItemId, item.quantity - 1)}
            aria-label={`Decrease ${item.product.name} quantity`}
            className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm flex items-center justify-center transition-colors"
          >
            −
          </button>
          <span className="w-6 text-center text-sm font-semibold" aria-label={`Quantity: ${item.quantity}`}>{item.quantity}</span>
          <button
            onClick={() => onUpdateQty(item.cartItemId, item.quantity + 1)}
            aria-label={`Increase ${item.product.name} quantity`}
            className="w-7 h-7 rounded-lg bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm flex items-center justify-center transition-colors"
          >
            +
          </button>
        </div>
        <div className="text-sm font-mono font-semibold text-gray-900 w-16 text-right shrink-0">
          {formatCurrency(lineTotal)}
        </div>
      </div>
      {item.notes && (
        <div className="ml-8 mt-1 text-xs text-gray-400 italic truncate">{item.notes}</div>
      )}
    </div>
  )
}
