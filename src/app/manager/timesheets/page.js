'use client'

import { useContext } from 'react'
import TimesheetsEditor from '@/components/manager/TimesheetsEditor'
import { ManagerSessionContext } from '@/app/manager/layout'

export default function TimesheetsPage() {
  const session = useContext(ManagerSessionContext)
  const editorRole = session?.role === 'ADMIN' ? 'ADMIN' : 'MANAGER'

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Timesheets</h1>
      <TimesheetsEditor
        editorRole={editorRole}
        subtitle={editorRole === 'ADMIN' ? 'View and edit staff and manager clock records' : 'View and edit staff clock records'}
      />
    </div>
  )
}
