'use client'

import Button from '@/components/shared/Button'
import { formatCurrency } from '@/lib/formatters'
import { D, roundCents, gte } from '@/lib/money'
import SplitLegStep from './SplitLegStep'

export default function CheckoutSplitSection({
  splitType,
  setSplitType,
  splitPayments,
  splitRemaining,
  splitStep,
  legAmountInput,
  setLegAmountInput,
  remainingLines,
  legItemKeys,
  setLegItemKeys,
  legSelectedAmount,
  splitPriceValid,
  splitPriceDue,
  note,
  setNote,
  canConfirm,
  onExitSplit,
  onStartLeg,
  legDue,
  legDueKeys,
  splitLineByKey,
  splitLines,
  paidItemKeys,
  splitCollected,
  grandTotal,
  onLegDone,
  cardSurcharge,
  terminalEnabled,
  internetOk,
  onChargeCard,
  onCancelCharge,
}) {
  return (
    <div className="space-y-4">
      <div className="flex rounded-xl border border-gray-200 overflow-hidden">
        {[{ v: 'PRICE', l: 'Split by price' }, { v: 'PRODUCT', l: 'Split by product' }].map(({ v, l }) => (
          <button key={v} type="button"
            disabled={splitPayments.length > 0}
            onClick={() => { setSplitType(v); setLegAmountInput(''); setLegItemKeys([]) }}
            className={`flex-1 px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
              splitType === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {splitPayments.length > 0 && (
        <div className="flex justify-between text-xs text-gray-500">
          <span>{splitPayments.length} payment{splitPayments.length !== 1 ? 's' : ''} collected</span>
          <span className="font-mono">Remaining {formatCurrency(splitRemaining)}</span>
        </div>
      )}

      {splitStep === 0 && (
        <>
          {splitType === 'PRICE' ? (
            <>
              <div className="bg-gray-50 rounded-xl px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-gray-500">Remaining</span>
                <span className="text-xl font-black font-mono text-gray-900">{formatCurrency(splitRemaining)}</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount for this payment</label>
                <input type="number" min="0" step="0.01"
                  value={legAmountInput}
                  onChange={(e) => setLegAmountInput(e.target.value)}
                  placeholder={`Remaining ${formatCurrency(splitRemaining)}`}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-xl font-mono font-bold text-right focus:outline-none focus:ring-2 focus:ring-gray-900" />
                <div className="flex gap-2 mt-2 flex-wrap">
                  {[2, 3, 4].map((n) => (
                    <button key={n} type="button"
                      onClick={() => setLegAmountInput(roundCents(D(splitRemaining).div(n)).toFixed(2))}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium border border-gray-200 transition-colors">
                      ÷{n}
                    </button>
                  ))}
                  <button type="button" onClick={() => setLegAmountInput(D(splitRemaining).toFixed(2))}
                    className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors">
                    Remaining
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700">Select items for this payment</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {remainingLines.map((l) => {
                  const selected = legItemKeys.includes(l.key)
                  return (
                    <button key={l.key} type="button"
                      onClick={() => setLegItemKeys((prev) => selected ? prev.filter((k) => k !== l.key) : [...prev, l.key])}
                      className={`w-full flex justify-between items-center px-4 py-2.5 rounded-xl border-2 text-sm transition-all ${
                        selected ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-400'
                      }`}>
                      <span>{l.label}</span>
                      <span className="font-mono font-semibold">{formatCurrency(l.amount)}</span>
                    </button>
                  )
                })}
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-gray-500">Selected</span>
                <span className="text-xl font-black font-mono text-gray-900">{formatCurrency(legSelectedAmount)}</span>
              </div>
            </>
          )}

          {splitPayments.length === 0 && (
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Order note (optional)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          )}

          <div className="flex gap-3">
            <button onClick={onExitSplit}
              className="px-5 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              Back
            </button>
            {splitType === 'PRICE' ? (
              <Button variant="primary" size="lg" className="flex-1"
                disabled={!canConfirm || !splitPriceValid}
                onClick={() => onStartLeg(splitPriceDue, [])}>
                Charge {formatCurrency(splitPriceDue)}
              </Button>
            ) : (
              <Button variant="primary" size="lg" className="flex-1"
                disabled={!canConfirm || legItemKeys.length === 0}
                onClick={() => onStartLeg(legSelectedAmount, legItemKeys)}>
                Charge {formatCurrency(legSelectedAmount)}
              </Button>
            )}
          </div>
        </>
      )}

      {splitStep > 0 && (
        <SplitLegStep
          key={splitStep}
          legLabel={`Payment ${splitStep}`}
          legSubtitle={splitType === 'PRODUCT' ? `${legDueKeys.length} item${legDueKeys.length !== 1 ? 's' : ''}` : null}
          legItems={splitType === 'PRODUCT' ? legDueKeys.map((k) => splitLineByKey[k]).filter(Boolean) : null}
          legItemKeys={legDueKeys}
          amountDue={legDue}
          isFinalLeg={splitType === 'PRODUCT'
            ? paidItemKeys.length + legDueKeys.length >= splitLines.length
            : gte(D(splitCollected).plus(legDue), D(grandTotal).minus(0.005))}
          onDone={onLegDone}
          cardSurcharge={cardSurcharge}
          terminalEnabled={terminalEnabled}
          internetOk={internetOk}
          onChargeCard={onChargeCard}
          onCancelCharge={onCancelCharge}
        />
      )}
    </div>
  )
}
