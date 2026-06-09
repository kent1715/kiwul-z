import { db } from '@/lib/db'
import { getLLMProvider, callLLM, parseJSONFromLLM, getPromptTemplate } from '@/lib/llm'
import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_MOTION_PROMPT_TEMPLATE = `You are an expert AI video motion prompt engineer. Generate motion prompts for image-to-video generation.

Visual Style: {visual_style}
Duration per scene: 3-5 seconds

Characters:
{characters}

Scenes to generate motion prompts for:
{scenes}

For each scene, generate a motion prompt that describes how the still image should animate:
{
  "scenes": [
    {
      "scene_id": "scene id",
      "motion_prompt": "Description of camera movement, character motion, and environmental dynamics. Be specific about direction, speed, and type of movement."
    }
  ]
}

Motion prompt guidelines:
- Describe camera movements: pan left/right, tilt up/down, zoom in/out, dolly, tracking
- Describe character movements: walking, turning head, gesturing, expression changes
- Describe environmental dynamics: wind, water flow, light changes, particle effects
- Keep prompts concise but specific (1-3 sentences)
- Avoid describing things not visible in the source image
Return ONLY valid JSON.`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id, scene_ids } = body

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

    // Get scenes
    const whereClause: Record<string, unknown> = { project_id }
    if (scene_ids && scene_ids.length > 0) {
      whereClause.id = { in: scene_ids }
    }

    const scenes = await db.scene.findMany({
      where: whereClause,
      orderBy: [{ part_number: 'asc' }, { scene_number: 'asc' }],
    })

    if (scenes.length === 0) {
      return NextResponse.json({ error: 'No scenes found for this project' }, { status: 404 })
    }

    // Get characters
    const characters = await db.character.findMany({ where: { project_id } })
    const charactersText = characters.map((c) =>
      `- ${c.name}: ${c.visual_consistency_prompt || c.description || 'No description'}`
    ).join('\n')

    // Build scenes text with image prompts
    const scenesText = scenes.map((s) =>
      `Scene ${s.part_number}.${s.scene_number} (id: ${s.id}): ${s.visual_description || s.action || 'No description'} | Image Prompt: ${s.image_prompt || 'Not generated yet'}`
    ).join('\n')

    let promptTemplate = await getPromptTemplate('motion')
    if (!promptTemplate) {
      promptTemplate = DEFAULT_MOTION_PROMPT_TEMPLATE
    }

    const systemPrompt = promptTemplate
      .replace('{visual_style}', project.visual_style)
      .replace('{characters}', charactersText || 'No characters defined')
      .replace('{scenes}', scenesText)

    const llmResponse = await callLLM(provider, [
      { role: 'system', content: 'You are an expert AI video motion prompt engineer. Always respond with valid JSON only.' },
      { role: 'user', content: systemPrompt },
    ], { temperature: 0.6, response_format: { type: 'json_object' } })

    const parsed = parseJSONFromLLM(llmResponse) as {
      scenes: Array<{
        scene_id: string
        motion_prompt: string
      }>
    }

    const promptResults = parsed.scenes || (Array.isArray(parsed) ? parsed : [parsed])

    // Update scenes with generated motion prompts
    const updatePromises = promptResults.map((result) => {
      if (result.scene_id) {
        return db.scene.update({
          where: { id: result.scene_id },
          data: {
            motion_prompt: result.motion_prompt || null,
          },
        })
      }
      return Promise.resolve(null)
    })

    await Promise.all(updatePromises)

    // Fetch updated scenes
    const updatedScenes = await db.scene.findMany({
      where: whereClause,
      orderBy: [{ part_number: 'asc' }, { scene_number: 'asc' }],
    })

    return NextResponse.json({ scenes: updatedScenes, prompts: promptResults })
  } catch (error) {
    console.error('Error generating motion prompts:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate motion prompts' },
      { status: 500 }
    )
  }
}
