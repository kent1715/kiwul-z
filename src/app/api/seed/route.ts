import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

const DEFAULT_PROVIDERS = [
  {
    type: 'llm',
    name: 'Ollama',
    base_url: 'http://127.0.0.1:11434/v1',
    model: 'qwen3:8b',
    config_json: JSON.stringify({ temperature: 0.7, max_tokens: 8192 }),
    is_default: true,
    is_active: true,
  },
  {
    type: 'image',
    name: 'Z-Image',
    base_url: 'http://127.0.0.1:9100/v1',
    model: 'z-image-turbo',
    config_json: JSON.stringify({ default_size: '768x1024', steps: 8, cfg: 1 }),
    is_default: true,
    is_active: true,
  },
  {
    type: 'video',
    name: 'LTX-ComfyUI',
    base_url: 'http://127.0.0.1:9200/v1',
    model: 'comfy-ltxv-i2v',
    config_json: JSON.stringify({ duration: 3, fps: 24, resolution: '768x1024', motion_strength: 0.05 }),
    is_default: true,
    is_active: true,
  },
  {
    type: 'tts',
    name: 'Edge-TTS',
    base_url: '',
    model: 'id-ID-ArdiNeural',
    config_json: JSON.stringify({ provider: 'edge', voice: 'id-ID-ArdiNeural', speed: 1.0 }),
    is_default: true,
    is_active: true,
  },
  {
    type: 'tts',
    name: 'F5-TTS',
    base_url: 'http://127.0.0.1:9880',
    model: null,
    config_json: JSON.stringify({ provider: 'f5tts', voice: 'indonesian_female', speed: 1.0 }),
    is_default: false,
    is_active: false,
  },
  {
    type: 'render',
    name: 'FFmpeg',
    base_url: 'ffmpeg',
    model: null,
    config_json: JSON.stringify({ path: 'ffmpeg', output_format: 'mp4' }),
    is_default: true,
    is_active: true,
  },
]

