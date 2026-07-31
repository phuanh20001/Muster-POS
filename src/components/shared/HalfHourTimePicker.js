'use client'

import { stepHalfHour, formatHalfHourDisplay } from '@/lib/clockTime'

export default function HalfHourTimePicker({ value, onChange, compact = false }) {
  const btnClass = compact
    ? 'px-2 py-1 text-base font-medium text-gray-500 hover:bg-gray-100 transition-colors select-none'
    : 'px-3 py-2.5 text-xl font-medium text-gray-500 hover:bg-gray-100 transition-colors select-none'
  const textClass = compact
    ? 'flex-1 text-center text-xs font-medium text-gray-900 tabular-nums'
    : 'flex-1 text-center text-sm font-medium text-gray-900 tabular-nums'

  return (
    <div className={`flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white ${compact ? 'min-w-[8.5rem]' : ''}`}>
      <button type="button" onClick={() => onChange(stepHalfHour(value, -30))} className={btnClass}>−</button>
      <span className={textClass}>{formatHalfHourDisplay(value)}</span>
      <button type="button" onClick={() => onChange(stepHalfHour(value, +30))} className={btnClass}>+</button>
    </div>
  )
}
