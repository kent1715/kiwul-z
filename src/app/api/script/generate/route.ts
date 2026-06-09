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

    // Get storyline from project
    const storylineData = project.storyline_json && project.storyline_json !== '{}'
      ? JSON.parse(project.storyline_json)
      : null

    if (!storylineData) {
      return NextResponse.json({ error: 'No storyline found. Generate a storyline first.' }, { status: 400 })
    }

    const template = await db.promptTemplate.findFirst({ where: { type: 'script', is_default: true } })
    if (!template) return NextResponse.json({ error: 'No script prompt template found' }, { status: 400 })

    let prompt = template.template
      .replace(/{content_type}/g, project.content_type)
      .replace(/{language}/g, project.language)
      .replace(/{duration_seconds}/g, String(project.duration_seconds))
      .replace(/{visual_style}/g, project.visual_style)
      .replace(/{tone}/g, project.tone || 'engaging')
      .replace(/{storyline}/g, JSON.stringify(storylineData, null, 2))

    const result = await generateJSON(llmConfig, 'You are a professional scriptwriter. Return only valid JSON.', prompt)

    // Save script to project
    await db.project.update({
      where: { id: project_id },
      data: {
        script_json: JSON.stringify(result),
        status: 'script_generated',
      },
    })

    return NextResponse.json({ script: result })
  } catch (error: any) {
    console.error('Error generating script:', error)
    return NextResponse.json({ error: error.message || 'Failed to generate script' }, { status: 500 })
  }
}
