import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProviderConfig, generateJSON } from '@/server/providers'
import { ensureProjectDirs } from '@/server/storage'
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

    const template = await db.promptTemplate.findFirst({ where: { type: 'character', is_default: true } })
    if (!template) return NextResponse.json({ error: 'No character prompt template found' }, { status: 400 })

    const storyline = project.storyline_json && project.storyline_json !== '{}' ? JSON.parse(project.storyline_json) : null
    const script = project.script_json && project.script_json !== '{}' ? JSON.parse(project.script_json) : null

    let prompt = template.template
      .replace(/{content_type}/g, project.content_type)
      .replace(/{language}/g, project.language)
      .replace(/{visual_style}/g, project.visual_style)
      .replace(/{storyline}/g, storyline ? JSON.stringify(storyline) : project.title)
      .replace(/{script_summary}/g, script ? JSON.stringify(script).substring(0, 2000) : project.topic || 'No script yet')

    const result = await generateJSON(llmConfig, 'You are a character designer. Return only valid JSON.', prompt)

    const charsData = (result as any)?.characters || (Array.isArray(result) ? result : [result])

    // Delete existing characters
    await db.character.deleteMany({ where: { project_id } })

    const characters: any[] = []
    for (const char of charsData) {
      const created = await db.character.create({
        data: {
          project_id,
          name: char.name || 'Unnamed',
          role: char.role || 'supporting',
          description: char.description || null,
          gender: char.gender || null,
          age_range: char.age_range || null,
          ethnicity_style: char.ethnicity_style || null,
          face_description: char.face_description || null,
          hair_or_hijab: char.hair_or_hijab || null,
          outfit: char.outfit || null,
          body_type: char.body_type || null,
          personality: char.personality || null,
          visual_prompt: char.visual_prompt || null,
          negative_prompt: char.negative_prompt || null,
          visual_consistency_prompt: char.visual_consistency_prompt || 'same face, same hairstyle, same outfit, same body proportion, consistent identity',
          raw_json: JSON.stringify(char),
        },
      })
      characters.push(created)
    }

    await db.project.update({ where: { id: project_id }, data: { status: 'character_ready' } })

    return NextResponse.json({ characters })
  } catch (error: any) {
    console.error('Error generating characters:', error)
    return NextResponse.json({ error: error.message || 'Failed to generate characters' }, { status: 500 })
  }
}
