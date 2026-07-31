'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext'
import { useOnlineOrders } from '@/contexts/OnlineOrdersContext'

function TabIcon({ children }) {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" aria-hidden>
      {children}
    </svg>
  )
}

const PRIMARY_LINKS = [
  {
    href: '/pos',
    label: 'POS',
    match: (p) => p === '/pos' || (p.startsWith('/pos/') && !p.startsWith('/pos/loyalty')),
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72M6.75 21v-3a1.5 1.5 0 011.5-1.5h.75a1.5 1.5 0 011.5 1.5v3" />
    ),
  },
  {
    href: '/tables',
    label: 'Tables',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    ),
  },
  {
    href: '/online',
    label: 'Online',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m-9 9h18" />
    ),
  },
  {
    href: '/orders',
    label: 'Orders',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 3.75h6M9 8.25h6m-9.75 12h13.5A1.5 1.5 0 0020.25 18.75V5.25A1.5 1.5 0 0018.75 3.75H5.25A1.5 1.5 0 003.75 5.25v13.5a1.5 1.5 0 001.5 1.5z" />
    ),
  },
  {
    href: '/pos/loyalty',
    label: 'Loyalty',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    ),
  },
]

function CountPill({ count, className }) {
  return (
    <span className={`min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-gray-950 ${className}`}>
      {count > 9 ? '9+' : count}
    </span>
  )
}

function linkActive(pathname, link) {
  if (link.match) return link.match(pathname)
  return pathname === link.href || pathname.startsWith(`${link.href}/`)
}

export default function BottomNav() {
  const pathname = usePathname()
  const { newCount, inProgressCount, readyCount } = useOnlineOrders()
  const { settings } = useFeatureSettings()

  // Typed table numbers make the floor plan meaningless — drop its tab.
  const links = settings?.manualTableNumbers ? PRIMARY_LINKS.filter((l) => l.href !== '/tables') : PRIMARY_LINKS

  return (
    <nav className="staff-bottom-nav bg-gray-950 text-white flex items-stretch border-t border-gray-800 shrink-0">
      {links.map((link) => {
        const active = linkActive(pathname, link)
        const isOnline = link.href === '/online'
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex-1 flex flex-col items-center justify-center gap-1 min-h-[4rem] transition-colors ${
              active ? 'text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className={`relative flex items-center justify-center rounded-full px-4 py-1 transition-colors ${active ? 'bg-white text-gray-950' : ''}`}>
              <TabIcon>{link.icon}</TabIcon>
              {isOnline && (newCount > 0 || inProgressCount > 0 || readyCount > 0) && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {newCount > 0 && <CountPill count={newCount} className="bg-red-500" />}
                  {inProgressCount > 0 && <CountPill count={inProgressCount} className="bg-orange-400" />}
                  {readyCount > 0 && <CountPill count={readyCount} className="bg-green-500" />}
                </span>
              )}
            </span>
            <span className="text-xs font-semibold leading-none">{link.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
