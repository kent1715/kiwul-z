import { db } from '@/lib/db'
import { getLLMProvider, callLLM, parseJSONFromLLM, getPromptTemplate } from '@/lib/llm'
import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_CHARACTER_PROMPT = `You are a character designer for short-form video content. Create detailed character bibles for this project.

Project Details:
- Content Type: {content_type}
- Language: {language}
- Visual Style: {visual_style}
- Storyline: {storyline}

Script Summary:
{script_summary}

Create 2-4 characters that appear in this content. For each character, provide:
{
  "characters": [
    {
      "name": "Character Name",
      "description": "Brief character description and role",
      "gender": "male/female/other",
      "age_range": "e.g. 25-30",
      "ethnicity_style": "Ethnicity or cultural style",
      "face_description": "Detailed facial features description",
      "hair_or_hijab": "Hair style or hijab description",
      "outfit": "Clothing and accessories description",
      "body_type": "Body type description",
      "personality": "Personality traits",
      "visual_prompt": "Complete visual prompt for consistent image generation",
      "negative_prompt": "Things to avoid in generation",
      "visual_consistency_prompt": "A short consistency prompt for maintaining character appearance across scenes"
    }
  ]
}

Make visual prompts detailed enough for AI image generation. Include ethnicity, age, hairstyle, clothing, and distinctive features.
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
    const scriptSummary = config.script ? JSON.stringify(config.script).substring(0, 2000) : 'No script available'

    let promptTemplate = await getPromptTemplate('character')
    if (!promptTemplate) {
      promptTemplate = DEFAULT_CHARACTER_PROMPT
    }

    const systemPrompt = promptTemplate
      .replace('{content_type}', project.content_type)
      .replace('{language}', project.language)
      .replace('{visual_style}', project.visual_style)
      .replace('{storyline}', storyline)
      .replace('{script_summary}', scriptSummary)

    const llmResponse = await callLLM(provider, [
      { role: 'system', content: 'You are an expert character designer for AI-generated video content. Always respond with valid JSON only.' },
      { role: 'user', content: systemPrompt },
    ], { temperature: 0.7, response_format: { type: 'json_object' } })

    const parsed = parseJSONFromLLM(llmResponse) as {
      characters: Array<{
        name: string
        description?: string
        gender?: string
        age_range?: string
        ethnicity_style?: string
        face_description?: string
        hair_or_hijab?: string
        outfit?: string
        body_type?: string
        personality?: string
        visual_prompt?: string
        negative_prompt?: string
        visual_consistency_prompt?: string
      }>
    }

    const charactersList = parsed.characters || (Array.isArray(parsed) ? parsed : [parsed])

    // Store characters in database
    const createdCharacters = await Promise.all(
      charactersList.map((char) =>
        db.character.create({
          data: {
            project_id,
            name: char.name || 'Unnamed Character',
            description: char.description || null,
            gender: char.gender || null,
            age_range: char.age_range || null,
            ethnicity_style: char.ethnicity_style || null,
            face_description: char.face_description || null,
            hair_or_hijab: char.hair_or_hijab || null,
            outfit: char.outfit || null,
            body_type: char.body_type || null,
            personality: char.personality || null,
            visual_prompt: char.visual_prompt || null,
            negative_prompt: char.negative_prompt || null,
            visual_consistency_prompt: char.visual_consistency_prompt || null,
            raw_json: JSON.stringify(char),
          },
        })
      )
    )

    // Update project status
    await db.project.update({
      where: { id: project_id },
      data: { status: 'character_ready' },
    })

    return NextResponse.json({ characters: createdCharacters })
  } catch (error) {
    console.error('Error generating characters:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate characters' },
      { status: 500 }
    )
  }
}
