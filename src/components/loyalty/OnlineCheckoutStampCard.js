'use client'

import StampProgress from '@/components/loyalty/StampProgress'
import { D, gt } from '@/lib/money'

export default function OnlineCheckoutStampCard({
  loyaltyCustomer,
  stampsEarnedThisOrder,
  loyaltyDiscount,
  redeemFree,
  onRedeemChange,
  hasEligibleItems,
  ineligibleCartNames = [],
  eligibleExamples = [],
}) {
  const progress = loyaltyCustomer.stampsCollected % 9
  const freeItems = loyaltyCustomer.freeItems ?? 0

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <p className="text-sm font-semibold text-amber-900 mb-2">Your rewards</p>
      <StampProgress
        progress={progress}
        freeItems={freeItems}
        stampsEarnedThisOrder={stampsEarnedThisOrder}
        showEarnedPreview
      />
      {freeItems > 0 && (
        <div className="mt-3 pt-3 border-t border-amber-200">
          {hasEligibleItems ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={redeemFree}
                onChange={(e) => onRedeemChange(e.target.checked)}
                className="w-4 h-4 accent-amber-500"
              />
              <span className="text-sm font-semibold text-amber-800">
                Redeem 1 free coffee
                {gt(loyaltyDiscount, 0) ? ` (−$${D(loyaltyDiscount).toFixed(2)})` : ''}
                {freeItems > 1 ? ` · ${freeItems} available` : ''}
              </span>
            </label>
          ) : ineligibleCartNames.length > 0 ? (
            <p className="text-xs text-amber-800">
              {ineligibleCartNames.join(', ')} {ineligibleCartNames.length === 1 ? 'is' : 'are'} not stamp-eligible.
              {eligibleExamples.length > 0
                ? ` Add one that is (e.g. ${eligibleExamples.slice(0, 3).join(', ')}) to redeem.`
                : ' Add a stamp-eligible drink to redeem.'}
            </p>
          ) : (
            <p className="text-xs text-amber-800">
              Add a stamp-eligible drink to redeem your free coffee
            </p>
          )}
        </div>
      )}
    </div>
  )
}
