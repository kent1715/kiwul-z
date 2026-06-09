import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProviderConfig, generateImage } from '@/server/providers'
import { ensureProjectDirs, getLocationImagePath, toApiPath } from '@/server/storage'
import type { ImageConfig } from '@/server/providers/provider.types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const location = await db.location.findUnique({ where: { id } })
    if (!location) return NextResponse.json({ error: 'Location not found' }, { status: 404 })

    const imageConfig = await getProviderConfig<ImageConfig>('image')
    if (!imageConfig || !imageConfig.enabled) {
      return NextResponse.json({ error: 'No active image provider' }, { status: 400 })
    }

    ensureProjectDirs(location.project_id)

    const prompt =
      location.consistency_prompt ||
      `Location: ${location.name}. ${location.description || ''} ${location.visual_style || ''} ${location.lighting ? `Lighting: ${location.lighting}` : ''}`
    const negativePrompt = 'blurry, low quality, distorted, text, watermark'

    const outputPath = getLocationImagePath(location.project_id, location.id)
    const result = await generateImage(imageConfig, prompt, negativePrompt, outputPath)

    await db.location.update({
      where: { id },
      data: { reference_image_path: toApiPath(result.file_path) },
    })

    return NextResponse.json({ reference_image_path: toApiPath(result.file_path) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error generating location reference:', message)
    return NextResponse.json({ error: message || 'Failed to generate reference image' }, { status: 500 })
  }
}
