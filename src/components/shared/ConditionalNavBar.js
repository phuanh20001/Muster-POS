'use client'

import { usePathname } from 'next/navigation'
import NavBar from './NavBar'
import ReservationReminderWatcher from './ReservationReminderWatcher'
import PrintQueueWatcher from './PrintQueueWatcher'
import ServiceWorkerRegister from './ServiceWorkerRegister'
import PwaInstallBanner from './PwaInstallBanner'
import { isStaffPath } from '@/lib/staffPaths'

export default function ConditionalNavBar() {
  const pathname = usePathname()
  if (!isStaffPath(pathname)) return null
  return (
    <PrintQueueWatcher>
      <NavBar />
      <PwaInstallBanner />
      <ReservationReminderWatcher />
      <ServiceWorkerRegister />
    </PrintQueueWatcher>
  )
}
