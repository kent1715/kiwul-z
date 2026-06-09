import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProviderConfig, render as renderFFmpeg } from '@/server/providers'
import { ensureProjectDirs, getFinalVideoPath, toApiPath, writeSRTFile } from '@/server/storage'
import { existsSync } from 'fs'
import type { RenderConfig } from '@/server/providers/provider.types'

export async function POST(request: NextRequest) {
  try {
    const { project_id } = await request.json()
    if (!project_id) return NextResponse.json({ error: 'project_id is required' }, { status: 400 })

    const project = await db.project.findUnique({ where: { id: project_id } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    ensureProjectDirs(project_id)

    const renderConfig = await getProviderConfig<RenderConfig>('render')
    if (!renderConfig || !renderConfig.enabled) {
      return NextResponse.json(
        { error: 'No active render provider. FFmpeg must be available.' },
        { status: 400 }
      )
    }

    const scenes = await db.scene.findMany({
      where: { project_id },
      orderBy: { scene_number: 'asc' },
    })

    if (!scenes.length) return NextResponse.json({ error: 'No scenes found' }, { status: 400 })

    // Check readiness
    const scenesWithVideo = scenes.filter((s) => s.video_status === 'completed' && s.video_path)
    if (!scenesWithVideo.length) {
      return NextResponse.json(
        { error: 'No scenes with completed videos. Generate videos first.' },
        { status: 400 }
      )
    }

    // Convert API paths to filesystem paths and prepare scene data
    const renderScenes = scenesWithVideo.map((scene) => ({
      video_path: scene.video_path!.startsWith('/api/assets/')
        ? scene.video_path!.replace('/api/assets/', `${process.cwd()}/outputs/`)
        : scene.video_path!,
      audio_path: scene.audio_path?.startsWith('/api/assets/')
        ? scene.audio_path.replace('/api/assets/', `${process.cwd()}/outputs/`)
        : scene.audio_path || undefined,
      subtitle_path: scene.subtitle_path || undefined,
      duration: scene.duration,
    }))

    // Check video files exist
    for (const rs of renderScenes) {
      if (!existsSync(rs.video_path)) {
        return NextResponse.json(
          {
            error: `Video file not found: ${rs.video_path}. Make sure all videos are generated.`,
          },
          { status: 400 }
        )
      }
    }

    // Write SRT subtitles
    const srtPath = writeSRTFile(project_id, scenes)

    const outputPath = getFinalVideoPath(project_id)

    const result = await renderFFmpeg(renderConfig, renderScenes, outputPath, {
      subtitles_path: srtPath,
      resolution: project.resolution,
    })

    // Update project with final video
    await db.project.update({
      where: { id: project_id },
      data: {
        final_video_path: toApiPath(result.file_path),
        status: 'rendered',
      },
    })

    // Create final asset
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
        }),
      },
    })

    return NextResponse.json({
      success: true,
      final_video_path: toApiPath(result.file_path),
      duration: result.duration,
      file_size: result.file_size,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error rendering:', message)
    return NextResponse.json({ error: message || 'Failed to render video' }, { status: 500 })
  }
}
