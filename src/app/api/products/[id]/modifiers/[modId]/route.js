import { createModifierItemHandlers } from '@/lib/modifierRoutes'

const { PUT, DELETE } = createModifierItemHandlers('productModifier')

export { PUT, DELETE }
