import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync, copyFileSync, statSync } from 'fs'
import { join, dirname } from 'path'

const BASE_OUTPUT_DIR = join(process.cwd(), 'outputs', 'projects')

export function getProjectDir(projectId: string): string {
  return join(BASE_OUTPUT_DIR, projectId)
}

export function ensureProjectDirs(projectId: string): void {
  const dirs = [
    join(BASE_OUTPUT_DIR, projectId),
    join(BASE_OUTPUT_DIR, projectId, 'characters'),
    join(BASE_OUTPUT_DIR, projectId, 'locations'),
    join(BASE_OUTPUT_DIR, projectId, 'images'),
    join(BASE_OUTPUT_DIR, projectId, 'videos'),
    join(BASE_OUTPUT_DIR, projectId, 'audio'),
    join(BASE_OUTPUT_DIR, projectId, 'subtitles'),
    join(BASE_OUTPUT_DIR, projectId, 'final'),
    join(BASE_OUTPUT_DIR, projectId, 'logs'),
  ]
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true })
  }
}

export function getImagePath(projectId: string, sceneId: string): string {
  const dir = join(BASE_OUTPUT_DIR, projectId, 'images')
  mkdirSync(dir, { recursive: true })
  return join(dir, `${sceneId}.png`)
}

export function getVideoPath(projectId: string, sceneId: string): string {
  const dir = join(BASE_OUTPUT_DIR, projectId, 'videos')
  mkdirSync(dir, { recursive: true })
  return join(dir, `${sceneId}.mp4`)
}

export function getAudioPath(projectId: string, sceneId: string): string {
  const dir = join(BASE_OUTPUT_DIR, projectId, 'audio')
  mkdirSync(dir, { recursive: true })
  return join(dir, `${sceneId}.wav`)
}

export function getSubtitlePath(projectId: string, filename?: string): string {
  const dir = join(BASE_OUTPUT_DIR, projectId, 'subtitles')
  mkdirSync(dir, { recursive: true })
  return join(dir, filename || 'final.srt')
}

export function getFinalVideoPath(projectId: string): string {
  const dir = join(BASE_OUTPUT_DIR, projectId, 'final')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'final.mp4')
}

export function getCharacterImagePath(projectId: string, characterId: string): string {
  const dir = join(BASE_OUTPUT_DIR, projectId, 'characters')
  mkdirSync(dir, { recursive: true })
  return join(dir, `${characterId}.png`)
}

export function getLocationImagePath(projectId: string, locationId: string): string {
  const dir = join(BASE_OUTPUT_DIR, projectId, 'locations')
  mkdirSync(dir, { recursive: true })
  return join(dir, `${locationId}.png`)
}

/**
 * Convert an absolute file path to a relative API-servable path.
 * Works on both Unix (/) and Windows (\) path separators.
 *
 * Unix:   /home/user/my-project/outputs/projects/xxx/images/scene.png → /api/assets/projects/xxx/images/scene.png
 * Windows: C:\Users\user\my-project\outputs\projects\xxx\images\scene.png → /api/assets/projects/xxx/images/scene.png
 */
export function toApiPath(absolutePath: string): string {
  // Normalize backslashes to forward slashes for Windows compatibility
  const normalized = absolutePath.replace(/\\/g, '/')
  const outputsIndex = normalized.indexOf('/outputs/')
  if (outputsIndex === -1) return absolutePath
  const relativePath = normalized.substring(outputsIndex + '/outputs/'.length)
  return `/api/assets/${relativePath}`
}

/**
 * Convert an API-servable path back to an absolute filesystem path.
 * Uses forward slashes on Unix, backslashes on Windows (via path.join).
 *
 * /api/assets/projects/xxx/images/scene.png → <cwd>/outputs/projects/xxx/images/scene.png
 */
export function fromApiPath(apiPath: string): string {
  if (!apiPath.startsWith('/api/assets/')) return apiPath
  const relativePath = apiPath.substring('/api/assets/'.length)
  return join(process.cwd(), 'outputs', relativePath)
}

