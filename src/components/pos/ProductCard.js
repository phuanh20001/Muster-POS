import { memo } from 'react'
import { formatCurrency } from '@/lib/formatters'
import ProductThumb from '@/components/shared/ProductThumb'

function ProductCard({ product, onAdd }) {
  return (
    <button
      type="button"
      onClick={() => onAdd(product)}
      disabled={!product.available}
      className={`bg-white rounded-xl p-4 text-left border border-gray-200 active:scale-[0.98] ${
        product.available ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'
      }`}
    >
      <ProductThumb product={product} emojiClassName="text-3xl mb-2 block" imgClassName="w-12 h-12 rounded-lg object-cover mb-2" />
      {product.isCombo && (
        <div className="inline-block text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 mb-1">Combo</div>
      )}
      <div className="font-semibold text-gray-900 text-sm leading-tight mb-1">{product.name}</div>
      {product.description && (
        <div className="text-xs text-gray-400 mb-2 line-clamp-1">{product.description}</div>
      )}
      <div className="font-mono font-semibold text-gray-900 text-sm">{formatCurrency(product.price)}</div>
      {!product.available && (
        <div className="text-xs text-red-500 mt-1">Unavailable</div>
      )}
    </button>
  )
}

export default memo(ProductCard)
