import { db } from '@/lib/db'
import { generateJSON, getProviderConfig } from '@/server/providers'
import type { LLMConfig } from '@/server/providers/provider.types'

type ScenePlan = {
  target_duration: number
  scene_count: number
  part_count: number
  durations: number[]
  instruction: string
}

function buildScenePlan(targetSeconds: number): ScenePlan {
  const target = Math.max(15, Math.min(600, Number(targetSeconds) || 60))

  const avg =
    target <= 30 ? 4 :
    target <= 60 ? 5 :
    target <= 90 ? 5 :
    target <= 180 ? 7 :
    target <= 300 ? 9 :
    10

  const minScenes =
    target <= 30 ? 6 :
    target <= 60 ? 10 :
    target <= 90 ? 14 :
    target <= 180 ? 20 :
    target <= 300 ? 32 :
    45

  const maxScenes =
    target <= 30 ? 8 :
    target <= 60 ? 14 :
    target <= 90 ? 18 :
    target <= 180 ? 30 :
    target <= 300 ? 45 :
    70

  let sceneCount = Math.round(target / avg)
  sceneCount = Math.max(minScenes, Math.min(maxScenes, sceneCount))

  const base = Math.floor(target / sceneCount)
  const remainder = target - base * sceneCount
  const durations = Array.from({ length: sceneCount }, (_, i) => base + (i < remainder ? 1 : 0))

  const partCount =
    target <= 60 ? 1 :
    target <= 180 ? 3 :
    target <= 300 ? 5 :
    6

  return {
    target_duration: target,
    scene_count: sceneCount,
    part_count: partCount,
    durations,
    instruction:
      `Create exactly ${sceneCount} scenes across ${partCount} part(s). ` +
      `Use these exact scene durations in order: ${durations.join(', ')} seconds. ` +
      `Total duration must be ${target} seconds.`
  }
}

function getTopicSafetyNotes(project: any): string {
  const topic = `${project.topic || ''} ${project.title || ''}`.toLowerCase()

  if (
    topic.includes('laut') ||
    topic.includes('samudra') ||
    topic.includes('ocean') ||
    topic.includes('sea')
  ) {
    return `
TOPIC-SPECIFIC SCIENCE SAFETY NOTES FOR OCEAN / DEEP SEA:
1. Do not claim that pressure blocks, crushes, or absorbs light. Darkness in deep water is mainly caused by absorption and scattering of sunlight by water and particles.
2. Do not claim that dolphins are common bioluminescent deep-sea animals.
3. Prefer visual anchors such as ROV, submersible lamp, depth meter, color card, suspended particles, anglerfish, jellyfish, plankton, hydrothermal vent, tube worms, and dark water column.
4. Avoid unsafe exact claims like "1-2% of species" unless the source is provided.
5. For deep ocean darkness, prioritize: red light absorbed first, blue light travels farther, sunlight fades with depth, aphotic zone, bioluminescence, animal adaptation, chemosynthesis near vents.
`
  }

  return `
GENERAL SCIENCE SAFETY NOTES:
1. Do not invent precise numbers unless they are broadly safe and necessary.
2. Do not create facts that sound scientific but do not explain a real mechanism.
3. Prefer cause -> process -> visible effect.
4. If unsure, use approximate phrasing and avoid unsupported claims.
`
}

function getScenes(script: any): any[] {
  if (!script || typeof script !== 'object') return []

  const partScenes = Array.isArray(script.parts)
    ? script.parts.flatMap((part: any) => Array.isArray(part.scenes) ? part.scenes : [])
    : []

  const validPartScenes = partScenes.filter((scene: any) =>
    scene && typeof scene === 'object' && !Array.isArray(scene)
  )

  if (validPartScenes.length > 0) return validPartScenes

  if (Array.isArray(script.scenes)) {
    return script.scenes.filter((scene: any) =>
      scene && typeof scene === 'object' && !Array.isArray(scene)
    )
  }

  return []
}

function countWords(text: unknown): number {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length
}

function stringifyVisualDescription(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ')
  }

  return String(value)
}

