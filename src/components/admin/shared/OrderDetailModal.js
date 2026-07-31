'use client'

import { useState } from 'react'
import Modal from '@/components/shared/Modal'
import Badge from '@/components/shared/Badge'
import RefundModal from '@/components/admin/sales/RefundModal'
import { formatCurrency, formatTime, orderLocationLabel, orderTicketLabel, orderTicketWithId } from '@/lib/formatters'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@/lib/constants'
import { itemsSubtotal, lineTotalForItem } from '@/lib/orderTotals'
import { D, gt } from '@/lib/money'
import { BRAND_NAME } from '@/lib/brand'
import ProductThumb from '@/components/shared/ProductThumb'

function printDocket(order) {
  const tableLabel = orderLocationLabel(order)
  const itemRows = order.items.map((item) => {
    const emoji = item.product?.imageEmoji ? `${item.product.imageEmoji} ` : ''
    const name = `${emoji}${item.product?.name ?? item.productName}${item.size ? ` (${item.size})` : ''}`
    const price = `$${D(item.unitPrice).times(item.quantity).toFixed(2)}`
    const noteRow = item.notes ? `<div style="padding-left:16px;color:#666;font-size:12px">↳ ${item.notes}</div>` : ''
    return `<div style="display:flex;justify-content:space-between"><span>${name} × ${item.quantity}</span><span>${price}</span></div>${noteRow}`
  }).join('')

  const win = window.open('', '_blank', 'width=420,height=640')
  win.document.write(`<!DOCTYPE html><html><head><title>Order ${orderTicketLabel(order)}</title>
<style>
  body{font-family:monospace;padding:24px;font-size:13px;max-width:320px;margin:0 auto}
  h2{text-align:center;margin:0 0 4px}
  .center{text-align:center;margin:2px 0}
  .divider{border:none;border-top:1px dashed #999;margin:10px 0}
  .row{display:flex;justify-content:space-between;margin:3px 0}
  .bold{font-weight:bold}
  .section-label{font-size:11px;text-transform:uppercase;color:#666;margin:6px 0 2px}
</style></head><body>
<h2>${BRAND_NAME}</h2>
<p class="center">Order ${orderTicketLabel(order)} (ref ${order.id})</p>
<p class="center">${formatTime(order.createdAt)} · ${tableLabel}</p>
<hr class="divider">
<div class="section-label">Items</div>
${itemRows}
<hr class="divider">
<div class="row bold"><span>Total</span><span>$${D(order.total).toFixed(2)}</span></div>
<hr class="divider">
<div class="section-label">Payment</div>
<div class="row"><span>Method</span><span>${order.paymentMethod}</span></div>
<div class="row"><span>Amount Paid</span><span>$${D(order.amountPaid).toFixed(2)}</span></div>
<div class="row"><span>Change</span><span>$${D(order.change).toFixed(2)}</span></div>
${order.note ? `<hr class="divider"><div><span style="font-weight:bold">Note:</span> ${order.note}</div>` : ''}
</body></html>`)
  win.document.close()
  win.print()
}

