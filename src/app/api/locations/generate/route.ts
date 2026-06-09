import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProviderConfig, generateJSON } from '@/server/providers'
import { ensureProjectDirs } from '@/server/storage'
import type { LLMConfig } from '@/server/providers/provider.types'

export async function POST(request: NextRequest) {
  try {
    const { project_id } = await request.json()
    if (!project_id) return NextResponse.json({ error: 'project_id is required' }, { status: 400 })

    const project = await db.project.findUnique({ where: { id: project_id } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    ensureProjectDirs(project_id)

    const llmConfig = await getProviderConfig<LLMConfig>('llm')
    if (!llmConfig || !llmConfig.enabled) {
      return NextResponse.json({ error: 'No active LLM provider' }, { status: 400 })
    }

    const storyline = project.storyline_json && project.storyline_json !== '{}'
      ? JSON.parse(project.storyline_json)
      : null

    // Use a location-specific prompt template if available, otherwise construct one
    const template = await db.promptTemplate.findFirst({ where: { type: 'location', is_default: true } })

    let prompt: string
    if (template) {
      prompt = template.template
        .replace(/{content_type}/g, project.content_type)
        .replace(/{visual_style}/g, project.visual_style)
        .replace(/{aspect_ratio}/g, project.aspect_ratio)
        .replace(/{storyline}/g, storyline ? JSON.stringify(storyline) : project.title)
    } else {
      prompt = `You are a location designer for short-form vertical video content.

Project Details:
- Content Type: ${project.content_type}
- Visual Style: ${project.visual_style}
- Aspect Ratio: ${project.aspect_ratio}

Storyline:
${storyline ? JSON.stringify(storyline) : project.title}

Create 3-5 locations that appear in this content. Return JSON:
{
  "locations": [
    {
      "name": "Location Name",
      "description": "Detailed description of the location including architecture, furniture, colors, atmosphere",
      "visual_style": "Visual style for image generation (e.g., warm indoor, modern minimalist, rustic outdoor)",
      "lighting": "Lighting description (e.g., warm golden hour, soft diffused indoor lighting, dramatic spotlight)",
      "camera_style": "Camera style suggestion (e.g., wide establishing shot, close-up detail)",
      "consistency_prompt": "A short consistency prompt for maintaining location appearance across scenes"
    }
  ]
}

Make descriptions detailed enough for AI image generation.
CRITICAL: Return ONLY valid JSON. No markdown. No comments. No trailing commas.`
    }

    const result = await generateJSON(llmConfig, 'You are a location designer for video content. Return only valid JSON.', prompt)

    const locsData = (result as any)?.locations || (Array.isArray(result) ? result : [result])

    // Delete existing locations for this project
    await db.location.deleteMany({ where: { project_id } })

    const locations: any[] = []
    for (const loc of locsData) {
      const created = await db.location.create({
        data: {
          project_id,
          name: loc.name || 'Unnamed Location',
          description: loc.description || null,
          visual_style: loc.visual_style || null,
          lighting: loc.lighting || null,
          camera_style: loc.camera_style || null,
          consistency_prompt: loc.consistency_prompt || null,
          raw_json: JSON.stringify(loc),
        },
      })
      locations.push(created)
    }

    return NextResponse.json({ locations })
  } catch (error: any) {
    console.error('Error generating locations:', error)
    return NextResponse.json({ error: error.message || 'Failed to generate locations' }, { status: 500 })
  }
}
