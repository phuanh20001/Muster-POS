import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(request, { params }) {
  try {
    const { id } = await params
    const body = await request.json()
    const data = {}
    if ('stampsCollected' in body) data.stampsCollected = body.stampsCollected
    if ('stampsRedeemed' in body) data.stampsRedeemed = body.stampsRedeemed
    const customer = await prisma.customer.update({ where: { id: parseInt(id) }, data })
    const freeItems = Math.floor(customer.stampsCollected / 9) - customer.stampsRedeemed
    return NextResponse.json({ ...customer, freeItems })
  } catch {
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 })
  }
}
