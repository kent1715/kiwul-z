import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProviderConfig, generateVideo } from '@/server/providers'
import { ensureProjectDirs, getVideoPath, toApiPath } from '@/server/storage'
import type { VideoConfig } from '@/server/providers/provider.types'

export async function POST(request: NextRequest) {
  try {
    const { project_id, sceneId } = await request.json()
    if (!project_id) return NextResponse.json({ error: 'project_id is required' }, { status: 400 })

    const project = await db.project.findUnique({ where: { id: project_id } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    ensureProjectDirs(project_id)

    const videoConfig = await getProviderConfig<VideoConfig>('video')
    if (!videoConfig || !videoConfig.enabled) {
      return NextResponse.json(
        { error: 'No active video provider. Configure LTX/ComfyUI in Provider Settings.' },
        { status: 400 }
      )
    }

    let scenes
    if (sceneId) {
      const scene = await db.scene.findUnique({ where: { id: sceneId } })
      if (!scene) return NextResponse.json({ error: 'Scene not found' }, { status: 404 })
      if (scene.locked) return NextResponse.json({ error: 'Scene is locked' }, { status: 400 })
      if (!scene.image_path)
        return NextResponse.json({ error: 'Scene has no image. Generate image first.' }, { status: 400 })
      scenes = [scene]
    } else {
      // Only generate videos for scenes that have completed images
      scenes = await db.scene.findMany({
        where: { project_id, locked: false, image_status: 'completed' },
        orderBy: { scene_number: 'asc' },
      })
    }

    if (!scenes.length)
      return NextResponse.json({ error: 'No scenes ready for video generation' }, { status: 400 })

    const results = []
    const errors = []

    for (const scene of scenes) {
      // Convert API path back to filesystem path
      const imagePath = scene.image_path?.startsWith('/api/assets/')
        ? scene.image_path.replace('/api/assets/', `${process.cwd()}/outputs/`)
        : scene.image_path

      if (!imagePath) {
        errors.push({ scene_id: scene.id, error: 'No image path available' })
        continue
      }

      await db.scene.update({
        where: { id: scene.id },
        data: { video_status: 'running', error_message: null },
      })

      try {
        const outputPath = getVideoPath(project_id, scene.id)
        const motionPrompt =
          scene.motion_prompt ||
          'subtle camera push-in, natural breathing motion, slight head movement, stable anatomy, consistent identity, no scene change, no morphing, no distortion'

        const result = await generateVideo(videoConfig, imagePath, motionPrompt, outputPath, {
          duration: scene.duration || 3,
        })

        await db.scene.update({
          where: { id: scene.id },
          data: {
            video_path: toApiPath(result.file_path),
            video_status: 'completed',
          },
        })

        await db.asset.create({
          data: {
            project_id,
            type: 'video',
            scene_id: scene.id,
            file_path: result.file_path,
            prompt: motionPrompt,
            provider: 'ltx',
          },
        })

        results.push({ scene_id: scene.id, status: 'completed', video_path: toApiPath(result.file_path) })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        await db.scene.update({
          where: { id: scene.id },
          data: { video_status: 'failed', error_message: message },
        })
        errors.push({ scene_id: scene.id, error: message })
      }
    }

    const allScenes = await db.scene.findMany({ where: { project_id } })
    const allHaveVideos = allScenes.every((s) => s.video_status === 'completed')
    if (allHaveVideos && allScenes.length > 0) {
      await db.project.update({ where: { id: project_id }, data: { status: 'videos_ready' } })
    }

    return NextResponse.json({ results, errors, scenes: allScenes })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error generating videos:', message)
    return NextResponse.json({ error: message || 'Failed to generate videos' }, { status: 500 })
  }
}
