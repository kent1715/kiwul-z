import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProviderConfig, generateJSON } from '@/server/providers'
import { ensureProjectDirs, ensureImagePrompt, DEFAULT_NEGATIVE_PROMPT } from '@/server/storage'
import type { LLMConfig } from '@/server/providers/provider.types'

export async function POST(request: NextRequest) {
  try {
    const { project_id } = await request.json()
    if (!project_id) return NextResponse.json({ error: 'project_id is required' }, { status: 400 })

    const project = await db.project.findUnique({ where: { id: project_id } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    ensureProjectDirs(project_id)

    const llmConfig = await getProviderConfig<LLMConfig>('llm')
    if (!llmConfig || !llmConfig.enabled) {
      return NextResponse.json({ error: 'No active LLM provider' }, { status: 400 })
    }

    // Get characters and locations for context
    const characters = await db.character.findMany({ where: { project_id } })
    const locations = await db.location.findMany({ where: { project_id } })
    const scriptData = project.script_json && project.script_json !== '{}' ? JSON.parse(project.script_json) : null
    const storylineData = project.storyline_json && project.storyline_json !== '{}' ? JSON.parse(project.storyline_json) : null
    const configData = project.config_json && project.config_json !== '{}' ? JSON.parse(project.config_json) : {}

    const safe = (value: unknown, fallback = '') => {
      if (value === null || value === undefined) return fallback
      if (typeof value === 'string') return value
      return String(value)
    }

    const projectVisualStyle =
      configData.visual_style ||
      configData.visualStyle ||
      configData.style ||
      project.tone ||
      'cinematic realistic vertical video style'

    const projectAspectRatio =
      configData.aspect_ratio ||
      configData.aspectRatio ||
      '9:16'

    const projectResolution =
      configData.resolution ||
      '720x1280'

    const template = await db.promptTemplate.findFirst({ where: { type: 'storyboard', is_default: true } })
    if (!template) return NextResponse.json({ error: 'No storyboard prompt template found' }, { status: 400 })

    const charsText = characters.map((c) =>
      [
        `Character: ${c.name}`,
        c.role ? `Role: ${c.role}` : null,
        c.description ? `Description: ${c.description}` : null,
        c.gender ? `Gender: ${c.gender}` : null,
        c.age_range ? `Age range: ${c.age_range}` : null,
        c.ethnicity_style ? `Ethnicity/style: ${c.ethnicity_style}` : null,
        c.face_description ? `Face: ${c.face_description}` : null,
        c.hair_or_hijab ? `Hair/Hijab: ${c.hair_or_hijab}` : null,
        c.outfit ? `Outfit: ${c.outfit}` : null,
        c.body_type ? `Body type: ${c.body_type}` : null,
        c.visual_consistency_prompt ? `VISUAL CONSISTENCY PROMPT: ${c.visual_consistency_prompt}` : null,
        c.visual_prompt ? `VISUAL PROMPT: ${c.visual_prompt}` : null,
      ].filter(Boolean).join('\n')
    ).join('\n\n')
    const locsText = locations.map((l) =>
      [
        `Location: ${l.name}`,
        l.description ? `Description: ${l.description}` : null,
        l.consistency_prompt ? `LOCATION CONSISTENCY PROMPT: ${l.consistency_prompt}` : null,
        l.visual_style ? `VISUAL STYLE: ${l.visual_style}` : null,
        l.lighting ? `LIGHTING: ${l.lighting}` : null,
        l.camera_style ? `CAMERA STYLE: ${l.camera_style}` : null,
      ].filter(Boolean).join('\n')
    ).join('\n\n')

    let prompt = template.template
      .replace(/{title}/g, safe(project.title, 'Untitled project'))
      .replace(/{content_type}/g, safe(project.content_type, 'video'))
      .replace(/{language}/g, safe(project.language, 'id'))
      .replace(/{duration_seconds}/g, safe(project.duration_seconds, '30'))
      .replace(/{target_platform}/g, safe(project.target_platform, 'youtube shorts'))
      .replace(/{niche}/g, safe(project.niche, 'general'))
      .replace(/{topic}/g, safe(project.topic, project.title || 'story topic'))
      .replace(/{audience}/g, safe(project.audience, 'general audience'))
      .replace(/{tone}/g, safe(project.tone, 'cinematic'))
      .replace(/{aspect_ratio}/g, safe(projectAspectRatio, '9:16'))
      .replace(/{visual_style}/g, safe(projectVisualStyle, 'cinematic realistic vertical video style'))
      .replace(/{resolution}/g, safe(projectResolution, '720x1280'))
      .replace(/{characters}/g, charsText || 'No characters defined yet')
      .replace(/{locations}/g, locsText || 'No locations defined yet')
      .replace(/{storyline}/g, storylineData ? JSON.stringify(storylineData, null, 2) : 'No storyline available')
      .replace(/{script}/g, scriptData ? JSON.stringify(scriptData, null, 2) : 'No script available')

    const result = await generateJSON(llmConfig, 'You are a storyboard artist. Return only valid JSON.', prompt)

    const scenesData = (result as any)?.scenes || []
    if (!scenesData.length) return NextResponse.json({ error: 'No scenes generated' }, { status: 400 })

    // Delete existing storyboard and scenes
    const existingSb = await db.storyboard.findFirst({ where: { project_id } })
    if (existingSb) {
      await db.scene.deleteMany({ where: { storyboard_id: existingSb.id } })
      await db.storyboard.delete({ where: { id: existingSb.id } })
    }

    // Create storyboard
    const storyboard = await db.storyboard.create({
      data: {
        project_id,
        title: (result as any).title || project.title,
        duration_total: (result as any).duration_total || project.duration_seconds,
        format: (result as any).format || safe(projectAspectRatio, '9:16'),
        music_style: (result as any).music_style || null,
        raw_json: JSON.stringify(result),
      },
    })

    // Create scenes
    const createdScenes: any[] = []
    for (let i = 0; i < scenesData.length; i++) {
      const s = scenesData[i]
      const scene = await db.scene.create({
        data: {
          project_id,
          storyboard_id: storyboard.id,
          part_number: s.part_number || 1,
          scene_number: s.scene_number || i + 1,
          start_time: s.start_time ?? (i > 0 ? scenesData.slice(0, i).reduce((sum: number, ps: any) => sum + (ps.duration || 3), 0) : 0),
          end_time: s.end_time ?? (s.start_time ?? 0) + (s.duration || 3),
          duration: s.duration || 3,
          action: s.action || null,
          vo: s.vo || null,
          visual_description: s.visual_description || null,
          scene_goal: s.scene_goal || null,
          image_prompt: s.image_prompt || null,
          negative_prompt: s.negative_prompt || DEFAULT_NEGATIVE_PROMPT,
          motion_prompt: s.motion_prompt || 'Create subtle natural motion appropriate to the visible subject and environment. Follow the scene action. Animate only elements already visible in the image. Preserve subject identity, object shape, background, lighting, colors, camera angle, and composition. No new objects, no morphing, no stretching, no melting, no swelling, no warping, no flicker.',
          camera: s.camera || null,
          character_ids: JSON.stringify(s.character_ids || []),
          location_id: s.location_id || null,
          image_status: 'pending',
          video_status: 'pending',
          tts_status: 'pending',
          status: 'pending',
        },
      })
      createdScenes.push(scene)
    }

    // Now generate image_prompt and motion_prompt for scenes that don't have them
    const scenesWithoutPrompts = createdScenes.filter(s => !s.image_prompt)
    if (scenesWithoutPrompts.length > 0) {
      const imageTemplate = await db.promptTemplate.findFirst({ where: { type: 'image', is_default: true } })
      if (imageTemplate) {
        const scenesInput = scenesWithoutPrompts.map(s => ({
          scene_id: s.id,
          action: s.action,
          vo: s.vo,
          visual_description: s.visual_description,
        }))

        let imgPrompt = imageTemplate.template
          .replace(/{visual_style}/g, safe(projectVisualStyle, 'cinematic realistic vertical video style'))
          .replace(/{aspect_ratio}/g, safe(projectAspectRatio, '9:16'))
          .replace(/{resolution}/g, safe(projectResolution, '720x1280'))
          .replace(/{characters}/g, charsText || 'No characters')
          .replace(/{locations}/g, locsText || 'No locations')
          .replace(/{scenes}/g, JSON.stringify(scenesInput, null, 2))

        try {
          const imgResult = await generateJSON(llmConfig, 'You are an AI image prompt engineer. Return only valid JSON.', imgPrompt)
          const promptScenes = (imgResult as any)?.scenes || []
          for (const ps of promptScenes) {
            const sceneId = ps.scene_id
            if (sceneId) {
              await db.scene.update({
                where: { id: sceneId },
                data: {
                  image_prompt: ensureImagePrompt(ps.image_prompt, ps),
                  negative_prompt: ps.negative_prompt || DEFAULT_NEGATIVE_PROMPT,
                  motion_prompt: ps.motion_prompt || 'Create subtle natural motion appropriate to the visible subject and environment. Follow the scene action. Animate only elements already visible in the image. Preserve subject identity, object shape, background, lighting, colors, camera angle, and composition. No new objects, no morphing, no stretching, no melting, no swelling, no warping, no flicker., stable anatomy, consistent identity, no scene change, no morphing',
                },
              })
            }
          }
        } catch (err) {
          console.error('Failed to generate image/motion prompts:', err)
          // Continue without prompts - user can regenerate later
        }
      }
    }

    // Reload scenes with updated prompts
    const finalScenes = await db.scene.findMany({
      where: { storyboard_id: storyboard.id },
      orderBy: { scene_number: 'asc' },
    })

    await db.project.update({ where: { id: project_id }, data: { status: 'storyboard_ready' } })

    return NextResponse.json({ storyboard, scenes: finalScenes })
  } catch (error: any) {
    console.error('Error generating storyboard:', error)
    return NextResponse.json({ error: error.message || 'Failed to generate storyboard' }, { status: 500 })
  }
}