function normalizeScriptShape(script: any, project: any, scenePlan: ScenePlan): any {
  if (!script || typeof script !== 'object') return script

  const sourceScenes = getScenes(script)
  const normalizedScenes = sourceScenes.slice(0, scenePlan.scene_count).map((scene: any, index: number) => {
    return {
      scene_number: index + 1,
      duration: scenePlan.durations[index] ?? Number(scene.duration || 5),
      fact_focus: String(scene.fact_focus || '').trim(),
      visual_anchor: String(scene.visual_anchor || '').trim(),
      action: String(scene.action || '').trim(),
      vo: String(scene.vo || '').trim(),
      visual_description: stringifyVisualDescription(scene.visual_description).trim(),
      scene_goal: String(scene.scene_goal || scene.goal || '').trim(),
    }
  })

  const existingPartTitle =
    Array.isArray(script.parts) &&
    script.parts[0] &&
    typeof script.parts[0].part_title === 'string'
      ? script.parts[0].part_title
      : `Fakta tentang ${project.topic || project.title || 'topik ini'}`

  const normalized: any = {
    ...script,
    title: script.title || project.title || project.topic || 'Untitled Script',
    language: script.language || project.language || 'id',
    target_duration: scenePlan.target_duration,
    parts: [
      {
        part_number: 1,
        part_title: existingPartTitle,
        scenes: normalizedScenes,
      }
    ],
  }

  delete normalized.scenes
  delete normalized.ending

  // Canonical script output: jangan simpan field liar dari LLM.
  // Ini generic, bukan hardcode topik.
  return {
    metadata: normalized.metadata || {},
    title: normalized.title || project.title || project.topic || 'Script',
    language: normalized.language || 'id',
    target_duration: normalized.target_duration || scenePlan.target_duration,
    parts: normalized.parts || []
  }
}

function getBriefFacts(factualBrief: any): any[] {
  if (!factualBrief || typeof factualBrief !== 'object') return []
  if (Array.isArray(factualBrief.facts)) return factualBrief.facts
  return []
}

function trimToWords(text: unknown, maxWords: number): string {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return words.join(' ')
  return words.slice(0, maxWords).join(' ')
}

function postFixScriptQuality(script: any, project: any, scenePlan: ScenePlan, factualBrief: any, visualBible: any): any {
  if (!script || typeof script !== 'object') return script

  const facts = getBriefFacts(factualBrief)
  let scenes = getScenes(script)

  // Fallback deterministic: jika LLM gagal membuat parts/scenes, bangun scene dari factual_brief
  if (scenes.length === 0 && facts.length > 0) {
    const fallbackTitle = project.topic || project.title || 'topik ini'

    script.title = script.title || project.title || project.topic || 'Script'
    script.language = 'id'
    script.target_duration = scenePlan.target_duration
    script.parts = [
      {
        part_number: 1,
        part_title: 'Fakta tentang ' + fallbackTitle,
        scenes: facts.slice(0, scenePlan.scene_count).map((fact: any, index: number) => ({
          scene_number: index + 1,
          duration: scenePlan.durations[index] ?? 5,
          fact_focus: String(fact.fact_focus || ('Fakta scene ' + (index + 1))).trim(),
          visual_anchor: String(fact.visual_anchor || fact.fact_focus || ('objek utama scene ' + (index + 1))).trim(),
          action: '',
          vo: String(fact.safe_explanation || fact.fact_focus || '').trim(),
          visual_description: '',
          scene_goal: ''
        }))
      }
    ]

    scenes = getScenes(script)
  }

  const usedAnchors = new Set<string>()

  const environment = visualBible?.environment || project.topic || project.title || 'lingkungan utama'
  const cameraStyle = visualBible?.camera_style || 'kamera dokumenter sinematik vertikal'
  const lightingStyle = visualBible?.lighting_style || 'pencahayaan realistis sesuai topik'
  const colorPalette = Array.isArray(visualBible?.color_palette)
    ? visualBible.color_palette.join(', ')
    : 'warna natural sesuai topik'

  for (let index = 0; index < scenes.length; index++) {
    const scene = scenes[index]
    const fact = facts[index] || {}
    const duration = scenePlan.durations[index] ?? Number(scene.duration || 5)
    const maxWords = Math.ceil(duration * 3)

    scene.scene_number = index + 1
    scene.duration = duration

    scene.fact_focus = String(
      fact.fact_focus ||
      scene.fact_focus ||
      ('Fakta utama scene ' + (index + 1))
    ).trim()

    let anchor = String(
      fact.visual_anchor ||
      scene.visual_anchor ||
      scene.fact_focus ||
      ('objek utama scene ' + (index + 1))
    ).trim()


    // Pastikan visual_anchor unik agar validator tidak gagal
    let anchorKey = anchor.toLowerCase().trim()
    if (usedAnchors.has(anchorKey)) {
      anchor = anchor + ' - ' + scene.fact_focus
      anchorKey = anchor.toLowerCase().trim()
    }

    usedAnchors.add(anchorKey)
    scene.visual_anchor = anchor

    const safeExplanation = String(fact.safe_explanation || '').trim()

    // Untuk script faktual, VO harus selalu sinkron dengan factual_brief.
    // Jangan pakai VO lama dari LLM karena bisa bergeser antar scene.
    scene.vo = trimToWords(safeExplanation || scene.fact_focus, maxWords)

    scene.action =
      'Tampilkan ' + scene.visual_anchor + ' di ' + environment +
      ', dengan gerakan kamera yang memperjelas fakta utama.'

    scene.visual_description =
      'Frame vertikal dokumenter sinematik, subjek utama ' + scene.visual_anchor +
      ', berada di ' + environment +
      ', komposisi fokus pada bukti visual dari fakta "' + scene.fact_focus +
      '", sudut kamera ' + cameraStyle +
      ', pencahayaan ' + lightingStyle +
      ', palet warna ' + colorPalette +
      ', detail lingkungan terlihat jelas, tekstur air atau ruang sekitar tampak nyata, tanpa teks overlay, tanpa elemen visual yang tidak relevan.'

    scene.scene_goal = 'Menjelaskan fakta: ' + scene.fact_focus
  }

  return normalizeScriptShape(script, project, scenePlan)
}

