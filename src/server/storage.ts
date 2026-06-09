import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs'
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
 * Convert an absolute file path to a relative API-servable path
 * e.g. /home/z/my-project/outputs/projects/xxx/images/scene_001.png
 *   → /api/assets/xxx/images/scene_001.png
 */
export function toApiPath(absolutePath: string): string {
  const outputsIndex = absolutePath.indexOf('/outputs/')
  if (outputsIndex === -1) return absolutePath
  const relativePath = absolutePath.substring(outputsIndex + '/outputs/'.length)
  return `/api/assets/${relativePath}`
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

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}
