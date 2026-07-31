import './globals.css'
import ConditionalNavBar from '@/components/shared/ConditionalNavBar'
import ConditionalBottomNav from '@/components/shared/ConditionalBottomNav'
import AppShellBody from '@/components/shared/AppShellBody'
import DemoBanner from '@/components/shared/DemoBanner'
import { CashierProvider } from '@/contexts/CashierContext'
import { FeatureSettingsProvider } from '@/contexts/FeatureSettingsContext'
import { OnlineOrdersProvider } from '@/contexts/OnlineOrdersContext'
import { ReservationsProvider } from '@/contexts/ReservationsContext'
import { BRAND_NAME } from '@/lib/brand'

export const metadata = {
  title: `${BRAND_NAME} POS`,
  description: `Point of Sale system for ${BRAND_NAME}`,
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: BRAND_NAME },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
}

export const viewport = {
  themeColor: '#030712',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject attributes on <body> before hydration */}
      <body className="bg-white h-screen overflow-hidden flex flex-col" suppressHydrationWarning>
        <CashierProvider>
          <FeatureSettingsProvider>
            <OnlineOrdersProvider>
              <ReservationsProvider>
                <AppShellBody />
                <ConditionalNavBar />
                <main className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</main>
                <ConditionalBottomNav />
                <DemoBanner />
              </ReservationsProvider>
            </OnlineOrdersProvider>
          </FeatureSettingsProvider>
        </CashierProvider>
      </body>
    </html>
  )
}