const DEFAULT_PROMPT_TEMPLATES = [
  {
    type: 'idea',
    name: 'Default Idea Generator',
    template: `You are a creative content strategist for short-form vertical video (TikTok/Reels/Shorts).

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

Generate 3 creative content ideas. Return a JSON object:
{
  "ideas": [
    {
      "title": "Catchy title",
      "hook": "Attention-grabbing opening (1-2 sentences)",
      "angle": "Unique angle or perspective",
      "conflict_or_value": "Core conflict or value proposition",
      "visual_potential": "How visually engaging this idea is (high/medium/low)",
      "estimated_duration": 45
    }
  ]
}

CRITICAL: Return ONLY valid JSON. No markdown. No comments. No trailing commas.`,
    is_default: true,
  },
  {
    type: 'storyline',
    name: 'Default Storyline Generator',
    template: `You are a storytelling expert for short-form vertical video content.

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

Create a storyline. Return JSON:
{
  "title": "Storyline Title",
  "hook": "Opening hook that grabs attention",
  "core_question": "The central question or tension",
  "story_angle": "The narrative perspective",
  "opening": "How the story opens - set the scene and hook",
  "middle": "Development and escalation",
  "ending": "Resolution, twist, or call to action",
  "cta": "Call to action for the viewer",
  "emotional_arc": "Description of emotional journey",
  "visual_arc": "Description of visual progression"
}

Write in {language}. Be creative and specific.
CRITICAL: Return ONLY valid JSON. No markdown. No comments. No trailing commas.`,
    is_default: true,
  },
  {
    type: 'script',
    name: 'Default Script Generator',
    template: `You are a professional scriptwriter for short-form vertical video content.

Project Details:
- Content Type: {content_type}
- Language: {language}
- Duration: {duration_seconds} seconds
- Visual Style: {visual_style}
- Tone: {tone}

Storyline:
{storyline}

Create a script broken into parts and scenes. Return JSON:
{
  "title": "Script Title",
  "parts": [
    {
      "part_number": 1,
      "part_title": "Hook",
      "scenes": [
        {
          "scene_number": 1,
          "duration": 3,
          "action": "What happens visually on screen",
          "vo": "Voice-over narration text in {language}",
          "visual_description": "Detailed visual description for image generation - be very specific about composition, lighting, camera angle, subject pose",
          "scene_goal": "What this scene achieves in the story"
        }
      ]
    }
  ]
}

Rules:
- Total scene durations MUST add up to approximately {duration_seconds} seconds
- Each scene should be 3-5 seconds for short-form content
- VO text should be concise and fit the scene duration (about 2-3 words per second)
- Visual descriptions must be detailed enough for AI image generation
- Write VO in {language}

CRITICAL: Return ONLY valid JSON. No markdown. No comments. No trailing commas.`,
    is_default: true,
  },
  {
    type: 'storyboard',
    name: 'Default Storyboard Generator',
    template: `You are a professional storyboard artist for short-form vertical video.

Project Details:
- Content Type: {content_type}
- Language: {language}
- Duration: {duration_seconds} seconds
- Aspect Ratio: {aspect_ratio}
- Visual Style: {visual_style}

Characters:
{characters}

Locations:
{locations}

Script:
{script}

Create a detailed storyboard. Return JSON:
{
  "title": "Storyboard Title",
  "duration_total": {duration_seconds},
  "format": "{aspect_ratio}",
  "music_style": "suggested background music style",
  "scenes": [
    {
      "part_number": 1,
      "scene_number": 1,
      "start_time": 0,
      "end_time": 3,
      "duration": 3,
      "action": "Visual action description",
      "vo": "Voice-over text in {language}",
      "visual_description": "Detailed visual for image generation",
      "scene_goal": "Purpose of this scene",
      "camera": "slow push-in / static / pan left / etc",
      "character_ids": ["char_001"],
      "location_id": "loc_001"
    }
  ]
}

Rules:
- Every scene MUST have visual_description, action, and vo
- Scene durations should be 3-5 seconds each
- Total duration must be approximately {duration_seconds} seconds
- Assign character_ids and location_id where relevant
- Camera movements should be conservative: slow push-in, static, gentle pan

CRITICAL: Return ONLY valid JSON. No markdown. No comments. No trailing commas.`,
    is_default: true,
  },
  {
    type: 'character',
    name: 'Default Character Generator',
    template: `You are a character designer for short-form vertical video content.

Project Details:
- Content Type: {content_type}
- Language: {language}
- Visual Style: {visual_style}
- Storyline: {storyline}

Script Summary:
{script_summary}

Create 1-3 characters. Return JSON:
{
  "characters": [
    {
      "name": "Character Name",
      "role": "main / supporting",
      "description": "Brief character description",
      "gender": "male/female",
      "age_range": "25-30",
      "ethnicity_style": "Specific ethnicity or cultural style",
      "face_description": "Detailed facial features - face shape, eyes, nose, lips, skin tone",
      "hair_or_hijab": "Hairstyle or hijab description",
      "outfit": "Detailed clothing and accessories",
      "body_type": "Body type and build",
      "personality": "Personality traits",
      "visual_prompt": "Complete prompt for consistent image generation: [Style] + [Subject] + [Appearance] + [Outfit] + [Pose] + [Lighting] + [Quality tags]",
      "negative_prompt": "blurry, distorted face, bad anatomy, extra fingers, text, watermark, deformed, disfigured",
      "visual_consistency_prompt": "same face, same hairstyle, same outfit, same body proportion, consistent identity"
    }
  ]
}

Rules:
- visual_prompt must be detailed and specific for AI image generation
- Each character must have visual_consistency_prompt for cross-scene consistency
- Write descriptions in English regardless of project language
- visual_prompt should include quality tags like "cinematic, realistic, high detail, DSLR"

CRITICAL: Return ONLY valid JSON. No markdown. No comments. No trailing commas.`,
    is_default: true,
  },
  {
    type: 'image',
    name: 'Default Image Prompt Generator',
    template: `You are an expert AI image prompt engineer. Generate detailed image prompts for each scene.

Visual Style: {visual_style}
Aspect Ratio: {aspect_ratio}
Resolution: {resolution}

Characters:
{characters}

Locations:
{locations}

Scenes:
{scenes}

For each scene, generate image and motion prompts. Return JSON:
{
  "scenes": [
    {
      "scene_id": "scene id from input",
      "image_prompt": "cinematic realistic vertical frame, high detail, natural lighting, DSLR raw photo look, [character description], [action], [location], [camera angle], [lighting mood], consistent character identity, realistic anatomy, stable composition",
      "negative_prompt": "blurry, low quality, distorted face, bad anatomy, extra fingers, missing fingers, deformed hands, duplicate body, text, watermark, logo, oversaturated, cartoon",
      "motion_prompt": "Create subtle natural motion appropriate to the visible subject and environment. Follow the scene action. Animate only elements already visible in the image. Preserve subject identity, object shape, background, lighting, colors, camera angle, and composition. No new objects, no morphing, no stretching, no melting, no swelling, no warping, no flicker., slight head movement, small environmental movement, stable anatomy, consistent identity, no scene change, no morphing, no distortion"
    }
  ]
}

Image prompt formula: [Style] + [Character with consistency] + [Location] + [Action] + [Object] + [Camera] + [Lighting] + [Mood] + [Quality] + [Consistency tags]

Motion prompt rules for LTX:
- Keep motion SUBTLE and STABLE
- Default: "Create subtle natural motion appropriate to the visible subject and environment. Follow the scene action. Animate only elements already visible in the image. Preserve subject identity, object shape, background, lighting, colors, camera angle, and composition. No new objects, no morphing, no stretching, no melting, no swelling, no warping, no flicker., slight head movement, small environmental movement, stable anatomy, consistent identity, no scene change, no morphing, no distortion"
- Avoid: fast zoom, aggressive pan, complex hand gestures, scene transitions, morphing
- Maximum 2-3 motion elements per prompt

CRITICAL: Return ONLY valid JSON. No markdown. No comments. No trailing commas.`,
    is_default: true,
  },
]

export async function POST() {
  try {
    const providerResults: any[] = []
    for (const providerData of DEFAULT_PROVIDERS) {
      const existing = await db.provider.findFirst({
        where: { type: providerData.type, name: providerData.name },
      })
      if (existing) {
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
        const created = await db.provider.create({ data: providerData })
        providerResults.push({ action: 'created', provider: created })
      }
    }

    const templateResults: any[] = []
    for (const templateData of DEFAULT_PROMPT_TEMPLATES) {
      const existing = await db.promptTemplate.findFirst({
        where: { type: templateData.type, name: templateData.name },
      })
      if (existing) {
        const updated = await db.promptTemplate.update({
          where: { id: existing.id },
          data: { template: templateData.template, is_default: templateData.is_default },
        })
        templateResults.push({ action: 'updated', template: updated })
      } else {
        const created = await db.promptTemplate.create({ data: templateData })
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
