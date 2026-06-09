import { NextRequest, NextResponse } from 'next/server'
import { testProviderConnection } from '@/server/providers'

export async function POST(request: NextRequest) {
  try {
    const { type } = await request.json()
    if (!type) return NextResponse.json({ error: 'Provider type is required' }, { status: 400 })
    const result = await testProviderConnection(type)
    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}
