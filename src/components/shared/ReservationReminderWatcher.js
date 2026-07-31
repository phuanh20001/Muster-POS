'use client'

import { useRouter } from 'next/navigation'
import Modal from '@/components/shared/Modal'
import Button from '@/components/shared/Button'
import { useReservations } from '@/contexts/ReservationsContext'

function untilLabel(scheduledAt) {
  const mins = Math.max(0, Math.round((new Date(scheduledAt).getTime() - Date.now()) / 60000))
  if (mins < 60) return `in ${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `in ${h}h ${m}m` : `in ${h}h`
}

export default function ReservationReminderWatcher() {
  const router = useRouter()
  const { dueReminders, ackReminder } = useReservations()

  const current = dueReminders[0] ?? null
  if (!current) return null

  const timeStr = new Date(current.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <Modal isOpen={!!current} onClose={() => ackReminder(current)} title="📅 Upcoming Reservation">
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <span className="font-bold text-gray-900 text-lg">{current.name}</span>
            <span className="text-sm font-semibold text-amber-600">{untilLabel(current.scheduledAt)}</span>
          </div>
          <div className="text-sm text-gray-500">
            {timeStr} · party of {current.partySize}
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm text-gray-700">
          {current.phone && (
            <div className="flex justify-between">
              <span className="text-gray-500">Phone</span>
              <span className="font-medium">{current.phone}</span>
            </div>
          )}
          {current.note && (
            <div>
              <span className="text-gray-500">Note</span>
              <p className="mt-0.5">{current.note}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => ackReminder(current)}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Got it
          </button>
          <Button variant="primary" className="flex-1" onClick={() => { ackReminder(current); router.push('/reservations') }}>
            View reservations
          </Button>
        </div>

        {dueReminders.length > 1 && (
          <p className="text-xs text-center text-gray-400">{dueReminders.length - 1} more reminder{dueReminders.length - 1 !== 1 ? 's' : ''} waiting</p>
        )}
      </div>
    </Modal>
  )
}
