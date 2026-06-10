import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProviderConfig, generateVideo } from '@/server/providers'
import { ensureProjectDirs, getVideoPath, toApiPath, fromApiPath } from '@/server/storage'
import type { VideoConfig } from '@/server/providers/provider.types'

export async function POST(request: NextRequest) {
  let sceneId: string | undefined

  try {
    const body = await request.json()
    sceneId = body.sceneId || body.scene_id
    const project_id = body.project_id

    console.log('[VIDEO ROUTE] body:', JSON.stringify(body))
    console.log('[VIDEO ROUTE] sceneId:', sceneId)

    if (!sceneId) {
      return NextResponse.json(
        { success: false, error: 'sceneId is required' },
        { status: 400 }
      )
    }

    const scene = await db.scene.findUnique({ where: { id: sceneId } })

    if (!scene) {
      return NextResponse.json(
        { success: false, error: `Scene not found: ${sceneId}` },
        { status: 404 }
      )
    }

    if (!scene.image_path || typeof scene.image_path !== 'string') {
      await db.scene.update({
        where: { id: sceneId },
        data: {
          video_status: 'failed',
          error_message: 'Scene image_path is required before video generation',
          locked: false,
        },
      })

      return NextResponse.json(
        { success: false, error: 'Scene image_path is required before video generation' },
        { status: 400 }
      )
    }

    // Ensure project directories exist
    ensureProjectDirs(scene.project_id)

    const videoConfig = await getProviderConfig<VideoConfig>('video')
    if (!videoConfig || !videoConfig.enabled) {
      return NextResponse.json(
        { success: false, error: 'No active video provider. Configure LTX/ComfyUI in Provider Settings.' },
        { status: 400 }
      )
    }

    const motionPrompt =
      typeof scene.motion_prompt === 'string' && scene.motion_prompt.trim()
        ? scene.motion_prompt.trim()
        : 'subtle camera push-in, stable composition, no morphing'

    // Set status to running and lock the scene
    await db.scene.update({
      where: { id: sceneId },
      data: {
        video_status: 'running',
        error_message: null,
        locked: true,
      },
    })

    console.log('[VIDEO ROUTE] calling generateVideo...')

    const imagePath = fromApiPath(scene.image_path)
    const outputPath = getVideoPath(scene.project_id, scene.id)

    const result = await generateVideo(videoConfig, imagePath, motionPrompt, outputPath, {
      duration: scene.duration || 3,
    })

    console.log('[VIDEO ROUTE] generateVideo result:', JSON.stringify(result))

    if (!result?.file_path) {
      throw new Error('generateVideo completed but did not return file_path')
    }

    const apiPath = toApiPath(result.file_path)

    const updated = await db.scene.update({
      where: { id: sceneId },
      data: {
        video_status: 'completed',
        video_path: apiPath,
        error_message: null,
        locked: false,
      },
    })

    // Create asset record
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

    // Check if all scenes have videos
    if (project_id) {
      const allScenes = await db.scene.findMany({ where: { project_id: scene.project_id } })
      const allHaveVideos = allScenes.every((s) => s.video_status === 'completed')
      if (allHaveVideos && allScenes.length > 0) {
        await db.project.update({ where: { id: scene.project_id }, data: { status: 'videos_ready' } })
      }
    }

    return NextResponse.json({
      success: true,
      scene: updated,
      video_path: apiPath,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[VIDEO ROUTE] error:', error)

    if (sceneId) {
      await db.scene.update({
        where: { id: sceneId },
        data: {
          video_status: 'failed',
          error_message: message,
          locked: false,
        },
      }).catch((dbError) => {
        console.error('[VIDEO ROUTE] failed to update failed status:', dbError)
      })
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
