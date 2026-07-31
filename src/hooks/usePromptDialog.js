'use client'

import { useState, useCallback } from 'react'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

export function usePromptDialog() {
  const [config, setConfig] = useState(null)

  const close = useCallback(() => setConfig(null), [])

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setConfig({
        title: options.title ?? 'Confirm',
        message,
        confirmLabel: options.confirmLabel ?? 'Delete',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        confirmVariant: options.confirmVariant ?? 'danger',
        alertOnly: false,
        onConfirm: () => { resolve(true); close() },
        onClose: () => { resolve(false); close() },
      })
    })
  }, [close])

  const alert = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setConfig({
        title: options.title ?? 'Notice',
        message,
        confirmLabel: options.confirmLabel ?? 'OK',
        confirmVariant: 'primary',
        alertOnly: true,
        onConfirm: () => { resolve(); close() },
        onClose: () => { resolve(); close() },
      })
    })
  }, [close])

  const dialog = (
    <ConfirmDialog
      isOpen={!!config}
      title={config?.title ?? ''}
      message={config?.message ?? ''}
      confirmLabel={config?.confirmLabel}
      cancelLabel={config?.cancelLabel}
      confirmVariant={config?.confirmVariant}
      alertOnly={config?.alertOnly}
      onConfirm={config?.onConfirm}
      onClose={config?.onClose}
    />
  )

  return { confirm, alert, dialog }
}
