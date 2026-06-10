import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProviderConfig, generateImage } from '@/server/providers'
import { ensureProjectDirs, getImagePath, toApiPath, ensureImagePrompt, DEFAULT_NEGATIVE_PROMPT } from '@/server/storage'
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

    console.log(`[IMAGE ROUTE] project_id=${project_id} provider=${imageConfig.provider} base_url=${imageConfig.base_url} model=${imageConfig.model} size=${imageConfig.default_size || '768x1024'} steps=${imageConfig.steps} cfg=${imageConfig.cfg}`)

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
      console.log(`[IMAGE ROUTE] scene_id=${scene.id} scene_number=${scene.scene_number} typeof image_prompt=${typeof scene.image_prompt} image_prompt_length=${scene.image_prompt?.length ?? 0}`)

      // Build effective image_prompt: use existing if valid, otherwise build fallback
      const effectivePrompt = ensureImagePrompt(scene.image_prompt, scene)

      // If the original prompt was missing, log it and save the fallback to DB
      const wasMissing = !scene.image_prompt || typeof scene.image_prompt !== 'string' || scene.image_prompt.trim().length === 0
      if (wasMissing) {
        console.log(`[IMAGE ROUTE] missing image_prompt, building fallback for scene ${scene.id}`)
      }
      console.log(`[IMAGE ROUTE] final prompt: ${effectivePrompt.substring(0, 200)}${effectivePrompt.length > 200 ? '...' : ''}`)

      // Save the effective prompt back to scene if it was missing
      if (wasMissing) {
        await db.scene.update({
          where: { id: scene.id },
          data: { image_prompt: effectivePrompt },
        })
      }

      // Update status to running
      await db.scene.update({
        where: { id: scene.id },
        data: { image_status: 'running', error_message: null },
      })

      try {
        const outputPath = getImagePath(project_id, scene.id)
        const negativePrompt = scene.negative_prompt || DEFAULT_NEGATIVE_PROMPT

        console.log(`[IMAGE ROUTE] generating scene_id=${scene.id} outputPath=${outputPath}`)

        const result = await generateImage(imageConfig, effectivePrompt, negativePrompt, outputPath, {
          seed: scene.seed || undefined,
          size: project.resolution === '720x1280' ? '768x1024' : '768x1024',
        })

        console.log(`[IMAGE ROUTE] success scene_id=${scene.id} file_path=${result.file_path} seed=${result.seed}`)

        // Update scene with result
        await db.scene.update({
          where: { id: scene.id },
          data: {
            image_path: toApiPath(result.file_path),
            image_status: 'completed',
            error_message: null,
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
            prompt: effectivePrompt,
            seed: result.seed,
            provider: 'zimage',
          },
        })

        results.push({ scene_id: scene.id, status: 'completed', image_path: toApiPath(result.file_path) })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        const stack = err instanceof Error ? err.stack : undefined
        console.error(`[IMAGE ROUTE] FAILED scene_id=${scene.id} error=${message}`)
        if (stack) console.error(stack)

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
    if (allHaveImages && allScenes.length > 0) {
      await db.project.update({ where: { id: project_id }, data: { status: 'images_ready' } })
    }

    return NextResponse.json({ results, errors, scenes: allScenes })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[IMAGE ROUTE] Fatal error:', message)
    return NextResponse.json({ error: message || 'Failed to generate images' }, { status: 500 })
  }
}
