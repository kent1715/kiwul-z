import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type ExternalScene = {
  scene_number?: number
  duration?: number
  fact_focus?: string
  visual_anchor?: string
  action?: string
  vo?: string
  visual_description?: string
  image_prompt?: string
  video_prompt?: string
  motion_prompt?: string
  negative_prompt?: string
  scene_goal?: string
  camera?: string
}

type ExternalPart = {
  part_number?: number
  part_title?: string
  scenes?: ExternalScene[]
}

type ExternalScript = {
  metadata?: any
  title?: string
  language?: string
  target_duration?: number
  parts?: ExternalPart[]
}

const DEFAULT_NEGATIVE_PROMPT =
  'text, watermark, logo, UI, label, blurry, distorted, low quality, extra limbs, deformed'

function parseMaybeJson(input: unknown): ExternalScript {
  if (!input) throw new Error('script is required')

  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) throw new Error('script JSON is empty')
    return JSON.parse(trimmed)
  }

  if (typeof input === 'object') {
    return input as ExternalScript
  }

  throw new Error('script must be JSON object or JSON string')
}

function getScenesFromScript(script: ExternalScript) {
  if (!Array.isArray(script.parts)) {
    throw new Error('script.parts must be an array')
  }

  const scenes: Array<ExternalScene & { part_number: number }> = []

  script.parts.forEach((part, partIndex) => {
    const partNumber = Number(part.part_number || partIndex + 1)

    if (!Array.isArray(part.scenes)) {
      throw new Error(`part ${partNumber}: scenes must be an array`)
    }

    part.scenes.forEach((scene) => {
      scenes.push({
        ...scene,
        part_number: partNumber,
      })
    })
  })

  return scenes
}

function normalizeExternalScript(script: ExternalScript, project: any): ExternalScript {
  const allScenes = getScenesFromScript(script)

  if (allScenes.length === 0) {
    throw new Error('script must contain at least one scene')
  }

  const errors: string[] = []
  const seenSceneNumbers = new Set<number>()

  const normalizedParts = script.parts!.map((part, partIndex) => {
    const partNumber = Number(part.part_number || partIndex + 1)

    const scenes = (part.scenes || []).map((scene, sceneIndex) => {
      const sceneNumber = Number(scene.scene_number || sceneIndex + 1)
      const duration = Number(scene.duration || 3)

      if (!Number.isFinite(duration) || duration <= 0) {
        errors.push(`scene ${sceneNumber}: duration must be positive number`)
      }

      if (seenSceneNumbers.has(sceneNumber)) {
        errors.push(`scene ${sceneNumber}: duplicate scene_number`)
      }
      seenSceneNumbers.add(sceneNumber)

      const vo = String(scene.vo || '').trim()
      const action = String(scene.action || '').trim()
      const visualDescription = String(scene.visual_description || scene.image_prompt || '').trim()
      const sceneGoal = String(scene.scene_goal || scene.fact_focus || action || '').trim()

      if (!vo) errors.push(`scene ${sceneNumber}: vo is required`)
      if (!action) errors.push(`scene ${sceneNumber}: action is required`)
      if (!visualDescription) {
        errors.push(`scene ${sceneNumber}: visual_description or image_prompt is required`)
      }
      if (!sceneGoal) errors.push(`scene ${sceneNumber}: scene_goal is required`)

      return {
        scene_number: sceneNumber,
        duration,
        fact_focus: String(scene.fact_focus || '').trim(),
        visual_anchor: String(scene.visual_anchor || '').trim(),
        action,
        vo,
        visual_description: visualDescription,
        image_prompt: String(scene.image_prompt || visualDescription).trim(),
        video_prompt: String(scene.video_prompt || scene.motion_prompt || action).trim(),
        motion_prompt: String(scene.motion_prompt || scene.video_prompt || action).trim(),
        negative_prompt: String(scene.negative_prompt || DEFAULT_NEGATIVE_PROMPT).trim(),
        scene_goal: sceneGoal,
        camera: String(scene.camera || '').trim(),
      }
    })

    return {
      part_number: partNumber,
      part_title: part.part_title || `Part ${partNumber}`,
      scenes,
    }
  })

  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }

  const durations = normalizedParts.flatMap((part) => part.scenes.map((scene) => scene.duration))
  const totalDuration = durations.reduce((sum, duration) => sum + duration, 0)

  return {
    metadata: {
      ...(script.metadata || {}),
      pipeline_version: script.metadata?.pipeline_version || 'external_script_v1',
      source: script.metadata?.source || 'external_import',
      imported_at: new Date().toISOString(),
      scene_plan: {
        target_duration: totalDuration,
        scene_count: durations.length,
        part_count: normalizedParts.length,
        durations,
      },
    },
    title: script.title || project.title || project.topic || 'Imported Script',
    language: script.language || project.language || 'id',
    target_duration: Number(script.target_duration || totalDuration),
    parts: normalizedParts,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const projectId = body.project_id || body.projectId

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'project_id is required' }, { status: 400 })
    }

    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    }

    const rawScript = parseMaybeJson(body.script || body.json || body.script_json)
    const script = normalizeExternalScript(rawScript, project)
    const allScenes = getScenesFromScript(script)

    let currentStartTime = 0
    let scenesCreated = 0

    await db.$transaction(async (tx) => {
      await tx.scene.deleteMany({ where: { project_id: projectId } })
      await tx.storyboard.deleteMany({ where: { project_id: projectId } })

      await tx.project.update({
        where: { id: projectId },
        data: {
          script_json: JSON.stringify(script),
          status: 'script_ready',
        },
      })

      const storyboard = await tx.storyboard.create({
        data: {
          project_id: projectId,
          title: script.title || project.title || 'Imported Storyboard',
          duration_total: Number(script.target_duration || 0),
          format: project.aspect_ratio || '9:16',
          music_style: 'cinematic documentary',
          raw_json: JSON.stringify(script),
        },
      })

      const sceneRows = allScenes.map((scene, index) => {
        const duration = Number(scene.duration || 3)
        const startTime = currentStartTime
        const endTime = startTime + duration
        currentStartTime = endTime

        const visualDescription = String(scene.visual_description || scene.image_prompt || '').trim()
        const action = String(scene.action || '').trim()
        const motionPrompt = String(scene.motion_prompt || scene.video_prompt || action).trim()

        return {
          project_id: projectId,
          storyboard_id: storyboard.id,
          part_number: Number(scene.part_number || 1),
          scene_number: Number(scene.scene_number || index + 1),
          start_time: startTime,
          end_time: endTime,
          duration,
          action,
          vo: String(scene.vo || '').trim(),
          visual_description: visualDescription,
          scene_goal: String(scene.scene_goal || scene.fact_focus || action || '').trim(),
          image_prompt: String(scene.image_prompt || visualDescription).trim(),
          negative_prompt: String(scene.negative_prompt || DEFAULT_NEGATIVE_PROMPT).trim(),
          motion_prompt: motionPrompt,
          camera: String(scene.camera || '').trim(),
          raw_json: JSON.stringify(scene),
          image_status: 'pending',
          video_status: 'pending',
          tts_status: 'pending',
          status: 'pending',
        }
      })

      await tx.scene.createMany({ data: sceneRows })
      scenesCreated = sceneRows.length

      await tx.project.update({
        where: { id: projectId },
        data: { status: 'storyboard_ready' },
      })
    })

    return NextResponse.json({
      success: true,
      script,
      scenesCreated,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[EXTERNAL SCRIPT IMPORT ERROR]', error)
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
