'use client'

import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import PrintQueueModal from '@/components/shared/PrintQueueModal'
import { usePollWhenVisible } from '@/hooks/usePollWhenVisible'

export const PrintQueueContext = createContext({
  count: 0,
  openQueue: () => {},
})

export function usePrintQueue() {
  return useContext(PrintQueueContext)
}

export default function PrintQueueWatcher({ children }) {
  const [jobs, setJobs] = useState([])
  const [modalOpen, setModalOpen] = useState(false)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/print-queue').then((r) => r.json()).catch(() => [])
    setJobs(Array.isArray(res) ? res : [])
  }, [])

  usePollWhenVisible(refresh, 12000)

  const openQueue = useCallback(() => setModalOpen(true), [])
  const value = useMemo(
    () => ({ count: jobs.length, openQueue }),
    [jobs.length, openQueue]
  )

  async function dismiss(jobId) {
    await fetch(`/api/print-queue/${jobId}`, { method: 'DELETE' })
    await refresh()
  }

  return (
    <PrintQueueContext.Provider value={value}>
      {children}
      <PrintQueueModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        jobs={jobs}
        onDismiss={dismiss}
        onRefresh={refresh}
      />
    </PrintQueueContext.Provider>
  )
}
