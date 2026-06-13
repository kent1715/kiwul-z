import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProviderConfig, generateImage } from '@/server/providers'
import {
  ensureProjectDirs,
  getImagePath,
  toApiPath,
  ensureImagePrompt,
  DEFAULT_NEGATIVE_PROMPT,
  findNewestPng,
  verifyImageFile,
} from '@/server/storage'
import { existsSync, copyFileSync, mkdirSync, statSync } from 'fs'
import { dirname, join, extname, basename } from 'path'
import type { ImageConfig } from '@/server/providers/provider.types'

/**
 * Sleep helper for delay between batch items.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRetryableImageError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()

  return (
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('bad gateway') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('fetch failed') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('socket hang up') ||
    message.includes('network') ||
    message.includes('aborted')
  )
}

async function withImageRetry<T>(
  sceneId: string,
  fn: () => Promise<T>,
  options?: {
    retries?: number
    delayMs?: number
  }
): Promise<T> {
  const retries = options?.retries ?? Number(process.env.IMAGE_RETRY_MAX || 3)
  const delayMs = options?.delayMs ?? Number(process.env.IMAGE_RETRY_DELAY_MS || 5000)

  let lastError: unknown

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[IMAGE RETRY] scene=${sceneId} attempt=${attempt}/${retries}`)
      return await fn()
    } catch (error) {
      lastError = error
      const message = getErrorMessage(error)

      console.error(`[IMAGE RETRY] scene=${sceneId} attempt=${attempt}/${retries} failed: ${message}`)

      if (!isRetryableImageError(error)) {
        console.error(`[IMAGE RETRY] scene=${sceneId} non-retryable error, stopping retry`)
        throw error
      }

      if (attempt < retries) {
        const waitMs = delayMs * attempt
        console.log(`[IMAGE RETRY] scene=${sceneId} waiting ${waitMs}ms before retry...`)
        await sleep(waitMs)
      }
    }
  }

  throw lastError
}


/**
 * Try to recover a generated image from the output directory or fallback locations.
 * Called when generateImage() throws but the file may already exist on disk.
 * Returns the verified outputPath on success, null on failure.
 */

