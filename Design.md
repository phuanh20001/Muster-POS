# DreamyCafe — Design System (Modern Minimal)

## Philosophy
Clean, precise, and professional. Maximum white space, minimal decoration. Every element earns its place. The interface disappears so the workflow stays fast.

## Color Palette

| Token | Value | Usage |
|---|---|---|
| **Background** | `bg-white` | Page background |
| **Surface** | `bg-gray-50` | Cart summary, subtle section backgrounds |
| **Border** | `border-gray-200` | Dividers, card borders, input borders |
| **Text primary** | `text-gray-900` | Headings, primary content |
| **Text secondary** | `text-gray-500` | Descriptions, helper text, timestamps |
| **Text muted** | `text-gray-400` | Placeholders, disabled states |
| **Accent** | `bg-gray-900 text-white` | Primary buttons, active tabs, badges |
| **Accent hover** | `hover:bg-gray-800` | Primary button hover |
| **Accent active** | `active:bg-gray-700` | Primary button press |
| **Danger** | `text-red-600` / `bg-red-600` | Delete, cancel, destructive actions |
| **Success** | `text-emerald-600` / `bg-emerald-600` | Confirmations, ready status |
| **Warning** | `text-amber-600` / `bg-amber-500` | Pending status |
| **Info** | `text-blue-600` / `bg-blue-500` | Preparing status |

## Typography

- **Font**: System sans-serif stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`)
- **Headings**: `font-bold tracking-tight text-gray-900`
- **Body**: `text-sm text-gray-700`
- **Small/helper**: `text-xs text-gray-500`
- **Monospace for prices**: `font-mono font-semibold`
- No emoji in navigation — use text labels only
- Product cards keep emoji as visual identifiers

## Border Radius

| Element | Radius |
|---|---|
| Buttons | `rounded-lg` |
| Cards | `rounded-xl` |
| Inputs | `rounded-lg` |
| Modals | `rounded-2xl` |
| Badges/pills | `rounded-full` |
| Nav items | `rounded-lg` |

## Shadows

- **Cards**: `shadow-sm` only — no heavy shadows
- **Modals**: `shadow-2xl`
- **Hover states**: `shadow-md` on interaction
- **Nav**: No shadow — use `border-b border-gray-200` instead

## Spacing

- Page padding: `p-6`
- Card padding: `p-4` to `p-5`
- Between sections: `gap-6` or `space-y-6`
- Between cards in grids: `gap-4`
- Generous whitespace everywhere — let elements breathe

## Components

### Navigation
- Background: `bg-gray-950` (near-black)
- Text: `text-white` for brand, `text-gray-300` for inactive links
- Active link: `bg-white/10 text-white`
- Hover: `hover:bg-white/10 hover:text-white`
- No emoji icons in nav — text labels only
- Height: compact `py-3`

### Buttons
| Variant | Style |
|---|---|
| Primary | `bg-gray-900 text-white hover:bg-gray-800 active:bg-gray-700` |
| Secondary | `bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300` |
| Danger | `bg-red-600 text-white hover:bg-red-700 active:bg-red-800` |
| Success | `bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800` |
| Ghost | `text-gray-600 hover:bg-gray-100 active:bg-gray-200` |

### Product Cards
- White background, `border border-gray-200 rounded-xl`
- Hover: `ring-2 ring-gray-900` with `shadow-md`
- Emoji: `text-3xl` (visual identifier)
- Product name: `font-semibold text-gray-900 text-sm`
- Price: `font-mono font-semibold text-gray-900`
- Disabled: `opacity-40 cursor-not-allowed`

### Category Tabs
- Style: Underline/pill hybrid
- Active: `bg-gray-900 text-white`
- Inactive: `bg-white text-gray-600 border border-gray-200 hover:bg-gray-50`

### Cart
- Separated by `border-l border-gray-200` divider
- Clean list layout with subtle dividers between items
- Summary section: `bg-gray-50` with clear price breakdown
- Charge button: full-width primary black button

### Kitchen Board
- Column headers: clean text with count badge
- Status columns: white background with left colored border
  - Pending: `border-l-4 border-amber-400`
  - Preparing: `border-l-4 border-blue-400`
  - Ready: `border-l-4 border-emerald-400`
- Order cards: `bg-white border border-gray-200 rounded-xl shadow-sm`

### Modals
- Overlay: `bg-black/50 backdrop-blur-sm`
- Modal: `bg-white rounded-2xl shadow-2xl`
- Max width: `max-w-md`

### Badges
- Default: `bg-gray-100 text-gray-700 rounded-full px-2.5 py-0.5 text-xs font-medium`
- Status badges use semantic colors (amber/blue/emerald/red)

### Empty States
- Centered, `text-gray-400`
- No large icons — small subtle text

### Form Inputs
- `border border-gray-300 rounded-lg px-3 py-2`
- Focus: `focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent`
- No amber/colored focus rings

### Toast / Notifications
- `bg-gray-900 text-white rounded-xl shadow-lg`
- Minimal, bottom-center positioned

## Layout Rules

- POS page: 2/3 menu grid + 1/3 cart sidebar
- Kitchen: 3-column board (Pending / Preparing / Ready)
- Admin: sidebar navigation + content area
- All pages: full viewport height, no page scroll (sections scroll internally)

## Interaction States

- Hover: subtle background shift or ring appearance
- Active/press: `active:scale-[0.98]` on buttons and cards
- Disabled: `opacity-40 cursor-not-allowed`
- Focus: `ring-2 ring-gray-900` (keyboard navigation)
- Transitions: `transition-all duration-150` for snappy feel

## Anti-Patterns (Do NOT use)

- No amber/brown as primary color (legacy style)
- No heavy box shadows
- No colored backgrounds on nav
- No emoji in navigation links
- No gradient backgrounds
- No rounded-full buttons (except icon buttons)
- No colored focus rings (amber, blue, etc.) — always gray-900