function validateScript(script: any, scenePlan: ScenePlan): string[] {
  const errors: string[] = []
  const scenes = getScenes(script)

  if (!script || typeof script !== 'object') {
    return ['Script is not a valid object']
  }

  if (!Array.isArray(script.parts)) {
    errors.push('Missing parts array')
  }

  if (Number(script.target_duration) !== scenePlan.target_duration) {
    errors.push(`target_duration must be ${scenePlan.target_duration}, got ${script.target_duration}`)
  }

  if (scenes.length !== scenePlan.scene_count) {
    errors.push(`scene count must be ${scenePlan.scene_count}, got ${scenes.length}`)
  }

  const totalDuration = scenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0)
  if (totalDuration !== scenePlan.target_duration) {
    errors.push(`total scene duration must be ${scenePlan.target_duration}, got ${totalDuration}`)
  }

  const factFocus = new Set<string>()
  const visualAnchors = new Set<string>()

  const bannedAbstractPhrases = [
    'kamera mendengar',
    'suara menghilang',
    'tekanan terlihat',
    'rasa takut terlihat',
    'misteri terlihat',
    'gelap menjadi misteri',
    'keindahan alam yang unik'
  ]

  const bannedWrongNiche = [
    'wajan',
    'panci',
    'dapur',
    'resep',
    'memasak',
    'kompor',
    'menggoreng'
  ]

  scenes.forEach((scene, index) => {
    const expectedDuration = scenePlan.durations[index]
    const n = Number(scene.scene_number || index + 1)

    if (Number(scene.duration) !== expectedDuration) {
      errors.push(`scene ${n}: duration must be ${expectedDuration}, got ${scene.duration}`)
    }

    if (!scene.fact_focus || typeof scene.fact_focus !== 'string') {
      errors.push(`scene ${n}: missing fact_focus`)
    } else {
      const key = scene.fact_focus.toLowerCase().trim()
      if (factFocus.has(key)) errors.push(`scene ${n}: duplicate fact_focus`)
      factFocus.add(key)
    }

    if (!scene.visual_anchor || typeof scene.visual_anchor !== 'string') {
      errors.push(`scene ${n}: missing visual_anchor`)
    } else {
      const key = scene.visual_anchor.toLowerCase().trim()
      if (visualAnchors.has(key)) errors.push(`scene ${n}: duplicate visual_anchor`)
      visualAnchors.add(key)
    }

    if (!scene.action || typeof scene.action !== 'string') {
      errors.push(`scene ${n}: missing action`)
    }

    if (!scene.vo || typeof scene.vo !== 'string') {
      errors.push(`scene ${n}: missing vo`)
    } else {
      const maxWords = Math.ceil(Number(scene.duration || expectedDuration || 5) * 3)
      const words = countWords(scene.vo)
      if (words > maxWords) {
        errors.push(`scene ${n}: VO too long, ${words} words, max ${maxWords}`)
      }
    }

    if (!scene.visual_description || typeof scene.visual_description !== 'string') {
      errors.push(`scene ${n}: missing visual_description`)
    } else if (scene.visual_description.length < 90) {
      errors.push(`scene ${n}: visual_description too short`)
    }

    const combined = [
      scene.action,
      scene.vo,
      scene.visual_description,
      scene.scene_goal
    ].join(' ').toLowerCase()

    for (const phrase of bannedAbstractPhrases) {
      if (combined.includes(phrase)) {
        errors.push(`scene ${n}: abstract/non-visual phrase detected: ${phrase}`)
      }
    }

    for (const phrase of bannedWrongNiche) {
      if (combined.includes(phrase)) {
        errors.push(`scene ${n}: wrong niche object detected: ${phrase}`)
      }
    }

    if (index > 0) {
      const prev = String(scenes[index - 1]?.visual_description || '').toLowerCase()
      const curr = String(scene.visual_description || '').toLowerCase()

      if (prev && curr && prev === curr) {
        errors.push(`scene ${n}: visual_description identical to previous scene`)
      }

      if (
        prev.includes('cahaya hijau memancar') &&
        curr.includes('cahaya hijau memancar')
      ) {
        errors.push(`scene ${n}: repeated green bioluminescence visual pattern`)
      }
    }
  })

  return errors
}

