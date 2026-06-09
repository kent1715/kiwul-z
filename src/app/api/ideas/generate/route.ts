import { db } from '@/lib/db'
import { getLLMProvider, callLLM, parseJSONFromLLM, getPromptTemplate } from '@/lib/llm'
import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_IDEA_PROMPT = `You are a creative content strategist. Generate 5 creative content ideas for a short video project.

Project Details:
- Content Type: {content_type}
- Language: {language}
- Duration: {duration_seconds} seconds
- Visual Style: {visual_style}
- Target Platform: {target_platform}
- Niche: {niche}
- Topic: {topic}
- Audience: {audience}
- Tone: {tone}

Return a JSON array of ideas. Each idea should have:
- title: A catchy title for the content idea
- hook: An attention-grabbing opening hook (1-2 sentences)
- angle: The unique angle or perspective of this idea
- content_type: The specific content format

Return ONLY valid JSON, no markdown or explanation.`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id, count = 5 } = body

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    const project = await db.project.findUnique({ where: { id: project_id } })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const provider = await getLLMProvider()
    if (!provider) {
      return NextResponse.json({ error: 'No active LLM provider configured' }, { status: 400 })
    }

    // Get prompt template
    let promptTemplate = await getPromptTemplate('idea')
    if (!promptTemplate) {
      promptTemplate = DEFAULT_IDEA_PROMPT
    }

    // Replace placeholders
    const systemPrompt = promptTemplate
      .replace('{content_type}', project.content_type)
      .replace('{language}', project.language)
      .replace('{duration_seconds}', String(project.duration_seconds))
      .replace('{visual_style}', project.visual_style)
      .replace('{target_platform}', project.target_platform)
      .replace('{niche}', project.niche || 'general')
      .replace('{topic}', project.topic || 'any')
      .replace('{audience}', project.audience || 'general audience')
      .replace('{tone}', project.tone || 'engaging')
      .replace('{count}', String(count))

    const llmResponse = await callLLM(provider, [
      { role: 'system', content: 'You are a creative content strategist. Always respond with valid JSON only.' },
      { role: 'user', content: systemPrompt },
    ], { temperature: 0.8, response_format: { type: 'json_object' } })

    const parsed = parseJSONFromLLM(llmResponse) as Array<{ title: string; hook?: string; angle?: string; content_type?: string }>

    // Handle both array and object with ideas key
    const ideas = Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown>).ideas as Array<{ title: string; hook?: string; angle?: string; content_type?: string }> || [parsed]

    // Store ideas in database
    const createdIdeas = await Promise.all(
      ideas.slice(0, count).map((idea) =>
        db.idea.create({
          data: {
            project_id,
            title: idea.title || 'Untitled Idea',
            hook: idea.hook || null,
            angle: idea.angle || null,
            content_type: idea.content_type || null,
            raw_json: JSON.stringify(idea),
          },
        })
      )
    )

    // Update project status
    await db.project.update({
      where: { id: project_id },
      data: { status: 'idea_generated' },
    })

    return NextResponse.json({ ideas: createdIdeas })
  } catch (error) {
    console.error('Error generating ideas:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate ideas' },
      { status: 500 }
    )
  }
}