/**
 * Write an SRT subtitle file from scene data
 */
export function writeSRTFile(
  projectId: string,
  scenes: Array<{ scene_number: number; vo?: string; start_time: number; end_time: number }>
): string {
  const srtPath = getSubtitlePath(projectId)
  const lines: string[] = []
  
  scenes.forEach((scene, index) => {
    if (!scene.vo) return
    const startTime = formatSRTTime(scene.start_time)
    const endTime = formatSRTTime(scene.end_time)
    lines.push(`${index + 1}`)
    lines.push(`${startTime} --> ${endTime}`)
    lines.push(scene.vo)
    lines.push('')
  })
  
  writeFileSync(srtPath, lines.join('\n'), 'utf-8')
  return srtPath
}

/**
 * Default negative prompt for image generation.
 */
export const DEFAULT_NEGATIVE_PROMPT =
  'text, labels, numbers, watermark, logo, subtitles, blurry, low quality, bad anatomy, deformed body, extra fingers, distorted face'

/**
 * Build a fallback image_prompt from scene fields when image_prompt is missing/null/empty.
 * Concatenates visual_description + action + vo + scene_goal + camera into a single prompt.
 */
export function buildFallbackImagePrompt(scene: {
  visual_description?: string | null
  action?: string | null
  vo?: string | null
  scene_goal?: string | null
  camera?: string | null
}): string {
  const parts: string[] = []
  if (scene.visual_description && typeof scene.visual_description === 'string' && scene.visual_description.trim()) {
    parts.push(scene.visual_description.trim())
  }
  if (scene.action && typeof scene.action === 'string' && scene.action.trim()) {
    parts.push(scene.action.trim())
  }
  if (scene.vo && typeof scene.vo === 'string' && scene.vo.trim()) {
    parts.push(`VO: ${scene.vo.trim()}`)
  }
  if (scene.scene_goal && typeof scene.scene_goal === 'string' && scene.scene_goal.trim()) {
    parts.push(`Goal: ${scene.scene_goal.trim()}`)
  }
  if (scene.camera && typeof scene.camera === 'string' && scene.camera.trim()) {
    parts.push(`Camera: ${scene.camera.trim()}`)
  }
  return parts.length > 0
    ? parts.join('. ')
    : 'cinematic vertical shot, dramatic lighting, high detail, professional composition'
}

/**
 * Ensure image_prompt is always a non-empty string.
 * If missing/null/object/empty, builds a fallback from scene fields.
 */
export function ensureImagePrompt(
  imagePrompt: unknown,
  scene: {
    visual_description?: string | null
    action?: string | null
    vo?: string | null
    scene_goal?: string | null
    camera?: string | null
  }
): string {
  if (typeof imagePrompt === 'string' && imagePrompt.trim().length > 0) {
    return imagePrompt.trim()
  }
  return buildFallbackImagePrompt(scene)
}

const MIN_IMAGE_BYTES = 1000

/**
 * Find the most recently modified .png file in a directory
 * that was modified after the given timestamp (with 10s tolerance)
 * and is larger than MIN_IMAGE_BYTES.
 */
export function findNewestPng(dir: string, afterMs: number): string | null {
  if (!existsSync(dir)) return null

  const cutoff = afterMs - 10_000 // 10 second tolerance
  let bestPath: string | null = null
  let bestTime = 0

  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const fullPath = join(dir, entry.name)
      if (!fullPath.toLowerCase().endsWith('.png')) continue
      try {
        const st = statSync(fullPath)
        if (st.mtimeMs < cutoff) continue
        if (st.size <= MIN_IMAGE_BYTES) continue
        if (st.mtimeMs > bestTime) {
          bestTime = st.mtimeMs
          bestPath = fullPath
        }
      } catch {
        // skip unreadable
      }
    }
  } catch {
    // dir not readable
  }

  return bestPath
}

/**
 * Verify an image file exists and is > MIN_IMAGE_BYTES.
 */
export function verifyImageFile(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    const st = statSync(path)
    return st.size > MIN_IMAGE_BYTES
  } catch {
    return false
  }
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}
