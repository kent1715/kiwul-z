import { VideoConfig, TestResult, VideoGenerationResult } from './provider.types'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

export async function testConnection(config: VideoConfig): Promise<TestResult> {
  const start = Date.now()
  try {
    const res = await fetch(`${config.base_url}/models`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return { success: false, message: `HTTP ${res.status}` }
    return { success: true, message: 'LTX video provider reachable.', latency_ms: Date.now() - start }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Connection failed: ${message}` }
  }
}

async function pollJob(url: string, maxAttempts: number = 120, intervalMs: number = 5000): Promise<Record<string, unknown>> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`)
    const data = await res.json()

    const status = (data.status || data.state || '') as string
    if (status === 'completed' || status === 'done' || status === 'success') return data
    if (status === 'failed' || status === 'error')
      throw new Error((data.error || data.message || 'Video generation failed') as string)

    // Still processing, wait
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error('Video generation timed out')
}

export async function generateVideo(
  config: VideoConfig,
  imagePath: string,
  motionPrompt: string,
  outputPath: string,
  options?: { duration?: number; fps?: number; resolution?: string; seed?: number }
): Promise<VideoGenerationResult> {
  const url = `${config.base_url}/videos`
  mkdirSync(dirname(outputPath), { recursive: true })

  const duration = options?.duration || config.duration || 3
  const fps = options?.fps || config.fps || 24
  const resolution = options?.resolution || config.resolution || '768x1024'

  const body: Record<string, unknown> = {
    model: config.model || 'comfy-ltxv-i2v',
    image: imagePath,
    prompt: motionPrompt,
    duration,
    fps,
    resolution,
  }
  if (options?.seed !== undefined) body.seed = options.seed
  if (config.motion_strength) body.motion_strength = config.motion_strength

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Video generation request failed (${res.status}): ${errText}`)
  }

  const data = await res.json()

  // Handle sync response (video data directly)
  if (data.video || data.data?.[0]?.video) {
    const videoData = data.video || data.data[0].video
    if (videoData.b64_json) {
      writeFileSync(outputPath, Buffer.from(videoData.b64_json, 'base64'))
      return { file_path: outputPath, duration }
    }
    if (videoData.url) {
      const vidRes = await fetch(videoData.url, { signal: AbortSignal.timeout(60000) })
      if (!vidRes.ok) throw new Error('Failed to download video')
      writeFileSync(outputPath, Buffer.from(await vidRes.arrayBuffer()))
      return { file_path: outputPath, duration }
    }
    if (videoData.path) {
      try {
        const { copyFileSync } = await import('fs')
        copyFileSync(videoData.path, outputPath)
      } catch {
        return { file_path: videoData.path, duration }
      }
      return { file_path: outputPath, duration }
    }
  }

  // Handle async response (job ID)
  const jobId = data.id || data.job_id || data.task_id
  if (jobId) {
    const pollUrl = `${config.base_url}/videos/${jobId}`
    const result = await pollJob(pollUrl)

    const output = result.output || result.data || result.video || result
    if (output.b64_json) {
      writeFileSync(outputPath, Buffer.from(output.b64_json as string, 'base64'))
      return { file_path: outputPath, duration }
    }
    if (output.url) {
      const vidRes = await fetch(output.url as string, { signal: AbortSignal.timeout(60000) })
      if (!vidRes.ok) throw new Error('Failed to download video result')
      writeFileSync(outputPath, Buffer.from(await vidRes.arrayBuffer()))
      return { file_path: outputPath, duration }
    }
    if (output.path) {
      try {
        const { copyFileSync } = await import('fs')
        copyFileSync(output.path as string, outputPath)
      } catch {
        return { file_path: output.path as string, duration }
      }
      return { file_path: outputPath, duration }
    }
  }

  throw new Error('Unexpected video response format: ' + JSON.stringify(data).substring(0, 500))
}
