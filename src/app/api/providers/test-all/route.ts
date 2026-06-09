import { NextResponse } from 'next/server'
import { testProviderConnection } from '@/server/providers'
import type { ProviderType } from '@/server/providers/provider.types'

const PROVIDER_TYPES: ProviderType[] = ['llm', 'image', 'video', 'tts', 'render']

export async function POST() {
  try {
    const results: Record<string, unknown> = {}

    for (const type of PROVIDER_TYPES) {
      try {
        results[type] = await testProviderConnection(type)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        results[type] = { success: false, message: `Test failed: ${message}` }
      }
    }

    const allOk = Object.values(results).every(
      (r) => r && typeof r === 'object' && 'success' in r && (r as { success: boolean }).success
    )

    return NextResponse.json({
      all_ok: allOk,
      results,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ all_ok: false, results: {}, error: message }, { status: 500 })
  }
}
