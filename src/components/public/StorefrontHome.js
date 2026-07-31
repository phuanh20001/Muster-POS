'use client'

import Link from 'next/link'
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand'

// Marketing homepage for LAN/preview. Production marketing lives on Cloudflare Pages
// (marketing/) at www.dreamy-cafe.com; the tunnel host sends public / → /order.
export default function StorefrontHome() {
  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <header className="bg-gray-950 text-white px-4 py-4 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <div className="font-bold text-lg tracking-tight">{BRAND_NAME}</div>
            <div className="text-gray-400 text-xs">{BRAND_TAGLINE}</div>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/loyalty" className="text-gray-300 hover:text-white">
              Loyalty
            </Link>
            <Link
              href="/order"
              className="bg-white text-gray-900 px-4 py-2 rounded-xl font-semibold hover:bg-gray-100"
            >
              Order Online
            </Link>
          </nav>
        </div>
      </header>

      <section className="bg-gray-950 text-white px-4 py-16 sm:py-24">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-5xl sm:text-6xl mb-6">☕</div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Welcome to {BRAND_NAME}
          </h1>
          <p className="text-gray-400 text-lg mb-8 max-w-xl mx-auto">
            Fresh coffee, homemade food, and a cozy spot to slow down. Order ahead for quick pickup.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/order"
              className="inline-block w-full sm:w-auto bg-white text-gray-900 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-gray-100"
            >
              Order Online →
            </Link>
            <Link
              href="/loyalty"
              className="inline-block w-full sm:w-auto border border-white/30 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-white/10"
            >
              Check my stamps
            </Link>
          </div>
        </div>
      </section>

      <section className="px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold text-gray-900 mb-4">About us</h2>
          <p className="text-gray-600 leading-relaxed">
            {BRAND_NAME} is your neighbourhood coffee shop — serving specialty espresso, fresh pastries,
            and hearty meals made with care. Whether you are grabbing a flat white on the go or settling
            in for brunch, we are glad you are here.
          </p>
        </div>
      </section>

      <section className="px-4 py-12 bg-white border-y border-gray-100">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Visit us</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Address</div>
              <p className="text-gray-700">12 Example Street<br />Sampleton, ACT 2600</p>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Hours</div>
              <p className="text-gray-700">
                Mon–Fri: 7:00 am – 5:00 pm<br />
                Sat: 7:30 am – 3:00 pm<br />
                Sun: 8:00 am – 3:00 pm
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Phone</div>
              <p className="text-gray-700">(02) 1234 5678</p>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pickup</div>
              <p className="text-gray-700">Order online and collect at the counter.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-12">
        <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <span className="text-3xl">🎁</span>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Loyalty rewards</h2>
              <p className="text-gray-600 text-sm mb-4">
                Buy 9 coffees, get the 10th free. Order online with your phone number and stamps are added automatically.
              </p>
              <Link
                href="/loyalty"
                className="inline-block px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Check your stamps
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="px-4 py-8 bg-gray-950 text-gray-400 text-sm">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="font-semibold text-white">{BRAND_NAME}</div>
          <div className="flex items-center gap-6">
            <Link href="/order" className="hover:text-white">Order Online</Link>
            <Link href="/loyalty" className="hover:text-white">Loyalty</Link>
            <Link href="/order" className="hover:text-white">Find my order</Link>
          </div>
        </div>
        <p className="max-w-3xl mx-auto text-center sm:text-left text-xs text-gray-500 mt-6">
          © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
