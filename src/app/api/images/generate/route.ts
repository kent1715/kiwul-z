import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProviderConfig, generateImage } from '@/server/providers'
import { ensureProjectDirs, getImagePath, toApiPath } from '@/server/storage'
import type { ImageConfig } from '@/server/providers/provider.types'

export async function POST(request: NextRequest) {
  try {
    const { project_id, sceneId } = await request.json()
    if (!project_id) return NextResponse.json({ error: 'project_id is required' }, { status: 400 })

    const project = await db.project.findUnique({ where: { id: project_id } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    ensureProjectDirs(project_id)

    const imageConfig = await getProviderConfig<ImageConfig>('image')
    if (!imageConfig || !imageConfig.enabled) {
      return NextResponse.json(
        { error: 'No active image provider. Configure Z-Image in Provider Settings.' },
        { status: 400 }
      )
    }

    // Get scenes to generate
    let scenes
    if (sceneId) {
      const scene = await db.scene.findUnique({ where: { id: sceneId } })
      if (!scene) return NextResponse.json({ error: 'Scene not found' }, { status: 404 })
      if (scene.locked) return NextResponse.json({ error: 'Scene is locked' }, { status: 400 })
      scenes = [scene]
    } else {
      scenes = await db.scene.findMany({
        where: { project_id, locked: false },
        orderBy: { scene_number: 'asc' },
      })
    }

    if (!scenes.length) return NextResponse.json({ error: 'No scenes to generate' }, { status: 400 })

    const results = []
    const errors = []

    for (const scene of scenes) {
      if (!scene.image_prompt) {
        errors.push({ scene_id: scene.id, error: 'No image_prompt for this scene' })
        continue
      }

      // Update status to running
      await db.scene.update({
        where: { id: scene.id },
        data: { image_status: 'running', error_message: null },
      })

      try {
        const outputPath = getImagePath(project_id, scene.id)
        const negativePrompt =
          scene.negative_prompt ||
          'blurry, low quality, distorted face, bad anatomy, extra fingers, text, watermark'

        const result = await generateImage(imageConfig, scene.image_prompt, negativePrompt, outputPath, {
          seed: scene.seed || undefined,
          size: project.resolution === '720x1280' ? '768x1024' : '768x1024',
        })

        // Update scene with result
        await db.scene.update({
          where: { id: scene.id },
          data: {
            image_path: toApiPath(result.file_path),
            image_status: 'completed',
            seed: result.seed || scene.seed,
          },
        })

        // Create asset record
        await db.asset.create({
          data: {
            project_id,
            type: 'image',
            scene_id: scene.id,
            file_path: result.file_path,
            prompt: scene.image_prompt,
            seed: result.seed,
            provider: 'zimage',
          },
        })

        results.push({ scene_id: scene.id, status: 'completed', image_path: toApiPath(result.file_path) })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        await db.scene.update({
          where: { id: scene.id },
          data: { image_status: 'failed', error_message: message },
        })
        errors.push({ scene_id: scene.id, error: message })
      }
    }

    // Check if all scenes have images
    const allScenes = await db.scene.findMany({ where: { project_id } })
    const allHaveImages = allScenes.every((s) => s.image_status === 'completed')
    if (allHaveImages) {
      await db.project.update({ where: { id: project_id }, data: { status: 'images_ready' } })
    }

    return NextResponse.json({ results, errors, scenes: allScenes })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error generating images:', message)
    return NextResponse.json({ error: message || 'Failed to generate images' }, { status: 500 })
  }
}
