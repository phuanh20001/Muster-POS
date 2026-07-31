'use client'

import { usePathname } from 'next/navigation'
import BottomNav from './BottomNav'
import { isStaffPath } from '@/lib/staffPaths'

export default function ConditionalBottomNav() {
  const pathname = usePathname()
  if (!isStaffPath(pathname)) return null
  return <BottomNav />
}
