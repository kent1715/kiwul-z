import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProviderConfig, generateJSON } from '@/server/providers'
import type { LLMConfig } from '@/server/providers/provider.types'

export async function POST(request: NextRequest) {
  try {
    const { project_id } = await request.json()
    if (!project_id) return NextResponse.json({ error: 'project_id is required' }, { status: 400 })

    const project = await db.project.findUnique({ where: { id: project_id } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const llmConfig = await getProviderConfig<LLMConfig>('llm')
    if (!llmConfig || !llmConfig.enabled) {
      return NextResponse.json({ error: 'No active LLM provider' }, { status: 400 })
    }

    // Get selected idea
    const selectedIdea = await db.idea.findFirst({ where: { project_id, selected: true } })

    const template = await db.promptTemplate.findFirst({ where: { type: 'storyline', is_default: true } })
    if (!template) return NextResponse.json({ error: 'No storyline prompt template found' }, { status: 400 })

    let prompt = template.template
      .replace(/{content_type}/g, project.content_type)
      .replace(/{language}/g, project.language)
      .replace(/{duration_seconds}/g, String(project.duration_seconds))
      .replace(/{visual_style}/g, project.visual_style)
      .replace(/{target_platform}/g, project.target_platform)
      .replace(/{tone}/g, project.tone || 'engaging')
      .replace(/{idea_title}/g, selectedIdea?.title || project.title)
      .replace(/{idea_hook}/g, selectedIdea?.hook || '')
      .replace(/{idea_angle}/g, selectedIdea?.angle || '')

    const result = await generateJSON(llmConfig, 'You are a storytelling expert. Return only valid JSON.', prompt)

    // Save storyline to project
    await db.project.update({
      where: { id: project_id },
      data: { storyline_json: JSON.stringify(result) },
    })

    return NextResponse.json({ storyline: JSON.stringify(result) })
  } catch (error: any) {
    console.error('Error generating storyline:', error)
    return NextResponse.json({ error: error.message || 'Failed to generate storyline' }, { status: 500 })
  }
}
