import Link from 'next/link'
import { BRAND_NAME } from '@/lib/brand'

export const metadata = {
  title: `Privacy Policy — ${BRAND_NAME}`,
  description: `How ${BRAND_NAME} collects, uses, and protects your personal information.`,
}

// Static privacy policy for the public (customer-facing) zone. The public site
// collects a name + phone number for loyalty and online orders, so a privacy
// policy is expected under the Australian Privacy Principles (APPs).
//
// IMPORTANT: the [REVIEW] items below are placeholders — the business owner must
// confirm the specifics (legal entity name, contact address, retention period,
// exact third parties) and should have this wording checked by someone qualified
// before relying on it. Update the effective date when you finalise it.
export default function PrivacyPolicyPage() {
  const businessName = BRAND_NAME
  const contactEmail = process.env.NEXT_PUBLIC_PRIVACY_EMAIL || 'privacy@dreamy-cafe.com'

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <header className="bg-gray-950 text-white px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="font-bold text-base tracking-tight hover:opacity-80">{businessName}</Link>
          <Link href="/order" className="text-sm text-gray-300 hover:text-white">Order online</Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mt-1">
          Effective date: [REVIEW — set when finalised]
        </p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-gray-700">
          <section>
            <p>
              {businessName} respects your privacy. This policy explains what personal
              information we collect when you order online or join our loyalty program,
              how we use it, and your rights under the Australian Privacy Principles (APPs)
              in the <em>Privacy Act 1988</em> (Cth).
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">What we collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Contact details</strong> — your name and phone number, to identify your loyalty stamp card and your online orders.</li>
              <li><strong>Order details</strong> — the items you order, order times, and amounts.</li>
              <li><strong>Payment</strong> — card payments are processed by our payment provider ([REVIEW — Stripe and/or Square]). We do <strong>not</strong> store your full card number; it is handled directly by the provider.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">How we use it</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To prepare and fulfil your orders.</li>
              <li>To run the loyalty stamp program (earning and redeeming rewards).</li>
              <li>To keep records we are required to keep (e.g. sales records for tax purposes).</li>
            </ul>
            <p className="mt-2">
              We do not sell your personal information. We do not use it for marketing
              unless you have separately agreed to that. [REVIEW — remove or adjust if you
              do send marketing.]
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Who we share it with</h2>
            <p>
              We share information only where needed to run the café: our payment provider
              ([REVIEW — Stripe/Square]) to process card payments, and our infrastructure
              provider ([REVIEW — e.g. Cloudflare]) to deliver the website. These providers
              handle your data under their own privacy terms. We do not otherwise disclose
              your information except where required by law.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">How long we keep it</h2>
            <p>
              We keep loyalty and order records for as long as needed to run the program and
              to meet our legal record-keeping obligations [REVIEW — state a period, e.g.
              sales records are kept for 5 years per ATO requirements], after which we delete
              or de-identify them.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Your rights</h2>
            <p>
              You can ask us what personal information we hold about you, ask us to correct
              it, or ask us to delete your loyalty record. Contact us using the details below.
              If you have a concern we cannot resolve, you can contact the Office of the
              Australian Information Commissioner (OAIC) at{' '}
              <a href="https://www.oaic.gov.au" className="underline text-gray-900" target="_blank" rel="noopener noreferrer">oaic.gov.au</a>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Contact us</h2>
            <p>
              [REVIEW — legal/trading entity name and business address]<br />
              Email: <a href={`mailto:${contactEmail}`} className="underline text-gray-900">{contactEmail}</a>
            </p>
          </section>

          <p className="text-xs text-gray-400 pt-4 border-t border-gray-200">
            This policy may be updated from time to time; the effective date above shows the
            current version.
          </p>
        </div>

        <div className="mt-10">
          <Link href="/order" className="text-sm text-gray-900 underline hover:opacity-70">← Back to ordering</Link>
        </div>
      </div>
    </div>
  )
}
