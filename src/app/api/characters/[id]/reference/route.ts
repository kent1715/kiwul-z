import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProviderConfig, generateImage } from '@/server/providers'
import { ensureProjectDirs, getCharacterImagePath, toApiPath } from '@/server/storage'
import type { ImageConfig } from '@/server/providers/provider.types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const character = await db.character.findUnique({ where: { id } })
    if (!character) return NextResponse.json({ error: 'Character not found' }, { status: 404 })

    const imageConfig = await getProviderConfig<ImageConfig>('image')
    if (!imageConfig || !imageConfig.enabled) {
      return NextResponse.json({ error: 'No active image provider' }, { status: 400 })
    }

    ensureProjectDirs(character.project_id)

    const prompt =
      character.visual_prompt ||
      `portrait of ${character.name}, ${character.gender || ''}, ${character.outfit || ''}, ${character.hair_or_hijab || ''}, cinematic, realistic, high detail, consistent character identity`
    const negativePrompt =
      character.negative_prompt ||
      'blurry, low quality, distorted face, bad anatomy, extra fingers, text, watermark'

    const outputPath = getCharacterImagePath(character.project_id, character.id)
    const result = await generateImage(imageConfig, prompt, negativePrompt, outputPath)

    await db.character.update({
      where: { id },
      data: { reference_image_path: toApiPath(result.file_path) },
    })

    return NextResponse.json({ reference_image_path: toApiPath(result.file_path) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error generating character reference:', message)
    return NextResponse.json({ error: message || 'Failed to generate reference image' }, { status: 500 })
  }
}
