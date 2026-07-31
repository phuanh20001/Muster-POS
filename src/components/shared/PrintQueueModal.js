'use client'

import { useState } from 'react'
import Modal from '@/components/shared/Modal'
import { formatTime, formatDate } from '@/lib/formatters'

export default function PrintQueueModal({ isOpen, onClose, jobs, onDismiss, onReprint, onRefresh }) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  async function handleReprint(jobId) {
    setBusyId(jobId)
    setError('')
    const res = await fetch(`/api/print-queue/${jobId}/reprint`, { method: 'POST' })
    setBusyId(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Reprint failed')
      return
    }
    setError('')
    await onRefresh()
  }

  async function handleDismiss(jobId) {
    setBusyId(jobId)
    setError('')
    await onDismiss(jobId)
    setBusyId(null)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Print Queue" maxWidth="max-w-2xl">
      {jobs.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No failed print jobs.</p>
      ) : (
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-200">
                <th className="text-left py-2 font-semibold">Title</th>
                <th className="text-left py-2 font-semibold">Table / Name</th>
                <th className="text-left py-2 font-semibold">Description</th>
                <th className="text-left py-2 font-semibold">Time</th>
                <th className="text-left py-2 font-semibold">Status</th>
                <th className="text-right py-2 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="py-3 font-semibold text-gray-900 whitespace-nowrap">{job.ticketLabel}</td>
                  <td className="py-3 text-gray-700">{job.locationLabel}</td>
                  <td className="py-3 text-gray-600">{job.stationLabel}</td>
                  <td className="py-3 text-gray-500 tabular-nums whitespace-nowrap">
                    {formatDate(job.updatedAt)} {formatTime(job.updatedAt)}
                  </td>
                  <td className="py-3 text-red-600 font-semibold">Failed</td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleReprint(job.id)}
                        disabled={busyId === job.id}
                        className="px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-50"
                      >
                        {busyId === job.id ? '…' : 'Reprint'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismiss(job.id)}
                        disabled={busyId === job.id}
                        aria-label="Remove from queue"
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
    </Modal>
  )
}
