import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProviderConfig, generateVideo } from '@/server/providers'
import { ensureProjectDirs, getVideoPath, toApiPath, fromApiPath } from '@/server/storage'
import { dirname, join, extname, basename } from 'path'
import type { VideoConfig } from '@/server/providers/provider.types'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRetryableVideoError(error: unknown): boolean {
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

async function withVideoRetry<T>(
  sceneId: string,
  fn: () => Promise<T>,
  options?: {
    retries?: number
    delayMs?: number
  }
): Promise<T> {
  const retries = options?.retries ?? Number(process.env.VIDEO_RETRY_MAX || 2)
  const delayMs = options?.delayMs ?? Number(process.env.VIDEO_RETRY_DELAY_MS || 10000)

  let lastError: unknown

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[VIDEO RETRY] scene=${sceneId} attempt=${attempt}/${retries}`)
      return await fn()
    } catch (error) {
      lastError = error
      const message = getErrorMessage(error)

      console.error(`[VIDEO RETRY] scene=${sceneId} attempt=${attempt}/${retries} failed: ${message}`)

      if (!isRetryableVideoError(error)) {
        console.error(`[VIDEO RETRY] scene=${sceneId} non-retryable error, stopping retry`)
        throw error
      }

      if (attempt < retries) {
        const waitMs = delayMs * attempt
        console.log(`[VIDEO RETRY] scene=${sceneId} waiting ${waitMs}ms before retry...`)
        await sleep(waitMs)
      }
    }
  }

  throw lastError
}

function getUniqueVideoPath(basePath: string): string {
  const ext = extname(basePath) || '.mp4'
  const dir = dirname(basePath)
  const name = basename(basePath, ext)
  return join(dir, `${name}_${Date.now()}_${Math.floor(Math.random() * 100000)}${ext}`)
}

function buildFallbackMotionPrompt(): string {
  return [
    'Create natural cinematic image-to-video motion for this exact image.',
    'Animate only elements already visible in the image.',
    'Use a slow subtle camera push-in or gentle parallax if appropriate.',
    'Keep the main subject identity, object shape, background, lighting, colors, camera angle, and composition stable.',
    'No new objects, no morphing, no stretching, no melting, no swelling, no warping, no flicker.'
  ].join(' ')
}

async function generateVideoForScene(scene: any, videoConfig: VideoConfig) {
  if (!scene.image_path || typeof scene.image_path !== 'string') {
    throw new Error('Scene image_path is required before video generation')
  }

  ensureProjectDirs(scene.project_id)

  const motionPrompt =
    typeof scene.motion_prompt === 'string' && scene.motion_prompt.trim()
      ? scene.motion_prompt.trim()
      : buildFallbackMotionPrompt()

  await db.scene.update({
    where: { id: scene.id },
    data: {
      video_status: 'running',
      error_message: null,
      locked: true,
    },
  })

  const imagePath = fromApiPath(scene.image_path)
  const outputPath = getUniqueVideoPath(getVideoPath(scene.project_id, scene.id))

  console.log('[VIDEO ROUTE] scene:', scene.id)
  console.log('[VIDEO ROUTE] imagePath:', imagePath)
  console.log('[VIDEO ROUTE] outputPath:', outputPath)
  console.log('[VIDEO ROUTE] motionPrompt:', motionPrompt.substring(0, 300))

  const result = await withVideoRetry(
    scene.id,
    () =>
      generateVideo(videoConfig, imagePath, motionPrompt, outputPath, {
        duration: scene.duration || 3,
      }),
    {
      retries: Number(process.env.VIDEO_RETRY_MAX || 2),
      delayMs: Number(process.env.VIDEO_RETRY_DELAY_MS || 10000),
    }
  )

  console.log('[VIDEO ROUTE] generateVideo result:', JSON.stringify(result))

  if (!result?.file_path) {
    throw new Error('generateVideo completed but did not return file_path')
  }

  const apiPath = toApiPath(result.file_path)

  const updated = await db.scene.update({
    where: { id: scene.id },
    data: {
      video_status: 'completed',
      video_path: apiPath,
      error_message: null,
      locked: false,
    },
  })

  await db.asset.create({
    data: {
      project_id: scene.project_id,
      type: 'video',
      scene_id: scene.id,
      file_path: result.file_path,
      prompt: motionPrompt,
      provider: 'ltx',
    },
  })

  return {
    scene_id: scene.id,
    video_path: apiPath,
    scene: updated,
  }
}

export async function POST(request: NextRequest) {
  const completed: Array<{ scene_id: string; video_path: string }> = []
  const failed: Array<{ scene_id: string; error: string }> = []
  const skipped: Array<{ scene_id: string; reason: string }> = []

  try {
    const body = await request.json()
    const sceneId = body.sceneId || body.scene_id
    const project_id = body.project_id
    const force = Boolean(body.force || body.regenerate)

    console.log('[VIDEO ROUTE] body:', JSON.stringify(body))
    console.log('[VIDEO ROUTE] sceneId:', sceneId)
    console.log('[VIDEO ROUTE] project_id:', project_id)
    console.log('[VIDEO ROUTE] force:', force)

    const videoConfig = await getProviderConfig<VideoConfig>('video')
    if (!videoConfig || !videoConfig.enabled) {
      return NextResponse.json(
        { success: false, error: 'No active video provider. Configure LTX/ComfyUI in Provider Settings.' },
        { status: 400 }
      )
    }

    let scenes: any[] = []

    if (sceneId) {
      const scene = await db.scene.findUnique({ where: { id: sceneId } })

      if (!scene) {
        return NextResponse.json(
          { success: false, error: `Scene not found: ${sceneId}` },
          { status: 404 }
        )
      }

      scenes = [scene]
    } else {
      if (!project_id) {
        return NextResponse.json(
          { success: false, error: 'project_id or sceneId is required' },
          { status: 400 }
        )
      }

      scenes = await db.scene.findMany({
        where: {
          project_id,
          locked: false,
          image_status: 'completed',
          image_path: { not: null },
          ...(force
            ? {}
            : {
                video_status: {
                  in: ['pending', 'failed'],
                },
              }),
        },
        orderBy: { scene_number: 'asc' },
      })
    }

    if (!scenes.length) {
      return NextResponse.json({
        success: true,
        completed,
        failed,
        skipped,
        message: 'No scenes need video generation',
      })
    }

    console.log(`[VIDEO ROUTE] scenes count: ${scenes.length}`)

    for (let idx = 0; idx < scenes.length; idx++) {
      const scene = scenes[idx]

      if (scene.locked) {
        skipped.push({ scene_id: scene.id, reason: 'Scene is locked' })
        continue
      }

      if (scene.image_status !== 'completed' || !scene.image_path) {
        skipped.push({ scene_id: scene.id, reason: 'Scene image is not ready' })
        continue
      }

      try {
        const result = await generateVideoForScene(scene, videoConfig)
        completed.push({
          scene_id: result.scene_id,
          video_path: result.video_path,
        })
      } catch (error: unknown) {
        const message = getErrorMessage(error)
        console.error(`[VIDEO ROUTE] failed scene ${scene.id}:`, error)

        await db.scene.update({
          where: { id: scene.id },
          data: {
            video_status: 'failed',
            error_message: message,
            locked: false,
          },
        }).catch((dbError) => {
          console.error('[VIDEO ROUTE] failed to update failed status:', dbError)
        })

        failed.push({ scene_id: scene.id, error: message })
      }

      const batchDelayMs = Number(process.env.VIDEO_BATCH_DELAY_MS || 1500)
      if (idx < scenes.length - 1 && batchDelayMs > 0) {
        console.log(`[VIDEO ROUTE] waiting ${batchDelayMs}ms before next scene...`)
        await sleep(batchDelayMs)
      }
    }

    const projectIdForStatus = project_id || scenes[0]?.project_id
    if (projectIdForStatus) {
      const allScenes = await db.scene.findMany({ where: { project_id: projectIdForStatus } })
      const allHaveVideos = allScenes.every((s) => s.video_status === 'completed')
      if (allHaveVideos && allScenes.length > 0) {
        await db.project.update({ where: { id: projectIdForStatus }, data: { status: 'videos_ready' } })
      }
    }

    console.log(`[VIDEO ROUTE] done — completed: ${completed.length}, failed: ${failed.length}, skipped: ${skipped.length}`)

    return NextResponse.json({
      success: failed.length === 0,
      completed,
      failed,
      skipped,
    })
  } catch (error: unknown) {
    const message = getErrorMessage(error)
    console.error('[VIDEO ROUTE] fatal error:', error)

    return NextResponse.json(
      { success: false, error: message, completed, failed, skipped },
      { status: 500 }
    )
  }
}