function buildFactualBriefPrompt(project: any, scenePlan: ScenePlan) {
  return `
Return RAW JSON only. Do not use markdown.

Create a factual brief for an Indonesian science_fact video.

PROJECT:
- Title: ${project.title || ''}
- Topic: ${project.topic || project.title || ''}
- Niche: ${project.niche || ''}
- Content Type: ${project.content_type || ''}
- Target Duration: ${scenePlan.target_duration} seconds
- Scene Count: ${scenePlan.scene_count}

TASK:
Generate exactly ${scenePlan.scene_count} factual items.
Each factual item will become one scene.

SCIENCE SAFETY NOTES:
${getTopicSafetyNotes(project)}

RULES:
1. Each fact must be specific, useful, and different from the others.
2. Each fact must be safe for general audience science content.
3. Do not use vague poetic concepts as facts.
4. Avoid exact numbers unless broadly safe, necessary, and commonly accepted.
5. If a number, distance, time, percentage, depth, size, age, speed, or date is uncertain, use safer phrasing such as "sekitar", "umumnya", "mulai", "dapat", "sering", or "diperkirakan".
6. Each fact must be visualizable as a concrete visible object, process, environment, or scene.
7. visual_anchor must match the project topic, niche, environment, and fact_focus. Do not choose an object that contradicts the factual setting.
8. fact_focus, visual_anchor, and safe_explanation must describe the same fact in the same scene. Do not shift to another fact.
9. Avoid spelling mistakes, mixed-language terms, and inaccurate object names.
10. Use Indonesian only.
11. Do not include cooking/kitchen objects unless the topic is food science.
12. Do not use English in fact_focus, visual_anchor, or safe_explanation.
13. Do not invent unsupported mechanisms.
14. Do not repeat visual_anchor.
15. Return valid JSON only.

OUTPUT FORMAT:
{
  "facts": [
    {
      "fact_number": 1,
      "fact_focus": "specific factual idea",
      "visual_anchor": "concrete visible object or scene",
      "safe_explanation": "short factual explanation"
    }
  ]
}
`
}

