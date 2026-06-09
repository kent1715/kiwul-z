import { db } from '@/lib/db'
import { getLLMProvider, callLLM, parseJSONFromLLM, getPromptTemplate } from '@/lib/llm'
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
    const script = config.script || null

    return NextResponse.json({ script })
  } catch (error) {
    console.error('Error fetching script:', error)
    return NextResponse.json({ error: 'Failed to fetch script' }, { status: 500 })
  }
}

const DEFAULT_SCRIPT_PROMPT = `You are a professional scriptwriter for short-form video content. Create a detailed script for this project.

Project Details:
- Content Type: {content_type}
- Language: {language}
- Duration: {duration_seconds} seconds
- Visual Style: {visual_style}
- Tone: {tone}

Storyline:
{storyline}

Create a script with the following JSON structure:
{
  "title": "Script Title",
  "parts": [
    {
      "part_number": 1,
      "part_title": "Part Title",
      "scenes": [
        {
          "scene_number": 1,
          "duration": 3,
          "action": "What happens visually",
          "vo": "Voice-over narration text",
          "visual_description": "Detailed visual description for image generation",
          "scene_goal": "What this scene achieves"
        }
      ]
    }
  ]
}

Make sure total scene durations add up to approximately {duration_seconds} seconds.
Each scene should be 2-5 seconds for short-form content.
Write voice-over in {language}.
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

    // Get storyline from project config
    const config = JSON.parse(project.config_json || '{}')
    const storyline = config.storyline || 'No storyline available'

    let promptTemplate = await getPromptTemplate('script')
    if (!promptTemplate) {
      promptTemplate = DEFAULT_SCRIPT_PROMPT
    }

    const systemPrompt = promptTemplate
      .replace('{content_type}', project.content_type)
      .replace('{language}', project.language)
      .replace('{duration_seconds}', String(project.duration_seconds))
      .replace('{visual_style}', project.visual_style)
      .replace('{tone}', project.tone || 'engaging')
      .replace('{storyline}', storyline)

    const llmResponse = await callLLM(provider, [
      { role: 'system', content: 'You are a professional scriptwriter. Always respond with valid JSON only.' },
      { role: 'user', content: systemPrompt },
    ], { temperature: 0.7, response_format: { type: 'json_object' } })

    const scriptData = parseJSONFromLLM(llmResponse) as {
      title: string
      parts: Array<{
        part_number: number
        part_title: string
        scenes: Array<{
          scene_number: number
          duration: number
          action: string
          vo: string
          visual_description: string
          scene_goal: string
        }>
      }>
    }

    // Store script in project config
    config.script = scriptData
    await db.project.update({
      where: { id: project_id },
      data: {
        config_json: JSON.stringify(config),
        status: 'script_generated',
      },
    })

    return NextResponse.json({ script: scriptData })
  } catch (error) {
    console.error('Error generating script:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate script' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id, script } = body

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    const project = await db.project.findUnique({ where: { id: project_id } })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const config = JSON.parse(project.config_json || '{}')
    // script can be a string or an object
    if (typeof script === 'string') {
      try {
        config.script = JSON.parse(script)
      } catch {
        config.script = script
      }
    } else {
      config.script = script
    }
    await db.project.update({
      where: { id: project_id },
      data: { config_json: JSON.stringify(config) },
    })

    return NextResponse.json({ script: config.script })
  } catch (error) {
    console.error('Error updating script:', error)
    return NextResponse.json({ error: 'Failed to update script' }, { status: 500 })
  }
}