export default function OrderDetailModal({
  order: initialOrder,
  onClose,
  onUpdated,
  showBrowserPrint = false,
}) {
  const [order, setOrder] = useState(initialOrder)
  const [refundOpen, setRefundOpen] = useState(false)
  const [reprinting, setReprinting] = useState(false)
  const [reprintStatus, setReprintStatus] = useState(null)
  const [printingReceipt, setPrintingReceipt] = useState(false)
  const [receiptStatus, setReceiptStatus] = useState(null)

  if (!order) return null

  async function handleReprint() {
    setReprinting(true)
    setReprintStatus(null)
    const res = await fetch(`/api/orders/${order.id}/reprint`, { method: 'POST' })
    setReprinting(false)
    if (res.ok) {
      setReprintStatus('ok')
      setTimeout(() => setReprintStatus(null), 2000)
    } else {
      setReprintStatus('error')
    }
  }

  async function handlePrintReceipt() {
    setPrintingReceipt(true)
    setReceiptStatus(null)
    const res = await fetch(`/api/orders/${order.id}/receipt`, { method: 'POST' })
    setPrintingReceipt(false)
    if (res.ok) {
      setReceiptStatus('ok')
      setTimeout(() => setReceiptStatus(null), 2000)
    } else {
      setReceiptStatus('error')
    }
  }

  const subtotal = itemsSubtotal(order.items)

  return (
    <>
      <Modal
        isOpen={!!order}
        onClose={onClose}
        title={`Order ${orderTicketWithId(order)}`}
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <span>{formatTime(order.createdAt)}</span>
            <span>·</span>
            <span>{orderLocationLabel(order)}</span>
            {order.user?.name && (
              <>
                <span>·</span>
                <span>{order.user.name}</span>
              </>
            )}
            <span>·</span>
            <Badge className={ORDER_STATUS_COLORS[order.status]}>
              {ORDER_STATUS_LABELS[order.status] ?? order.status}
            </Badge>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Items</div>
            <div className="space-y-2">
              {(order.items ?? []).map((item) => {
                const lineTotal = lineTotalForItem(item)
                return (
                  <div key={item.id}>
                    <div className="flex justify-between text-sm gap-2">
                      <span className="text-gray-800 flex items-center gap-2 min-w-0">
                        <ProductThumb
                          product={item.product}
                          emojiClassName="text-base shrink-0"
                          imgClassName="w-6 h-6 rounded object-cover shrink-0"
                        />
                        <span className="min-w-0">
                          {item.product?.name ?? item.productName}
                          {item.size && <span className="text-gray-400 ml-1">({item.size})</span>}
                          <span className="text-gray-500 ml-2">× {item.quantity}</span>
                        </span>
                      </span>
                      <span className="font-mono font-semibold text-gray-900">{formatCurrency(lineTotal)}</span>
                    </div>
                    {(item.modifiers ?? []).map((m) => (
                      <div key={m.id} className="text-xs text-gray-400 ml-5 mt-0.5">+ {m.name}{gt(m.price, 0) ? ` (${formatCurrency(m.price)})` : ''}</div>
                    ))}
                    {item.priceAdjustment != null && !D(item.priceAdjustment).isZero() && (
                      <div className="text-xs text-gray-400 ml-5 mt-0.5 font-mono">
                        adj: {gt(item.priceAdjustment, 0) ? '+' : ''}{formatCurrency(item.priceAdjustment)}
                        {item.priceAdjustmentNote ? ` (${item.priceAdjustmentNote})` : ''}
                      </div>
                    )}
                    {item.notes && (
                      <div className="text-xs text-gray-400 italic ml-5 mt-0.5">{item.notes}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span className="font-mono">{formatCurrency(subtotal)}</span>
            </div>
            {gt(order.surchargeAmount ?? 0, 0) && (
              <div className="flex justify-between text-gray-500">
                <span>Surcharge{order.surchargeType === 'PERCENT' ? ` (${order.surchargeValue}%)` : ''}</span>
                <span className="font-mono">+{formatCurrency(order.surchargeAmount)}</span>
              </div>
            )}
            {gt(order.manualDiscount ?? 0, 0) && (
              <div className="flex justify-between text-gray-500">
                <span>Discount</span>
                <span className="font-mono">−{formatCurrency(order.manualDiscount)}</span>
              </div>
            )}
            {gt(order.discountAmount ?? 0, 0) && (
              <div className="flex justify-between text-gray-500">
                <span>Loyalty Reward</span>
                <span className="font-mono">−{formatCurrency(order.discountAmount)}</span>
              </div>
            )}
            {gt(order.tipAmount ?? 0, 0) && (
              <div className="flex justify-between text-gray-500">
                <span>Tip</span>
                <span className="font-mono">+{formatCurrency(order.tipAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-1 border-t border-gray-100">
              <span>Total</span>
              <span className="font-mono">{formatCurrency(order.total)}</span>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Payment</div>
            <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Method</span>
                <span className="font-medium text-gray-900">{order.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Amount Paid</span>
                <span className="font-mono font-medium text-gray-900">{formatCurrency(order.amountPaid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Change</span>
                <span className="font-mono font-medium text-gray-900">{formatCurrency(order.change)}</span>
              </div>
            </div>
          </div>

          {(order.user || order.customer || order.tableNumber) && (
            <div className="border-t border-gray-100 pt-3 text-sm space-y-1 text-gray-500">
              {order.user && <div className="flex justify-between"><span>Staff</span><span>{order.user.name}</span></div>}
              {order.customer && <div className="flex justify-between"><span>Customer</span><span>{order.customer.name}</span></div>}
              {(order.tableId || order.tableManual) && order.tableNumber && <div className="flex justify-between"><span>Table</span><span>{order.tableNumber}</span></div>}
              {!order.tableId && !order.tableManual && order.tableNumber && <div className="flex justify-between"><span>Customer</span><span>{order.tableNumber}</span></div>}
            </div>
          )}

          {order.note && (
            <div className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <span className="font-semibold text-amber-700">Note: </span>{order.note}
            </div>
          )}

          {order.status === 'REFUNDED' && order.refundNote && (
            <div className="text-xs text-purple-600 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
              <span className="font-semibold">Refund note: </span>{order.refundNote}
            </div>
          )}

          {(reprintStatus === 'error' || receiptStatus === 'error') && (
            <p className="text-xs text-red-500 text-center -mb-2">Printing failed — check printer connection</p>
          )}
          <div className="flex flex-wrap gap-2">
            {showBrowserPrint && (
              <button onClick={() => printDocket(order)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                🖨 Browser Print
              </button>
            )}
            {order.status !== 'CANCELLED' && (
              <button onClick={handleReprint} disabled={reprinting}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  reprintStatus === 'ok'
                    ? 'bg-green-600 text-white'
                    : 'border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50'
                }`}>
                {reprinting ? 'Printing…' : reprintStatus === 'ok' ? 'Printed ✓' : '🖨 Reprint Docket'}
              </button>
            )}
            {order.status !== 'CANCELLED' && (
              <button onClick={handlePrintReceipt} disabled={printingReceipt}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  receiptStatus === 'ok'
                    ? 'bg-green-600 text-white'
                    : 'border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50'
                }`}>
                {printingReceipt ? 'Printing…' : receiptStatus === 'ok' ? 'Printed ✓' : '🧾 Print Receipt'}
              </button>
            )}
            {order.status === 'COMPLETED' && (
              <button onClick={() => setRefundOpen(true)}
                className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm font-medium text-red-600 hover:bg-red-100 transition-colors">
                Refund
              </button>
            )}
          </div>
        </div>
      </Modal>

      {refundOpen && (
        <RefundModal
          order={order}
          onClose={() => setRefundOpen(false)}
          onRefunded={(updated) => {
            setOrder((prev) => ({ ...prev, ...updated }))
            if (onUpdated) onUpdated(updated)
            setRefundOpen(false)
          }}
        />
      )}
    </>
  )
}
