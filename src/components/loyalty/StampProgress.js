export default function StampProgress({ progress, stampsEarnedThisOrder = 0, freeItems = 0, showEarnedPreview = false }) {
  const filled = progress % 9
  const displayUpTo = showEarnedPreview
    ? Math.min(filled + stampsEarnedThisOrder, 9)
    : filled

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} className="text-xl">
            {i < filled ? '☕' : i < displayUpTo ? '🟤' : '○'}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">{filled} of 9 stamps</span>
        <span className="text-gray-400">
          {filled >= 9 ? 'Free coffee earned!' : `${9 - filled} more for a free coffee`}
        </span>
      </div>
      {stampsEarnedThisOrder > 0 && (
        <p className="text-xs text-amber-700 mt-2">
          +{stampsEarnedThisOrder} stamp{stampsEarnedThisOrder !== 1 ? 's' : ''} from this order
        </p>
      )}
      {freeItems > 0 && (
        <p className="text-xs text-amber-800 font-semibold mt-2">
          You have {freeItems} free coffee{freeItems !== 1 ? 's' : ''} to redeem online or in store
        </p>
      )}
    </div>
  )
}