function buildVisualBiblePrompt(project: any, factualBrief: unknown) {
  return `
Return RAW JSON only. Do not use markdown.

Create a visual bible for a cinematic vertical science_fact video.

PROJECT:
- Title: ${project.title || ''}
- Topic: ${project.topic || project.title || ''}
- Visual Style: ${project.visual_style || 'realistic cinematic vertical documentary'}

FACTUAL BRIEF:
${JSON.stringify(factualBrief, null, 2)}

TASK:
Create a consistent visual guide for all scenes.

RULES:
1. Use concrete visible objects.
2. Define recurring visual elements.
3. Define camera style and lighting style.
4. Define forbidden visuals that do not match the topic.
5. Use Indonesian for values.
6. Return valid JSON only.

OUTPUT FORMAT:
{
  "main_subject": "main recurring subject or camera point of view",
  "recurring_objects": ["object 1", "object 2"],
  "environment": "main environment",
  "camera_style": "camera style",
  "lighting_style": "lighting style",
  "color_palette": ["color 1", "color 2"],
  "forbidden_visuals": ["forbidden object 1", "forbidden object 2"]
}
`
}

function fillScriptTemplate(template: string, project: any, scenePlan: ScenePlan, factualBrief: unknown, visualBible: unknown) {
  const storylinePayload = {
    factual_brief: factualBrief,
    visual_bible: visualBible,
    instruction:
      'Use factual_brief and visual_bible as the primary source. Do not invent unrelated facts.'
  }

  return template
    .replace(/{title}/g, project.title || '')
    .replace(/{content_type}/g, project.content_type || '')
    .replace(/{niche}/g, project.niche || '')
    .replace(/{topic}/g, project.topic || project.title || '')
    .replace(/{language}/g, project.language || 'id')
    .replace(/{duration_seconds}/g, String(scenePlan.target_duration))
    .replace(/{visual_style}/g, project.visual_style || 'realistic cinematic vertical documentary')
    .replace(/{target_platform}/g, project.target_platform || '')
    .replace(/{audience}/g, project.audience || 'general audience')
    .replace(/{tone}/g, project.tone || 'engaging')
    .replace(/{scene_plan}/g, scenePlan.instruction)
    .replace(/{scene_count}/g, String(scenePlan.scene_count))
    .replace(/{scene_durations}/g, scenePlan.durations.join(', '))
    .replace(/{part_count}/g, String(scenePlan.part_count))
    .replace(/{storyline}/g, JSON.stringify(storylinePayload, null, 2))
    + `

MANDATORY PIPELINE RULES:
1. Every scene MUST include fact_focus.
2. Every scene MUST include visual_anchor.
3. fact_focus must come from factual_brief or be directly derived from it.
4. visual_anchor must be a concrete visible object, not an abstract idea.
5. Do not repeat the same fact_focus.
6. Do not repeat the same visual_anchor.
7. Do not repeat the same visual_description pattern in consecutive scenes.
8. The action field must describe visible screen action only.
9. Do not write actions like "kamera mendengar" or "suara menghilang".
10. visual_description must include subject, environment, composition, camera angle, lighting, and visible detail.
`
}

function buildRepairPrompt(script: unknown, errors: string[], scenePlan: ScenePlan, factualBrief: unknown, visualBible: unknown) {
  return `
Return RAW JSON only. Do not use markdown.

Repair this science_fact script so it passes validation.

VALIDATION ERRORS:
${errors.map(e => `- ${e}`).join('\n')}

SCENE PLAN:
- target_duration: ${scenePlan.target_duration}
- scene_count: ${scenePlan.scene_count}
- part_count: ${scenePlan.part_count}
- scene_durations: ${scenePlan.durations.join(', ')}

FACTUAL BRIEF:
${JSON.stringify(factualBrief, null, 2)}

VISUAL BIBLE:
${JSON.stringify(visualBible, null, 2)}

SCRIPT TO REPAIR:
${JSON.stringify(script, null, 2)}

REPAIR RULES:
1. Keep the same JSON structure.
1a. Use Indonesian only in every field.
1b. Every visual_description must be a string, not an object.
1c. Every visual_description must be at least 25 Indonesian words and include subject, environment, composition, camera angle, lighting, and visible details.
2. Every scene must include fact_focus and visual_anchor.
3. fact_focus must be unique.
4. visual_anchor must be concrete and unique.
5. VO must fit duration using maximum words = duration seconds * 2.5.
6. Action must describe visible screen action only.
7. visual_description must be concrete and not repeated.
8. Total duration must match exactly.
9. Return only the repaired JSON.
`
}

