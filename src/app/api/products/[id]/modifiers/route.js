import { createModifierCollectionHandlers } from '@/lib/modifierRoutes'

const { GET, POST } = createModifierCollectionHandlers('productModifier', 'productId')

export { GET, POST }
