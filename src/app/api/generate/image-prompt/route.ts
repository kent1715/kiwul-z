import { db } from '@/lib/db'
import { getLLMProvider, callLLM, parseJSONFromLLM, getPromptTemplate } from '@/lib/llm'
import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_IMAGE_PROMPT_TEMPLATE = `You are an expert AI image prompt engineer. Generate detailed image prompts for each scene in this storyboard.

Visual Style: {visual_style}
Aspect Ratio: {aspect_ratio}
Resolution: {resolution}

Characters:
{characters}

Locations:
{locations}

Scenes to generate prompts for:
{scenes}

For each scene, generate:
{
  "scenes": [
    {
      "scene_id": "scene id",
      "image_prompt": "Highly detailed image generation prompt including subject, composition, lighting, style, camera angle. Be specific and descriptive.",
      "negative_prompt": "Things to avoid: blurry, low quality, distorted, etc."
    }
  ]
}

Make prompts specific and detailed for AI image generation.

MANDATORY CONSISTENCY RULES:
- Every image_prompt must include relevant character.visual_consistency_prompt and character.visual_prompt details.
- Every image_prompt must include relevant location.consistency_prompt, location.visual_style, and location.lighting details.
- Preserve character identity, outfit, face/hair/hijab, body type, and visual style across scenes.
- Preserve location layout, atmosphere, lighting, and camera style across scenes.
- Do not output file paths.
- The final image_prompt must be visual-only: no VO, no Goal, no metadata, no JSON explanation. Include character descriptions, poses, expressions, clothing, and environment details.
Each prompt should be self-contained and specific enough to generate a consistent image.
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
      [
        `Character: ${c.name}`,
        c.role ? `Role: ${c.role}` : null,
        c.description ? `Description: ${c.description}` : null,
        c.gender ? `Gender: ${c.gender}` : null,
        c.age_range ? `Age range: ${c.age_range}` : null,
        c.ethnicity_style ? `Ethnicity/style: ${c.ethnicity_style}` : null,
        c.face_description ? `Face: ${c.face_description}` : null,
        c.hair_or_hijab ? `Hair/Hijab: ${c.hair_or_hijab}` : null,
        c.outfit ? `Outfit: ${c.outfit}` : null,
        c.body_type ? `Body type: ${c.body_type}` : null,
        c.visual_consistency_prompt ? `VISUAL CONSISTENCY PROMPT: ${c.visual_consistency_prompt}` : null,
        c.visual_prompt ? `VISUAL PROMPT: ${c.visual_prompt}` : null,
        c.reference_image_path ? `Reference image exists at: ${c.reference_image_path}. Use it only as textual consistency context; do not mention file paths in final image_prompt.` : null,
      ].filter(Boolean).join('\n')
    ).join('\n\n')

    // Get locations
    const locations = await db.location.findMany({ where: { project_id } })
    const locationsText = locations.map((l) =>
      [
        `Location: ${l.name}`,
        l.description ? `Description: ${l.description}` : null,
        l.consistency_prompt ? `LOCATION CONSISTENCY PROMPT: ${l.consistency_prompt}` : null,
        l.visual_style ? `VISUAL STYLE: ${l.visual_style}` : null,
        l.lighting ? `LIGHTING: ${l.lighting}` : null,
        l.camera_style ? `CAMERA STYLE: ${l.camera_style}` : null,
        l.reference_image_path ? `Reference image exists at: ${l.reference_image_path}. Use it only as textual consistency context; do not mention file paths in final image_prompt.` : null,
      ].filter(Boolean).join('\n')
    ).join('\n\n')

    // Build scenes text
    const scenesText = scenes.map((s) =>
      `Scene ${s.part_number}.${s.scene_number} (id: ${s.id}): ${s.visual_description || s.action || 'No description'} | VO: ${s.vo || 'None'} | Goal: ${s.scene_goal || 'None'}`
    ).join('\n')

    let promptTemplate = await getPromptTemplate('image')
    if (!promptTemplate) {
      promptTemplate = DEFAULT_IMAGE_PROMPT_TEMPLATE
    }

    const systemPrompt = promptTemplate
      .replace('{visual_style}', project.visual_style)
      .replace('{aspect_ratio}', project.aspect_ratio)
      .replace('{resolution}', project.resolution)
      .replace('{characters}', charactersText || 'No characters defined')
      .replace('{locations}', locationsText || 'No locations defined')
      .replace('{scenes}', scenesText)

    const llmResponse = await callLLM(provider, [
      { role: 'system', content: 'You are an expert AI image prompt engineer. Always respond with valid JSON only.' },
      { role: 'user', content: systemPrompt },
    ], { temperature: 0.6, response_format: { type: 'json_object' } })

    const parsed = parseJSONFromLLM(llmResponse) as {
      scenes: Array<{
        scene_id: string
        image_prompt: string
        negative_prompt: string
      }>
    }

    const promptResults = parsed.scenes || (Array.isArray(parsed) ? parsed : [parsed])

    // Update scenes with generated prompts
    const updatePromises = promptResults.map((result) => {
      if (result.scene_id) {
        return db.scene.update({
          where: { id: result.scene_id },
          data: {
            image_prompt: result.image_prompt || null,
            negative_prompt: result.negative_prompt || null,
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
    console.error('Error generating image prompts:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate image prompts' },
      { status: 500 }
    )
  }
}

