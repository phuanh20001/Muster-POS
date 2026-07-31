export const BRAND_NAME = process.env.NEXT_PUBLIC_BUSINESS_NAME || 'DreamyCafe'
export const BRAND_TAGLINE = process.env.NEXT_PUBLIC_BUSINESS_TAGLINE || 'Coffee & Food'

// Narrow-screen fallback for the staff nav, where the full name doesn't fit.
const wordInitials = BRAND_NAME.split(/\s+/).filter(Boolean).map((w) => w[0]).join('')
export const BRAND_INITIALS = (wordInitials.length > 1 ? wordInitials : BRAND_NAME.slice(0, 2)).toUpperCase()
