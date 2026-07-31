import { createModifierItemHandlers } from '@/lib/modifierRoutes'

const { PUT, DELETE } = createModifierItemHandlers('categoryModifier')

export { PUT, DELETE }
