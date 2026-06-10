import { db } from '@/lib/db'
import { getLLMProvider, callLLM, parseJSONFromLLM, getPromptTemplate } from '@/lib/llm'
import { ensureImagePrompt, DEFAULT_NEGATIVE_PROMPT } from '@/server/storage'
import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_STORYBOARD_PROMPT = `You are a professional storyboard artist for short-form video content. Create a detailed storyboard for this project.

Project Details:
- Content Type: {content_type}
- Language: {language}
- Duration: {duration_seconds} seconds
- Aspect Ratio: {aspect_ratio}
- Visual Style: {visual_style}

Script:
{script}

Create a storyboard JSON with this structure:
{
  "title": "Storyboard Title",
  "duration_total": {duration_seconds},
  "format": "{aspect_ratio}",
  "music_style": "suggested music style",
  "scenes": [
    {
      "part_number": 1,
      "scene_number": 1,
      "start_time": 0,
      "end_time": 3,
      "duration": 3,
      "action": "What happens visually",
      "vo": "Voice-over text",
      "visual_description": "Detailed visual description for image generation",
      "scene_goal": "Purpose of this scene"
    }
  ]
}

Ensure scenes flow naturally with proper timing. Total duration should be approximately {duration_seconds} seconds.
Return ONLY valid JSON.`

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const project_id = searchParams.get('project_id')

    if (!project_id) {
      return NextResponse.json({ error: 'project_id query parameter is required' }, { status: 400 })
    }

    const storyboards = await db.storyboard.findMany({
      where: { project_id },
      include: { scenes: { orderBy: [{ part_number: 'asc' }, { scene_number: 'asc' }] } },
      orderBy: { created_at: 'desc' },
    })

    // Return the first (most recent) storyboard with scenes
    const storyboard = storyboards[0] || null
    return NextResponse.json({ storyboard, scenes: storyboard?.scenes || [] })
  } catch (error) {
    console.error('Error fetching storyboards:', error)
    return NextResponse.json({ error: 'Failed to fetch storyboards' }, { status: 500 })
  }
}

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

    // Get script from project config
    const config = JSON.parse(project.config_json || '{}')
    const script = config.script ? JSON.stringify(config.script) : 'No script available'

    let promptTemplate = await getPromptTemplate('storyboard')
    if (!promptTemplate) {
      promptTemplate = DEFAULT_STORYBOARD_PROMPT
    }

    const systemPrompt = promptTemplate
      .replace('{content_type}', project.content_type)
      .replace('{language}', project.language)
      .replace('{duration_seconds}', String(project.duration_seconds))
      .replace('{aspect_ratio}', project.aspect_ratio)
      .replace('{visual_style}', project.visual_style)
      .replace(/{script}/g, script)

    const llmResponse = await callLLM(provider, [
      { role: 'system', content: 'You are a professional storyboard artist. Always respond with valid JSON only.' },
      { role: 'user', content: systemPrompt },
    ], { temperature: 0.7, response_format: { type: 'json_object' } })

    const storyboardData = parseJSONFromLLM(llmResponse) as {
      title: string
      duration_total: number
      format: string
      music_style?: string
      scenes: Array<{
        part_number: number
        scene_number: number
        start_time: number
        end_time: number
        duration: number
        action: string
        vo: string
        visual_description: string
        scene_goal: string
      }>
    }

    // Create storyboard in database
    const storyboard = await db.storyboard.create({
      data: {
        project_id,
        title: storyboardData.title || 'Untitled Storyboard',
        duration_total: storyboardData.duration_total || project.duration_seconds,
        format: storyboardData.format || project.aspect_ratio,
        music_style: storyboardData.music_style || null,
        raw_json: JSON.stringify(storyboardData),
      },
    })

    // Create scenes
    const scenesData = (storyboardData.scenes || []).map((scene, index) => ({
      project_id,
      storyboard_id: storyboard.id,
      part_number: scene.part_number || 1,
      scene_number: scene.scene_number || index + 1,
      start_time: scene.start_time ?? 0,
      end_time: scene.end_time ?? scene.duration ?? 3,
      duration: scene.duration ?? 3,
      action: scene.action || null,
      vo: scene.vo || null,
      visual_description: scene.visual_description || null,
      scene_goal: scene.scene_goal || null,
      image_prompt: ensureImagePrompt((scene as any).image_prompt, scene),
      negative_prompt: (scene as any).negative_prompt || DEFAULT_NEGATIVE_PROMPT,
    }))

    const scenes = await db.scene.createMany({
      data: scenesData,
    })

    // Update project status
    await db.project.update({
      where: { id: project_id },
      data: { status: 'storyboard_ready' },
    })

    // Fetch the complete storyboard with scenes
    const result = await db.storyboard.findUnique({
      where: { id: storyboard.id },
      include: { scenes: { orderBy: [{ part_number: 'asc' }, { scene_number: 'asc' }] } },
    })

    return NextResponse.json({ storyboard: result, scenesCreated: scenes.count }, { status: 201 })
  } catch (error) {
    console.error('Error generating storyboard:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate storyboard' },
      { status: 500 }
    )
  }
}
