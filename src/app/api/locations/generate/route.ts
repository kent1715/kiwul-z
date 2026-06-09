import { db } from '@/lib/db'
import { getLLMProvider, callLLM, parseJSONFromLLM, getPromptTemplate } from '@/lib/llm'
import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_LOCATION_PROMPT = `You are a location designer for short-form video content. Create detailed location descriptions for this project.

Project Details:
- Content Type: {content_type}
- Visual Style: {visual_style}
- Aspect Ratio: {aspect_ratio}

Storyline:
{storyline}

Create 3-5 locations that appear in this content. For each location, provide:
{
  "locations": [
    {
      "name": "Location Name",
      "description": "Detailed description of the location",
      "lighting": "Lighting description (e.g., warm golden hour, soft diffused indoor lighting)",
      "camera_style": "Camera style suggestion (e.g., wide establishing shot, close-up detail)",
      "consistency_prompt": "A short consistency prompt for maintaining location appearance across scenes"
    }
  ]
}

Make descriptions detailed enough for AI image generation.
Return ONLY valid JSON.`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id } = body

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

    const config = JSON.parse(project.config_json || '{}')
    const storyline = config.storyline || 'No storyline available'

    let promptTemplate = await getPromptTemplate('location')
    if (!promptTemplate) {
      promptTemplate = DEFAULT_LOCATION_PROMPT
    }

    const systemPrompt = promptTemplate
      .replace('{content_type}', project.content_type)
      .replace('{visual_style}', project.visual_style)
      .replace('{aspect_ratio}', project.aspect_ratio)
      .replace('{storyline}', storyline)

    const llmResponse = await callLLM(provider, [
      { role: 'system', content: 'You are a location designer for video content. Always respond with valid JSON only.' },
      { role: 'user', content: systemPrompt },
    ], { temperature: 0.7, response_format: { type: 'json_object' } })

    const parsed = parseJSONFromLLM(llmResponse) as {
      locations: Array<{
        name: string
        description?: string
        lighting?: string
        camera_style?: string
        consistency_prompt?: string
      }>
    }

    const locationsList = parsed.locations || (Array.isArray(parsed) ? parsed : [parsed])

    // Delete existing locations for this project
    await db.location.deleteMany({ where: { project_id } })

    const createdLocations = await Promise.all(
      locationsList.map((loc) =>
        db.location.create({
          data: {
            project_id,
            name: loc.name || 'Unnamed Location',
            description: loc.description || null,
            lighting: loc.lighting || null,
            camera_style: loc.camera_style || null,
            consistency_prompt: loc.consistency_prompt || null,
            raw_json: JSON.stringify(loc),
          },
        })
      )
    )

    return NextResponse.json({ locations: createdLocations }, { status: 201 })
  } catch (error) {
    console.error('Error generating locations:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate locations' },
      { status: 500 }
    )
  }
}
