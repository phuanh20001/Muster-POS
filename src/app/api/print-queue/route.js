import { NextResponse } from 'next/server'
import { listFailedDockets } from '@/lib/printQueue'

export async function GET() {
  try {
    const jobs = await listFailedDockets()
    return NextResponse.json(jobs)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch print queue' }, { status: 500 })
  }
}
