import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { verifyManagerAccess } from '@/lib/auth'

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const EXT_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

export async function POST(request) {
  try {
    if (!(await verifyManagerAccess(await cookies()))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WebP, and GIF images are allowed' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image must be 2 MB or smaller' }, { status: 400 })
    }

    const ext = EXT_BY_TYPE[file.type]
    const filename = `product-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'products')
    await mkdir(uploadDir, { recursive: true })

    const bytes = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(uploadDir, filename), bytes)

    return NextResponse.json({ url: `/uploads/products/${filename}` })
  } catch {
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
  }
}
