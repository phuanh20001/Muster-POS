export default function LoyaltyProductBadge({ className = '' }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs shrink-0 ${className}`}
      title="Earns stamps"
      aria-label="Earns stamps"
    >
      ☕
    </span>
  )
}
