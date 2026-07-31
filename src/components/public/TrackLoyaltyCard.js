import StampProgress from '@/components/loyalty/StampProgress'

export default function TrackLoyaltyCard({ loyalty }) {
  if (!loyalty) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
      <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-3">Stamp card</div>
      <p className="text-sm text-amber-900 mb-4">Buy 9 coffees, get the 10th free</p>
      <StampProgress
        progress={loyalty.progress}
        stampsEarnedThisOrder={loyalty.stampsEarnedThisOrder}
        freeItems={loyalty.freeItems}
      />
    </div>
  )
}
