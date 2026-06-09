import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const project = await db.project.findUnique({ where: { id } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const scenes = await db.scene.findMany({ where: { project_id: id } })
    const characters = await db.character.findMany({ where: { project_id: id } })
    const locations = await db.location.findMany({ where: { project_id: id } })

    const checks: Array<{ type: string; status: string; message: string }> = []
    const warnings: Array<{ type: string; message: string }> = []
    const errors: Array<{ type: string; message: string }> = []

    // Scene count check
    if (scenes.length === 0) {
      errors.push({ type: 'no_scenes', message: 'No scenes generated' })
    } else {
      checks.push({ type: 'scene_count', status: 'pass', message: `${scenes.length} scenes generated` })
    }

    // Duration check
    const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0)
    if (totalDuration < project.duration_seconds * 0.8) {
      warnings.push({
        type: 'duration_short',
        message: `Total duration ${totalDuration}s is less than target ${project.duration_seconds}s`,
      })
    } else if (totalDuration > project.duration_seconds * 1.2) {
      warnings.push({
        type: 'duration_long',
        message: `Total duration ${totalDuration}s exceeds target ${project.duration_seconds}s`,
      })
    } else {
      checks.push({
        type: 'duration',
        status: 'pass',
        message: `Duration ${totalDuration}s matches target ${project.duration_seconds}s`,
      })
    }

    // Image prompt check
    const scenesWithoutImagePrompt = scenes.filter((s) => !s.image_prompt)
    if (scenesWithoutImagePrompt.length > 0) {
      warnings.push({
        type: 'missing_image_prompts',
        message: `${scenesWithoutImagePrompt.length} scenes missing image_prompt`,
      })
    }

    // Motion prompt check
    const scenesWithoutMotionPrompt = scenes.filter((s) => !s.motion_prompt)
    if (scenesWithoutMotionPrompt.length > 0) {
      warnings.push({
        type: 'missing_motion_prompts',
        message: `${scenesWithoutMotionPrompt.length} scenes missing motion_prompt`,
      })
    }

    // VO length check
    const scenesWithLongVO = scenes.filter(
      (s) => s.vo && s.vo.split(/\s+/).length > s.duration * 3
    )
    if (scenesWithLongVO.length > 0) {
      warnings.push({
        type: 'long_vo',
        message: `${scenesWithLongVO.length} scenes have VO text too long for their duration`,
      })
    }

    // Asset status checks
    const scenesWithFailedImage = scenes.filter((s) => s.image_status === 'failed')
    const scenesWithFailedVideo = scenes.filter((s) => s.video_status === 'failed')
    const scenesWithFailedTTS = scenes.filter((s) => s.tts_status === 'failed')

    if (scenesWithFailedImage.length > 0)
      errors.push({
        type: 'failed_images',
        message: `${scenesWithFailedImage.length} scenes have failed image generation`,
      })
    if (scenesWithFailedVideo.length > 0)
      errors.push({
        type: 'failed_videos',
        message: `${scenesWithFailedVideo.length} scenes have failed video generation`,
      })
    if (scenesWithFailedTTS.length > 0)
      errors.push({
        type: 'failed_tts',
        message: `${scenesWithFailedTTS.length} scenes have failed TTS generation`,
      })

    // Character consistency check
    if (characters.length === 0) {
      warnings.push({ type: 'no_characters', message: 'No characters defined' })
    }

    // Location consistency check
    if (locations.length === 0) {
      warnings.push({ type: 'no_locations', message: 'No locations defined' })
    }

    // Missing assets check
    const scenesMissingImage = scenes.filter((s) => s.image_status === 'pending')
    const scenesMissingVideo = scenes.filter(
      (s) => s.video_status === 'pending' && s.image_status === 'completed'
    )
    const scenesMissingTTS = scenes.filter((s) => s.tts_status === 'pending' && s.vo)

    // Overall score
    const totalChecks = 5 + scenes.length * 3
    const passedChecks =
      checks.length +
      scenes.filter((s) => s.image_status === 'completed').length +
      scenes.filter((s) => s.video_status === 'completed').length +
      scenes.filter((s) => s.tts_status === 'completed').length
    const score = Math.round((passedChecks / totalChecks) * 100)

    return NextResponse.json({
      score,
      checks,
      warnings,
      errors,
      summary: {
        total_scenes: scenes.length,
        images_completed: scenes.filter((s) => s.image_status === 'completed').length,
        images_failed: scenesWithFailedImage.length,
        images_pending: scenesMissingImage.length,
        videos_completed: scenes.filter((s) => s.video_status === 'completed').length,
        videos_failed: scenesWithFailedVideo.length,
        videos_pending: scenesMissingVideo.length,
        tts_completed: scenes.filter((s) => s.tts_status === 'completed').length,
        tts_failed: scenesWithFailedTTS.length,
        tts_pending: scenesMissingTTS.length,
        characters: characters.length,
        locations: locations.length,
        total_duration: totalDuration,
        target_duration: project.duration_seconds,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
