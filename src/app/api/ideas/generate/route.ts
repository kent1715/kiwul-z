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
      return NextResponse.json({ error: 'No active LLM provider. Configure Ollama in Provider Settings.' }, { status: 400 })
    }

    // Get prompt template
    const template = await db.promptTemplate.findFirst({ where: { type: 'idea', is_default: true } })
    if (!template) return NextResponse.json({ error: 'No idea prompt template found' }, { status: 400 })

    // Fill template variables
    const prompt = template.template
      .replace(/{content_type}/g, project.content_type)
      .replace(/{language}/g, project.language)
      .replace(/{duration_seconds}/g, String(project.duration_seconds))
      .replace(/{visual_style}/g, project.visual_style)
      .replace(/{target_platform}/g, project.target_platform)
      .replace(/{niche}/g, project.niche || 'general')
      .replace(/{topic}/g, project.topic || 'general')
      .replace(/{audience}/g, project.audience || 'general audience')
      .replace(/{tone}/g, project.tone || 'engaging')

    const result = await generateJSON(llmConfig, 'You are a creative content strategist. Return only valid JSON.', prompt)

    const ideasData = (result as any)?.ideas || (Array.isArray(result) ? result : [result])

    // Delete existing unselected ideas
    await db.idea.deleteMany({ where: { project_id, selected: false } })

    // Create new ideas
    const ideas: any[] = []
    for (const idea of ideasData) {
      const created = await db.idea.create({
        data: {
          project_id,
          title: idea.title || 'Untitled Idea',
          hook: idea.hook || null,
          angle: idea.angle || null,
          conflict_or_value: idea.conflict_or_value || null,
          visual_potential: idea.visual_potential || null,
          estimated_duration: idea.estimated_duration || null,
          raw_json: JSON.stringify(idea),
        },
      })
      ideas.push(created)
    }

    // Update project status
    await db.project.update({ where: { id: project_id }, data: { status: 'idea_generated' } })

    return NextResponse.json({ ideas })
  } catch (error: any) {
    console.error('Error generating ideas:', error)
    return NextResponse.json({ error: error.message || 'Failed to generate ideas' }, { status: 500 })
  }
}

