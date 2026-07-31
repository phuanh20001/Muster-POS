'use client'

import { useState, useEffect, useMemo, createContext } from 'react'
import { useRouter } from 'next/navigation'
import PanelShell from '@/components/admin/PanelShell'
import ManagerPinModal from '@/components/shared/ManagerPinModal'
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext'
import { usePollWhenVisible } from '@/hooks/usePollWhenVisible'

const ADMIN_HEARTBEAT_MS = 3 * 60 * 1000

export const AdminSessionContext = createContext(null)

const ADMIN_LINKS = [
  { href: '/admin/shift', label: 'Routine' },
  { href: '/admin/stock', label: 'Stock' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/payroll', label: 'Payroll' },
  { href: '/admin/timesheets', label: 'Timesheets' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/printers', label: 'Printers' },
  { href: '/admin/terminal', label: 'Payments' },
  { href: '/admin/settings', label: 'Settings' },
]

export default function AdminLayout({ children }) {
  const [session, setSession] = useState(null)
  const [verified, setVerified] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [checking, setChecking] = useState(true)
  const { settings: flags } = useFeatureSettings()
  const router = useRouter()

  const links = useMemo(() => {
    const extra = []
    if (flags?.expensesEnabled) extra.push({ href: '/admin/expenses', label: 'Expenses' })
    if (flags?.purchasingEnabled) extra.push({ href: '/admin/purchasing', label: 'Purchasing' })
    if (flags?.vouchersEnabled) extra.push({ href: '/admin/vouchers', label: 'Vouchers' })
    // Slot the feature links just before Settings (the last item).
    return [...ADMIN_LINKS.slice(0, -1), ...extra, ADMIN_LINKS[ADMIN_LINKS.length - 1]]
  }, [flags])

  async function check() {
    const data = await fetch('/api/auth/admin', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    if (data?.role === 'ADMIN') {
      setSession(data)
      setVerified(true)
      setPinOpen(false)
    } else {
      setSession(null)
      setVerified(false)
      setPinOpen(true)
    }
    setChecking(false)
  }

  useEffect(() => {
    check()
    window.addEventListener('session-changed', check)
    return () => window.removeEventListener('session-changed', check)
  }, [])

  // Keep the short-lived admin session alive while the panel tab is open and
  // visible. usePollWhenVisible pauses when the tab is hidden, so a backgrounded
  // or left-behind panel lapses on the normal 5-min expiry and re-prompts.
  usePollWhenVisible(async () => {
    if (!verified) return
    const data = await fetch('/api/auth/admin', { method: 'PUT', cache: 'no-store' })
      .then((r) => r.json())
      .catch(() => null)
    if (data?.role === 'ADMIN') setSession(data)
    else check()
  }, ADMIN_HEARTBEAT_MS)

  function handleSuccess() {
    setPinOpen(false)
    window.dispatchEvent(new Event('session-changed'))
  }

  function handleClose() {
    setPinOpen(false)
    router.push('/pos')
  }

  if (checking) {
    return <div className="p-6 text-gray-400 text-sm">Checking admin access…</div>
  }

  return (
    <AdminSessionContext.Provider value={session}>
      <PanelShell ready={verified} links={links} heading="Owner">
        {verified ? children : (
          <div className="p-6 text-center text-gray-400 text-sm">Owner access required.</div>
        )}
      </PanelShell>
      <ManagerPinModal
        isOpen={pinOpen}
        role="ADMIN"
        endpoint="/api/auth/admin"
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    </AdminSessionContext.Provider>
  )
}
