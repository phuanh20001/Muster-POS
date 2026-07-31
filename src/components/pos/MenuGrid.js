import { memo } from 'react'
import ProductCard from './ProductCard'
import EmptyState from '@/components/shared/EmptyState'

function MenuGrid({ products, onAdd }) {
  if (products.length === 0) {
    return (
      <EmptyState
        icon="🍽️"
        title="No products found"
        description="Try selecting a different category or add products in Admin > Menu."
      />
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onAdd={onAdd} />
      ))}
    </div>
  )
}

export default memo(MenuGrid)
