import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdminOrManagerAccess } from '@/lib/auth'
import { createSquarePairingCode, getSquarePairingCode } from '@/lib/square'

export async function POST(request) {
  try {
    if (!(await verifyAdminOrManagerAccess(await cookies()))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let name = 'DreamyCafe counter'
    try {
      const body = await request.json()
      if (body?.name && typeof body.name === 'string') name = body.name.trim().slice(0, 128) || name
    } catch {
      // empty body is fine
    }

    const deviceCode = await createSquarePairingCode(name)
    return NextResponse.json(deviceCode)
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to create pairing code' }, { status: 400 })
  }
}

export async function GET(request) {
  try {
    if (!(await verifyAdminOrManagerAccess(await cookies()))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const id = new URL(request.url).searchParams.get('id')?.trim()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const deviceCode = await getSquarePairingCode(id)
    return NextResponse.json(deviceCode)
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to fetch pairing status' }, { status: 400 })
  }
}
