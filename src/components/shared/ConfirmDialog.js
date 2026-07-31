'use client'

import { useEffect } from 'react'
import Button from '@/components/shared/Button'

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  confirmVariant = 'danger',
  alertOnly = false,
  onConfirm,
  onClose,
}) {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md z-10">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{message}</p>
          <div className="flex gap-2 justify-end mt-6">
            {!alertOnly && (
              <Button variant="secondary" size="md" onClick={onClose}>{cancelLabel}</Button>
            )}
            <Button
              variant={alertOnly ? 'primary' : confirmVariant}
              size="md"
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
