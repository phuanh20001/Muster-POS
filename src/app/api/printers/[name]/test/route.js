import { NextResponse } from 'next/server'
import { verifyAdminAccess } from '@/lib/auth'
import { cookies } from 'next/headers'
import { printTestDocket } from '@/lib/printer'

export async function POST(request, { params }) {
  try {
    const admin = await verifyAdminAccess(await cookies())
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { name } = await params
    await printTestDocket(name)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err.message ?? 'Print failed' }, { status: 500 })
  }
}
