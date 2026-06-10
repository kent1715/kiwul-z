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

    const template = await db.promptTemplate.findFirst({ where: { type: 'storyboard', is_default: true } })
    if (!template) return NextResponse.json({ error: 'No storyboard prompt template found' }, { status: 400 })

    const charsText = characters.map(c => `${c.name}: ${c.description || ''} (${c.visual_prompt || ''})`).join('\n')
    const locsText = locations.map(l => `${l.name}: ${l.description || ''} (${l.lighting || ''})`).join('\n')

    let prompt = template.template
      .replace(/{content_type}/g, project.content_type)
      .replace(/{language}/g, project.language)
      .replace(/{duration_seconds}/g, String(project.duration_seconds))
      .replace(/{aspect_ratio}/g, project.aspect_ratio)
      .replace(/{visual_style}/g, project.visual_style)
      .replace(/{characters}/g, charsText || 'No characters defined yet')
      .replace(/{locations}/g, locsText || 'No locations defined yet')
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
        format: (result as any).format || project.aspect_ratio,
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
          image_prompt: ensureImagePrompt(s.image_prompt, s),
          negative_prompt: s.negative_prompt || DEFAULT_NEGATIVE_PROMPT,
          motion_prompt: s.motion_prompt || 'subtle camera push-in, natural breathing motion, slight head movement, stable anatomy, consistent identity',
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
          .replace(/{visual_style}/g, project.visual_style)
          .replace(/{aspect_ratio}/g, project.aspect_ratio)
          .replace(/{resolution}/g, project.resolution)
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
                  motion_prompt: ps.motion_prompt || 'subtle camera push-in, natural breathing motion, stable anatomy, consistent identity, no scene change, no morphing',
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
