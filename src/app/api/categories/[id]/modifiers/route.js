import { createModifierCollectionHandlers } from '@/lib/modifierRoutes'

const { GET, POST } = createModifierCollectionHandlers('categoryModifier', 'categoryId')

export { GET, POST }
