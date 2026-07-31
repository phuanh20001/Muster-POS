import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

const VALID_NAME = /^product-[A-Za-z0-9._-]+\.(jpg|png|webp|gif)$/
const CONTENT_TYPE = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export async function GET(request, { params }) {
  try {
    const { filename } = await params
    if (!filename || !VALID_NAME.test(filename)) {
      return new NextResponse('Not found', { status: 404 })
    }

    const ext = path.extname(filename)
    const filePath = path.join(process.cwd(), 'public', 'uploads', 'products', filename)
    const file = await readFile(filePath)

    return new NextResponse(file, {
      status: 200,
      headers: {
        'Content-Type': CONTENT_TYPE[ext] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
