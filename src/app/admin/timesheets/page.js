'use client'

import TimesheetsEditor from '@/components/manager/TimesheetsEditor'

export default function AdminTimesheetsPage() {
  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Timesheets</h1>
      <TimesheetsEditor
        editorRole="ADMIN"
        subtitle="View and edit staff and manager clock records"
      />
    </div>
  )
}
