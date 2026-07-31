'use client'

import { useState, useEffect, createContext } from 'react'
import { useRouter } from 'next/navigation'
import PanelShell from '@/components/admin/PanelShell'
import ManagerPinModal from '@/components/shared/ManagerPinModal'

export const ManagerSessionContext = createContext(null)

const MANAGER_LINKS = [
  { href: '/manager/menu', label: 'Menu' },
  { href: '/manager/cash', label: 'Cash' },
  { href: '/manager/reservations', label: 'Reservations' },
  { href: '/manager/customers', label: 'Loyalty' },
  { href: '/manager/sales', label: 'Sales' },
  { href: '/manager/staff', label: 'Staff' },
  { href: '/manager/timesheets', label: 'Timesheets' },
]

export default function ManagerLayout({ children }) {
  const [ready, setReady] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [session, setSession] = useState(null)
  const router = useRouter()

  useEffect(() => {
    async function refresh() {
      const data = await fetch('/api/auth/manager', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
      if (data) {
        setSession(data)
        setReady(true)
        setPinOpen(false)
      } else {
        setSession(null)
        setReady(false)
        setPinOpen(true)
      }
    }
    refresh()
    window.addEventListener('session-changed', refresh)
    return () => window.removeEventListener('session-changed', refresh)
  }, [])

  async function loadSession() {
    const data = await fetch('/api/auth/manager', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    setSession(data)
    setReady(true)
  }

  function handleSuccess() {
    setPinOpen(false)
    loadSession()
    window.dispatchEvent(new Event('session-changed'))
  }

  function handleClose() {
    setPinOpen(false)
    router.push('/pos')
  }

  return (
    <ManagerSessionContext.Provider value={session}>
      <PanelShell ready={ready} links={MANAGER_LINKS} heading="Management">
        {children}
      </PanelShell>
      <ManagerPinModal isOpen={pinOpen} onClose={handleClose} onSuccess={handleSuccess} />
    </ManagerSessionContext.Provider>
  )
}
