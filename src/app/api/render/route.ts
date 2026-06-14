import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProviderConfig, render as renderFFmpeg } from '@/server/providers'
import { ensureProjectDirs, getFinalVideoPath, toApiPath, fromApiPath, writeSRTFile } from '@/server/storage'
import { existsSync } from 'fs'
import type { RenderConfig } from '@/server/providers/provider.types'

type TimelineClip = {
  scene_id?: string
  scene_number?: number
  start?: number
  end?: number
  offset?: number
  volume?: number
  text?: string
  src?: string
  duration?: number
}

type TimelinePayload = {
  duration?: number
  music?: {
    file_name?: string
    volume?: number
    fade_in?: number
    fade_out?: number
  }
  tracks?: {
    video?: TimelineClip[]
    voice?: TimelineClip[]
    subtitles?: TimelineClip[]
  }
}

function parseTimeline(value: unknown): TimelinePayload | null {
  if (!value) return null

  if (typeof value === 'object') {
    return value as TimelinePayload
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object') {
        return parsed as TimelinePayload
      }
    } catch {
      return null
    }
  }

  return null
}

function findTimelineClip(
  clips: TimelineClip[] | undefined,
  sceneId: string,
  sceneNumber: number
): TimelineClip | null {
  if (!Array.isArray(clips)) return null

  return (
    clips.find((clip) => clip.scene_id === sceneId) ||
    clips.find((clip) => Number(clip.scene_number) === Number(sceneNumber)) ||
    null
  )
}

function numberOrFallback(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const project_id = body.project_id as string | undefined

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    const project = await db.project.findUnique({
      where: { id: project_id },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    ensureProjectDirs(project_id)

    const renderConfig = await getProviderConfig<RenderConfig>('render')
    if (!renderConfig || !renderConfig.enabled) {
      return NextResponse.json(
        { error: 'No active render provider. FFmpeg must be available.' },
        { status: 400 }
      )
    }

    const requestTimeline = parseTimeline(body.timeline)
    const savedTimeline = parseTimeline((project as { timeline_json?: string }).timeline_json)
    const timeline = requestTimeline || savedTimeline

    const scenes = await db.scene.findMany({
      where: { project_id },
      orderBy: { scene_number: 'asc' },
    })

    if (!scenes.length) {
      return NextResponse.json({ error: 'No scenes found' }, { status: 400 })
    }

    const scenesWithVideo = scenes.filter((scene) => {
      return scene.video_status === 'completed' && Boolean(scene.video_path)
    })

    if (!scenesWithVideo.length) {
      return NextResponse.json(
        { error: 'No scenes with completed videos. Generate videos first.' },
        { status: 400 }
      )
    }

    const voiceClips = timeline?.tracks?.voice || []
    const subtitleClips = timeline?.tracks?.subtitles || []

    const renderScenes = scenesWithVideo.map((scene) => {
      const voiceClip = findTimelineClip(voiceClips, scene.id, scene.scene_number)

      return {
        video_path: fromApiPath(scene.video_path!),
        audio_path: scene.audio_path ? fromApiPath(scene.audio_path) : undefined,
        subtitle_path: scene.subtitle_path || undefined,
        duration: scene.duration,
        audio_offset: numberOrFallback(voiceClip?.offset, 0),
        audio_volume: numberOrFallback(voiceClip?.volume, 1),
      }
    })

    for (const renderScene of renderScenes) {
      if (!existsSync(renderScene.video_path)) {
        return NextResponse.json(
          {
            error: `Video file not found: ${renderScene.video_path}. Make sure all videos are generated.`,
          },
          { status: 400 }
        )
      }
    }

    const subtitleSource =
      subtitleClips.length > 0
        ? subtitleClips
            .filter((clip) => String(clip.text || '').trim().length > 0)
            .map((clip, index) => ({
              scene_number: numberOrFallback(clip.scene_number, index + 1),
              vo: String(clip.text || '').trim(),
              start_time: numberOrFallback(clip.start, 0),
              end_time: numberOrFallback(clip.end, numberOrFallback(clip.start, 0) + 3),
            }))
        : scenes.map((scene) => ({
            scene_number: scene.scene_number,
            vo: scene.vo || undefined,
            start_time: scene.start_time,
            end_time: scene.end_time,
          }))

    const srtPath = writeSRTFile(project_id, subtitleSource)
    const outputPath = getFinalVideoPath(project_id)

    const result = await renderFFmpeg(renderConfig, renderScenes, outputPath, {
      subtitles_path: srtPath,
      resolution: project.resolution,
    })

    const updateData: Record<string, unknown> = {
      final_video_path: toApiPath(result.file_path),
      status: 'rendered',
    }

    if (timeline) {
      updateData.timeline_json = JSON.stringify(timeline)
    }

    await db.project.update({
      where: { id: project_id },
      data: updateData as never,
    })

    await db.asset.create({
      data: {
        project_id,
        type: 'final',
        file_path: result.file_path,
        provider: 'ffmpeg',
        metadata: JSON.stringify({
          duration: result.duration,
          file_size: result.file_size,
          scene_count: scenesWithVideo.length,
          used_timeline: Boolean(timeline),
        }),
      },
    })

    return NextResponse.json({
      success: true,
      final_video_path: toApiPath(result.file_path),
      duration: result.duration,
      file_size: result.file_size,
      scene_count: scenesWithVideo.length,
      used_timeline: Boolean(timeline),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error rendering:', message)
    return NextResponse.json({ error: message || 'Failed to render video' }, { status: 500 })
  }
}
