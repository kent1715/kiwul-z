import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

const DEFAULT_PROVIDERS = [
  {
    type: 'llm',
    name: 'Ollama',
    base_url: 'http://127.0.0.1:11434/v1',
    model: 'qwen3:8b',
    config_json: '{}',
    is_default: true,
    is_active: true,
  },
  {
    type: 'image',
    name: 'Z-Image',
    base_url: 'http://127.0.0.1:9100/v1',
    model: 'z-image-turbo',
    config_json: '{}',
    is_default: true,
    is_active: true,
  },
  {
    type: 'tts',
    name: 'F5-TTS',
    base_url: 'http://127.0.0.1:9880',
    model: null,
    config_json: '{"voice":"indonesian_female"}',
    is_default: true,
    is_active: true,
  },
  {
    type: 'video',
    name: 'LTX/ComfyUI',
    base_url: 'http://127.0.0.1:9200/v1',
    model: 'comfy-ltxv-i2v',
    config_json: '{}',
    is_default: true,
    is_active: true,
  },
  {
    type: 'render',
    name: 'FFmpeg',
    base_url: 'ffmpeg',
    model: null,
    config_json: '{"path":"ffmpeg"}',
    is_default: true,
    is_active: true,
  },
]

const DEFAULT_PROMPT_TEMPLATES = [
  {
    type: 'idea',
    name: 'Default Idea Generator',
    template: `You are a creative content strategist. Generate {count} creative content ideas for a short video project.

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

Return a JSON object with an "ideas" array. Each idea should have:
- title: A catchy title for the content idea
- hook: An attention-grabbing opening hook (1-2 sentences)
- angle: The unique angle or perspective of this idea
- content_type: The specific content format

Return ONLY valid JSON.`,
    is_default: true,
  },
  {
    type: 'storyline',
    name: 'Default Storyline Generator',
    template: `You are a storytelling expert for short-form video content. Create a compelling storyline for this project.

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

Write the storyline as flowing narrative prose in {language}. Be creative and specific.`,
    is_default: true,
  },
  {
    type: 'script',
    name: 'Default Script Generator',
    template: `You are a professional scriptwriter for short-form video content. Create a detailed script for this project.

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
Return ONLY valid JSON.`,
    is_default: true,
  },
  {
    type: 'storyboard',
    name: 'Default Storyboard Generator',
    template: `You are a professional storyboard artist for short-form video content. Create a detailed storyboard for this project.

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
Return ONLY valid JSON.`,
    is_default: true,
  },
  {
    type: 'character',
    name: 'Default Character Generator',
    template: `You are a character designer for short-form video content. Create detailed character bibles for this project.

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
Return ONLY valid JSON.`,
    is_default: true,
  },
  {
    type: 'image',
    name: 'Default Image Prompt Generator',
    template: `You are an expert AI image prompt engineer. Generate detailed image prompts for each scene in this storyboard.

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

Make prompts specific and detailed for AI image generation. Include character descriptions, poses, expressions, clothing, and environment details.
Each prompt should be self-contained and specific enough to generate a consistent image.
Return ONLY valid JSON.`,
    is_default: true,
  },
  {
    type: 'motion',
    name: 'Default Motion Prompt Generator',
    template: `You are an expert AI video motion prompt engineer. Generate motion prompts for image-to-video generation.

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
Return ONLY valid JSON.`,
    is_default: true,
  },
]

export async function POST() {
  try {
    // Seed providers
    const providerResults = []
    for (const providerData of DEFAULT_PROVIDERS) {
      // Check if provider already exists
      const existing = await db.provider.findFirst({
        where: { type: providerData.type, name: providerData.name },
      })

      if (existing) {
        // Update existing provider
        const updated = await db.provider.update({
          where: { id: existing.id },
          data: {
            base_url: providerData.base_url,
            model: providerData.model,
            config_json: providerData.config_json,
            is_default: providerData.is_default,
            is_active: providerData.is_active,
          },
        })
        providerResults.push({ action: 'updated', provider: updated })
      } else {
        // Create new provider
        const created = await db.provider.create({
          data: providerData,
        })
        providerResults.push({ action: 'created', provider: created })
      }
    }

    // Seed prompt templates
    const templateResults = []
    for (const templateData of DEFAULT_PROMPT_TEMPLATES) {
      const existing = await db.promptTemplate.findFirst({
        where: { type: templateData.type, name: templateData.name },
      })

      if (existing) {
        const updated = await db.promptTemplate.update({
          where: { id: existing.id },
          data: {
            template: templateData.template,
            is_default: templateData.is_default,
          },
        })
        templateResults.push({ action: 'updated', template: updated })
      } else {
        const created = await db.promptTemplate.create({
          data: templateData,
        })
        templateResults.push({ action: 'created', template: created })
      }
    }

    return NextResponse.json({
      message: 'Seed completed successfully',
      providers: providerResults,
      templates: templateResults,
    })
  } catch (error) {
    console.error('Error seeding database:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to seed database' },
      { status: 500 }
    )
  }
}