async function selectScriptTemplate(nicheKey: string) {
  const template =
    await db.promptTemplate.findFirst({
      where: {
        type: 'script',
        name: { contains: `[${nicheKey}]` }
      },
      orderBy: { updated_at: 'desc' }
    }) ||
    await db.promptTemplate.findFirst({
      where: {
        type: 'script',
        name: { contains: '[default]' }
      },
      orderBy: { updated_at: 'desc' }
    }) ||
    await db.promptTemplate.findFirst({
      where: { type: 'script' },
      orderBy: { updated_at: 'desc' }
    })

  if (!template) throw new Error('No script prompt template found')
  return template
}

async function callJson(llmConfig: LLMConfig, systemPrompt: string, userPrompt: string) {
  return generateJSON(
    llmConfig,
    systemPrompt,
    userPrompt,
    1,
    {
      temperature: 0.1,
      jsonMode: true,
    }
  )
}

export async function runScriptPipeline(projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId }
  })

  if (!project) throw new Error('Project not found')

  const llmConfig = await getProviderConfig<LLMConfig>('llm')
  if (!llmConfig) {
    throw new Error('No active LLM provider configured')
  }
  const scenePlan = buildScenePlan(Number((project as any).duration_seconds || 60))
  const nicheKey = (project as any).niche || (project as any).content_type || 'default'

  const scriptTemplate = await selectScriptTemplate(nicheKey)

  console.log('[SCRIPT PIPELINE]', {
    projectId,
    title: project.title,
    niche: (project as any).niche,
    content_type: (project as any).content_type,
    selected_template: scriptTemplate.name,
    scenePlan,
  })

  const factualBrief = await callJson(
    llmConfig,
    'Anda adalah peneliti fakta sains berbahasa Indonesia. Kembalikan hanya JSON valid.',
    buildFactualBriefPrompt(project, scenePlan)
  )

  const visualBible = await callJson(
    llmConfig,
    'Anda adalah sutradara visual sinematik berbahasa Indonesia. Kembalikan hanya JSON valid.',
    buildVisualBiblePrompt(project, factualBrief)
  )

  const scriptPrompt = fillScriptTemplate(scriptTemplate.template, project, scenePlan, factualBrief, visualBible)

  let script: any = await callJson(
    llmConfig,
    'Anda adalah penulis naskah sains profesional berbahasa Indonesia. Kembalikan hanya JSON valid.',
    scriptPrompt
  )

  script = normalizeScriptShape(script, project, scenePlan)
  script = postFixScriptQuality(script, project, scenePlan, factualBrief, visualBible)

  let validationErrors = validateScript(script, scenePlan)

  if (validationErrors.length > 0) {
    console.log('[SCRIPT PIPELINE VALIDATION FAIL]', validationErrors)

    script = await callJson(
      llmConfig,
      'Anda adalah mesin perbaikan naskah JSON berbahasa Indonesia. Kembalikan hanya JSON valid.',
      buildRepairPrompt(script, validationErrors, scenePlan, factualBrief, visualBible)
    )

    script = normalizeScriptShape(script, project, scenePlan)
    script = postFixScriptQuality(script, project, scenePlan, factualBrief, visualBible)

    validationErrors = validateScript(script, scenePlan)
  }

  const finalScript = {
    metadata: {
      pipeline_version: 'script_pipeline_core_v1',
      factual_brief: factualBrief,
      visual_bible: visualBible,
      validation_errors: validationErrors,
      scene_plan: scenePlan,
    },
    ...script,
  }

  await db.project.update({
    where: { id: projectId },
    data: {
      script_json: JSON.stringify(finalScript),
      status: validationErrors.length === 0 ? 'script_generated' : 'script_generated_with_warnings',
    }
  })

  console.log('[SCRIPT PIPELINE DONE]', {
    projectId,
    validation_errors: validationErrors.length,
    status: validationErrors.length === 0 ? 'PASS' : 'WARN',
  })

  return {
    script: finalScript,
    factualBrief,
    visualBible,
    validationErrors,
  }
}