function getUniqueImagePath(basePath: string): string {
  const ext = extname(basePath) || '.png'
  const dir = dirname(basePath)
  const name = basename(basePath, ext)
  return join(dir, `${name}_${Date.now()}_${Math.floor(Math.random() * 100000)}${ext}`)
}
function tryFallbackImage(
  outputPath: string,
  project_id: string,
  startedAt: number
): string | null {
  // 1. Check if outputPath already exists and is valid
  if (verifyImageFile(outputPath)) {
    console.log(`[IMAGE ROUTE] fallback: outputPath already valid: ${outputPath}`)
    return outputPath
  }

  // 2. Search for newest PNG in the images output folder
  const imagesDir = join(process.cwd(), 'outputs', 'projects', project_id, 'images')
  const found = findNewestPng(imagesDir, startedAt)
  if (found) {
    console.log(`[IMAGE ROUTE] fallback newest image: ${found}`)
    try {
      mkdirSync(dirname(outputPath), { recursive: true })
      copyFileSync(found, outputPath)
      if (verifyImageFile(outputPath)) {
        console.log(`[IMAGE ROUTE] fallback copied successfully: ${outputPath}`)
        return outputPath
      }
      console.log(`[IMAGE ROUTE] fallback copy exists but too small, skipping`)
    } catch (err) {
      console.log(`[IMAGE ROUTE] fallback copy failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  return null
}

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

    const batchDelayMs = Number(process.env.IMAGE_BATCH_DELAY_MS || 1500)

    // â”€â”€ Get scenes to generate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    console.log(`[IMAGE BATCH] scenes count: ${scenes.length}`)
    console.log(`[IMAGE BATCH] provider: ${imageConfig.provider} base_url: ${imageConfig.base_url} model: ${imageConfig.model} batch_delay: ${batchDelayMs}ms`)

    const completed: Array<{ scene_id: string; image_path: string }> = []
    const failed: Array<{ scene_id: string; error: string }> = []
    const skipped: Array<{ scene_id: string; reason: string }> = []

    // â”€â”€ Sequential processing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    for (let idx = 0; idx < scenes.length; idx++) {
      const scene = scenes[idx]
      console.log(`[IMAGE BATCH] processing scene ${idx + 1}/${scenes.length}`)

      // Build effective image_prompt
      const effectivePrompt = ensureImagePrompt(scene.image_prompt, scene)
      const wasMissing = !scene.image_prompt || typeof scene.image_prompt !== 'string' || scene.image_prompt.trim().length === 0

      if (wasMissing) {
        console.log(`[IMAGE ROUTE] missing image_prompt, building fallback for scene ${scene.id}`)
      }
      console.log(`[IMAGE ROUTE] sceneId: ${scene.id}`)
      console.log(`[IMAGE ROUTE] final prompt: ${effectivePrompt.substring(0, 200)}${effectivePrompt.length > 200 ? '...' : ''}`)

      // Save the effective prompt back to scene if it was missing
      if (wasMissing) {
        await db.scene.update({
          where: { id: scene.id },
          data: { image_prompt: effectivePrompt },
        })
      }

      const startedAt = Date.now()
      const outputPath = getUniqueImagePath(getImagePath(project_id, scene.id))
      console.log(`[IMAGE ROUTE] startedAt: ${new Date(startedAt).toISOString()}`)
      console.log(`[IMAGE ROUTE] outputPath: ${outputPath}`)

      // Set status to running and lock
      await db.scene.update({
        where: { id: scene.id },
        data: { image_status: 'running', error_message: null, locked: true, image_path: null },
      })

      try {
        const negativePrompt = scene.negative_prompt || DEFAULT_NEGATIVE_PROMPT

        
        const seedForGeneration = Math.floor(Math.random() * 2147483647)
        console.log('[IMAGE ROUTE] seedForGeneration:', seedForGeneration)
        
        const isRegenerate = !!scene.image_path || scene.image_status === 'completed'
        const promptForGeneration = isRegenerate
          ? `${effectivePrompt}

Fresh regenerate variation:
Create a new visual interpretation of the same scene.
Keep the same subject and story meaning, but change composition, pose, camera angle, framing, lighting details, background arrangement, and micro details.
Do not copy the previous image.
Variation seed: ${seedForGeneration}.`
          : effectivePrompt

        console.log(`[IMAGE ROUTE] isRegenerate: ${isRegenerate}`)
        console.log(`[IMAGE ROUTE] promptForGeneration: ${promptForGeneration.substring(0, 240)}${promptForGeneration.length > 240 ? '...' : ''}`)
        const result = await withImageRetry(
          scene.id,
          () =>
            generateImage(imageConfig, promptForGeneration, negativePrompt, outputPath, {
              seed: seedForGeneration,
              size: project.resolution === '720x1280' ? '768x1024' : '768x1024',
            }),
          {
            retries: Number(process.env.IMAGE_RETRY_MAX || 3),
            delayMs: Number(process.env.IMAGE_RETRY_DELAY_MS || 5000),
          }
        )

        console.log(`[IMAGE ROUTE] provider result: file_path=${result.file_path} seed=${result.seed}`)

        // Verify output file
        if (!verifyImageFile(result.file_path)) {
          throw new Error(`Output image file missing or too small: ${result.file_path}`)
        }

        // Mark completed
        await db.scene.update({
          where: { id: scene.id },
          data: {
            image_path: toApiPath(result.file_path),
            image_status: 'completed',
            error_message: null,
            locked: false,
            seed: result.seed || seedForGeneration,
          },
        })

        // Create asset record
        await db.asset.create({
          data: {
            project_id,
            type: 'image',
            scene_id: scene.id,
            file_path: result.file_path,
            prompt: promptForGeneration,
            seed: result.seed || seedForGeneration,
            provider: 'zimage',
          },
        })

        console.log(`[IMAGE ROUTE] completed: scene ${scene.id} in ${Date.now() - startedAt}ms`)
        completed.push({ scene_id: scene.id, image_path: toApiPath(result.file_path) })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[IMAGE ROUTE] error for scene ${scene.id}: ${message}`)

        // â”€â”€ Fallback: check if image was actually created despite the error â”€â”€
        console.log(`[IMAGE ROUTE] checking fallback for scene ${scene.id}...`)
        const fallbackPath = tryFallbackImage(outputPath, project_id, startedAt)

        if (fallbackPath && verifyImageFile(fallbackPath)) {
          const sz = statSync(fallbackPath).size
          console.log(`[IMAGE ROUTE] fallback newest image recovered: ${fallbackPath} (${sz} bytes)`)

          await db.scene.update({
            where: { id: scene.id },
            data: {
              image_path: toApiPath(fallbackPath),
              image_status: 'completed',
              error_message: null,
              locked: false,
            },
          })

          await db.asset.create({
            data: {
              project_id,
              type: 'image',
              scene_id: scene.id,
              file_path: fallbackPath,
              prompt: effectivePrompt,
              provider: 'zimage',
            },
          })

          console.log(`[IMAGE ROUTE] completed (via fallback): scene ${scene.id}`)
          completed.push({ scene_id: scene.id, image_path: toApiPath(fallbackPath) })
        } else {
          // â”€â”€ Truly failed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          console.error(`[IMAGE ROUTE] failed: scene ${scene.id} â€” ${message}`)
          await db.scene.update({
            where: { id: scene.id },
            data: { image_status: 'failed', error_message: message, locked: false },
          })
          failed.push({ scene_id: scene.id, error: message })
        }
      }

      // â”€â”€ Delay between scenes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (idx < scenes.length - 1 && batchDelayMs > 0) {
        console.log(`[IMAGE BATCH] waiting ${batchDelayMs}ms before next scene...`)
        await sleep(batchDelayMs)
      }
    }

    // â”€â”€ Update project status if all scenes done â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const allScenes = await db.scene.findMany({ where: { project_id } })
    const allHaveImages = allScenes.every((s) => s.image_status === 'completed')
    if (allHaveImages && allScenes.length > 0) {
      await db.project.update({ where: { id: project_id }, data: { status: 'images_ready' } })
    }

    console.log(`[IMAGE BATCH] done â€” completed: ${completed.length}, failed: ${failed.length}, skipped: ${skipped.length}`)

    return NextResponse.json({ completed, failed, skipped })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[IMAGE ROUTE] Fatal error:', message)
    return NextResponse.json({ error: message || 'Failed to generate images' }, { status: 500 })
  }
}






