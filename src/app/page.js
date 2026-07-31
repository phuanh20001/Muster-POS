import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { BRAND_NAME } from '@/lib/brand'

export const metadata = {
  title: BRAND_NAME,
  description: 'Coffee, food, and online pickup ordering.',
}

export default async function Home() {
  const secret = process.env.PUBLIC_ZONE_SECRET
  const zone = (await headers()).get('x-dreamy-zone')
  if (!secret || zone !== secret) redirect('/pos')
  redirect('/order')
}
