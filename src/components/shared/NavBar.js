'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import ClockInOutModal from '@/components/shared/ClockInOutModal'
import ManagerPinModal from '@/components/shared/ManagerPinModal'
import { usePrintQueue } from '@/components/shared/PrintQueueWatcher'
import { useReservations } from '@/contexts/ReservationsContext'
import { useCashier } from '@/contexts/CashierContext'
import { BRAND_NAME, BRAND_INITIALS } from '@/lib/brand'

function NavIcon({ children, className = 'w-6 h-6' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" aria-hidden>
      {children}
    </svg>
  )
}

function UtilityButton({ label, onClick, active, badge, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`flex flex-col items-center justify-center gap-0.5 min-w-[3.75rem] min-h-[3.5rem] px-2 rounded-xl transition-colors relative ${
        active ? 'bg-white/15 text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
      <span className="text-[11px] font-medium leading-none">{label}</span>
      {badge}
    </button>
  )
}

function MoreSheet({ onManager, onAdmin, onLock, hasSession, onManagerPage, onAdminPage }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const rowBase = 'flex items-center gap-3 w-full px-4 py-4 rounded-xl text-base font-medium transition-colors'

  return (
    <div className="relative" ref={ref}>
      <UtilityButton label="More" onClick={() => setOpen((v) => !v)} active={open}>
        <NavIcon>
          <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </NavIcon>
      </UtilityButton>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-gray-700 bg-gray-900 p-2 shadow-2xl z-50"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onManager() }}
            className={`${rowBase} ${onManagerPage ? 'text-white bg-white/10' : 'text-gray-200 hover:bg-white/10 hover:text-white'}`}
          >
            <NavIcon className="w-5 h-5 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 19.5a7.5 7.5 0 0115 0v.75H4.5v-.75z" />
            </NavIcon>
            Manager
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onAdmin() }}
            className={`${rowBase} ${onAdminPage ? 'text-white bg-white/10' : 'text-gray-200 hover:bg-white/10 hover:text-white'}`}
          >
            <NavIcon className="w-5 h-5 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </NavIcon>
            Admin
          </button>
          <a
            role="menuitem"
            href="/onlineorder"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className={`${rowBase} text-gray-200 hover:bg-white/10 hover:text-white`}
          >
            <NavIcon className="w-5 h-5 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </NavIcon>
            Online order preview
          </a>
          {hasSession && (
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onLock() }}
              className={`${rowBase} text-amber-400 hover:bg-white/10`}
            >
              <NavIcon className="w-5 h-5 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 00-9 0v3.75m-.75 0h10.5a2.25 2.25 0 012.25 2.25v6.75a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25v-6.75a2.25 2.25 0 012.25-2.25z" />
              </NavIcon>
              Lock &amp; sign out
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { count: printQueueCount, openQueue } = usePrintQueue()
  const { upcomingCount } = useReservations()
  const { cashier, openSwitchUser } = useCashier()
  const [sessionRole, setSessionRole] = useState(null)
  const [adminSession, setAdminSession] = useState(false)
  const [posSession, setPosSession] = useState(false)
  const [clockOpen, setClockOpen] = useState(false)
  const [managerModalOpen, setManagerModalOpen] = useState(false)
  const [adminModalOpen, setAdminModalOpen] = useState(false)

  useEffect(() => {
    function checkSessions() {
      Promise.all([
        fetch('/api/auth/manager', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
        fetch('/api/auth/admin', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
        fetch('/api/auth/pos', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      ]).then(([manager, admin, pos]) => {
        setSessionRole(manager?.role ?? null)
        setAdminSession(!!admin?.role)
        setPosSession(!!pos?.role)
      }).catch(() => {
        setSessionRole(null)
        setAdminSession(false)
        setPosSession(false)
      })
    }
    checkSessions()
    window.addEventListener('session-changed', checkSessions)
    const id = setInterval(checkSessions, 30000)
    return () => {
      clearInterval(id)
      window.removeEventListener('session-changed', checkSessions)
    }
  }, [pathname])

  function openManager() {
    if (sessionRole && ['MANAGER', 'ADMIN'].includes(sessionRole)) {
      router.push('/manager/menu')
      return
    }
    setManagerModalOpen(true)
  }

  function openAdmin() {
    if (adminSession) {
      router.push('/admin')
      return
    }
    setAdminModalOpen(true)
  }

  async function lockManager() {
    await Promise.all([
      fetch('/api/auth/manager', { method: 'DELETE' }),
      fetch('/api/auth/admin', { method: 'DELETE' }),
      fetch('/api/auth/pos', { method: 'DELETE' }),
    ])
    setSessionRole(null)
    setAdminSession(false)
    setPosSession(false)
    setManagerModalOpen(false)
    setAdminModalOpen(false)
    window.dispatchEvent(new Event('session-changed'))
    router.push('/login')
  }

  function handleManagerSuccess(user) {
    setManagerModalOpen(false)
    setSessionRole(user?.role ?? 'MANAGER')
    window.dispatchEvent(new Event('session-changed'))
    router.push('/manager/menu')
  }

  function handleAdminSuccess() {
    setAdminModalOpen(false)
    setAdminSession(true)
    window.dispatchEvent(new Event('session-changed'))
    router.push('/admin')
  }

  const hasSession = !!sessionRole || adminSession || posSession
  const onManagerPage = pathname.startsWith('/manager')
  const onAdminPage = pathname.startsWith('/admin')
  // Switching cashier is a POS-only action (its modal lives on /pos).
  const onPosPage = pathname === '/pos' || (pathname.startsWith('/pos/') && !pathname.startsWith('/pos/loyalty'))

  return (
    <>
      <nav className="staff-nav bg-gray-950 text-white flex items-center gap-2 px-3 border-b border-gray-800 shrink-0 min-h-[4rem]">
        <div className="flex items-center flex-1 min-w-0">
          <span className="text-base font-bold tracking-tight hidden sm:inline">{BRAND_NAME}</span>
          <span className="text-base font-bold tracking-tight sm:hidden">{BRAND_INITIALS}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onPosPage && (
            <UtilityButton
              label={cashier ? cashier.name.split(' ')[0] : 'Switch'}
              onClick={openSwitchUser}
              badge={cashier ? (
                <span className="absolute top-1 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-gray-950 text-[10px] font-bold flex items-center justify-center">
                  {cashier.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                </span>
              ) : null}
            >
              <NavIcon>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </NavIcon>
            </UtilityButton>
          )}

          <UtilityButton
            label="Reserve"
            onClick={() => router.push('/reservations')}
            active={pathname.startsWith('/reservations')}
            badge={upcomingCount > 0 ? (
              <span className="absolute top-1 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                {upcomingCount > 9 ? '9+' : upcomingCount}
              </span>
            ) : null}
          >
            <NavIcon className={upcomingCount > 0 ? 'w-6 h-6 text-amber-400' : 'w-6 h-6'}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </NavIcon>
          </UtilityButton>

          <UtilityButton
            label="Print"
            onClick={openQueue}
            active={printQueueCount > 0}
            badge={printQueueCount > 0 ? (
              <span className="absolute top-1 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                {printQueueCount > 9 ? '9+' : printQueueCount}
              </span>
            ) : null}
          >
            <NavIcon className={printQueueCount > 0 ? 'w-6 h-6 text-red-400' : 'w-6 h-6'}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m-.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18M6.34 18l-1.5-4.171M17.66 18l1.5-4.171M9 9h6m-6 3h6m-6 3h3M6.75 6.75h10.5a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5H6.75a1.5 1.5 0 01-1.5-1.5v-9a1.5 1.5 0 011.5-1.5z" />
            </NavIcon>
          </UtilityButton>

          <UtilityButton label="Clock" onClick={() => setClockOpen(true)}>
            <NavIcon>
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M12 7v5l3 2" />
            </NavIcon>
          </UtilityButton>

          <MoreSheet
            onManager={openManager}
            onAdmin={openAdmin}
            onLock={lockManager}
            hasSession={hasSession}
            onManagerPage={onManagerPage}
            onAdminPage={onAdminPage}
          />
        </div>
      </nav>

      <ClockInOutModal isOpen={clockOpen} onClose={() => setClockOpen(false)} />
      <ManagerPinModal
        isOpen={managerModalOpen}
        role="MANAGER"
        onClose={() => setManagerModalOpen(false)}
        onSuccess={handleManagerSuccess}
      />
      <ManagerPinModal
        isOpen={adminModalOpen}
        role="ADMIN"
        endpoint="/api/auth/admin"
        onClose={() => setAdminModalOpen(false)}
        onSuccess={handleAdminSuccess}
      />
    </>
  )
}
