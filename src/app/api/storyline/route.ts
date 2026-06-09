import { db } from '@/lib/db'
import { getLLMProvider, callLLM, getPromptTemplate } from '@/lib/llm'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const project_id = searchParams.get('project_id')

    if (!project_id) {
      return NextResponse.json({ error: 'project_id query parameter is required' }, { status: 400 })
    }

    const project = await db.project.findUnique({ where: { id: project_id } })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const config = JSON.parse(project.config_json || '{}')
    const storyline = config.storyline || null

    return NextResponse.json({ storyline })
  } catch (error) {
    console.error('Error fetching storyline:', error)
    return NextResponse.json({ error: 'Failed to fetch storyline' }, { status: 500 })
  }
}

const DEFAULT_STORYLINE_PROMPT = `You are a storytelling expert for short-form video content. Create a compelling storyline for this project.

Project Details:
- Content Type: {content_type}
- Language: {language}
- Duration: {duration_seconds} seconds
- Visual Style: {visual_style}
- Target Platform: {target_platform}
- Tone: {tone}

Selected Idea:
- Title: {idea_title}
- Hook: {idea_hook}
- Angle: {idea_angle}

Create a detailed storyline with a clear beginning, middle, and end. Include:
- A strong opening hook
- Rising tension or development
- A satisfying conclusion or call to action
- Key emotional beats and transitions

Write the storyline as flowing narrative prose. Be creative and specific.`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id } = body

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    const project = await db.project.findUnique({
      where: { id: project_id },
      include: { ideas: { where: { selected: true }, take: 1 } },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const provider = await getLLMProvider()
    if (!provider) {
      return NextResponse.json({ error: 'No active LLM provider configured' }, { status: 400 })
    }

    const selectedIdea = project.ideas?.[0]

    let promptTemplate = await getPromptTemplate('storyline')
    if (!promptTemplate) {
      promptTemplate = DEFAULT_STORYLINE_PROMPT
    }

    const systemPrompt = promptTemplate
      .replace('{content_type}', project.content_type)
      .replace('{language}', project.language)
      .replace('{duration_seconds}', String(project.duration_seconds))
      .replace('{visual_style}', project.visual_style)
      .replace('{target_platform}', project.target_platform)
      .replace('{tone}', project.tone || 'engaging')
      .replace('{idea_title}', selectedIdea?.title || 'No idea selected')
      .replace('{idea_hook}', selectedIdea?.hook || '')
      .replace('{idea_angle}', selectedIdea?.angle || '')

    const storyline = await callLLM(provider, [
      { role: 'system', content: 'You are a storytelling expert for short-form video content. Write compelling, creative storylines.' },
      { role: 'user', content: systemPrompt },
    ], { temperature: 0.8, max_tokens: 2048 })

    // Store storyline in project config
    const config = JSON.parse(project.config_json || '{}')
    config.storyline = storyline
    await db.project.update({
      where: { id: project_id },
      data: { config_json: JSON.stringify(config) },
    })

    return NextResponse.json({ storyline })
  } catch (error) {
    console.error('Error generating storyline:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate storyline' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id, storyline } = body

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    const project = await db.project.findUnique({ where: { id: project_id } })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const config = JSON.parse(project.config_json || '{}')
    config.storyline = storyline
    await db.project.update({
      where: { id: project_id },
      data: { config_json: JSON.stringify(config) },
    })

    return NextResponse.json({ storyline })
  } catch (error) {
    console.error('Error updating storyline:', error)
    return NextResponse.json({ error: 'Failed to update storyline' }, { status: 500 })
  }
}
