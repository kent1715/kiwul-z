import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProviderConfig, generateEdgeTTS, generateF5TTS } from '@/server/providers'
import { ensureProjectDirs, getAudioPath, toApiPath } from '@/server/storage'
import type { TTSConfig } from '@/server/providers/provider.types'

export async function POST(request: NextRequest) {
  try {
    const { project_id, sceneId, speed } = await request.json()
    if (!project_id) return NextResponse.json({ error: 'project_id is required' }, { status: 400 })

    const project = await db.project.findUnique({ where: { id: project_id } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    ensureProjectDirs(project_id)

    const ttsConfig = await getProviderConfig<TTSConfig>('tts')
    if (!ttsConfig || !ttsConfig.enabled) {
      return NextResponse.json(
        { error: 'No active TTS provider. Configure Edge-TTS or F5-TTS in Provider Settings.' },
        { status: 400 }
      )
    }

    let scenes
    if (sceneId) {
      const scene = await db.scene.findUnique({ where: { id: sceneId } })
      if (!scene) return NextResponse.json({ error: 'Scene not found' }, { status: 404 })
      if (!scene.vo) return NextResponse.json({ error: 'Scene has no voice-over text' }, { status: 400 })
      scenes = [scene]
    } else {
      scenes = await db.scene.findMany({
        where: { project_id, vo: { not: null } },
        orderBy: { scene_number: 'asc' },
      })
    }

    if (!scenes.length) return NextResponse.json({ error: 'No scenes with VO text' }, { status: 400 })

    const results = []
    const errors = []

    for (const scene of scenes) {
      if (!scene.vo) continue

      await db.scene.update({
        where: { id: scene.id },
        data: { tts_status: 'running', error_message: null },
      })

      try {
        const outputPath = getAudioPath(project_id, scene.id)
        const ttsSpeed = speed || ttsConfig.speed || 1.0

        let result
        if (ttsConfig.provider === 'f5tts' && ttsConfig.base_url) {
          try {
            result = await generateF5TTS(ttsConfig, scene.vo, outputPath, { speed: ttsSpeed })
          } catch (f5err: unknown) {
            // Fallback to Edge-TTS
            const f5Message = f5err instanceof Error ? f5err.message : String(f5err)
            console.warn(`F5-TTS failed, falling back to Edge-TTS: ${f5Message}`)
            result = await generateEdgeTTS({ ...ttsConfig, provider: 'edge' }, scene.vo, outputPath, {
              speed: ttsSpeed,
            })
          }
        } else {
          result = await generateEdgeTTS(ttsConfig, scene.vo, outputPath, { speed: ttsSpeed })
        }

        await db.scene.update({
          where: { id: scene.id },
          data: {
            audio_path: toApiPath(result.file_path),
            tts_status: 'completed',
          },
        })

        await db.asset.create({
          data: {
            project_id,
            type: 'audio',
            scene_id: scene.id,
            file_path: result.file_path,
            prompt: scene.vo,
            provider: ttsConfig.provider,
          },
        })

        results.push({ scene_id: scene.id, status: 'completed', audio_path: toApiPath(result.file_path) })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        await db.scene.update({
          where: { id: scene.id },
          data: { tts_status: 'failed', error_message: message },
        })
        errors.push({ scene_id: scene.id, error: message })
      }
    }

    const allScenes = await db.scene.findMany({ where: { project_id } })
    const scenesWithVo = allScenes.filter((s) => s.vo)
    const allHaveAudio = scenesWithVo.length > 0 && scenesWithVo.every((s) => s.tts_status === 'completed')
    if (allHaveAudio) {
      await db.project.update({ where: { id: project_id }, data: { status: 'audio_ready' } })
    }

    return NextResponse.json({ results, errors, scenes: allScenes })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error generating voice:', message)
    return NextResponse.json({ error: message || 'Failed to generate voice' }, { status: 500 })
  }
}
