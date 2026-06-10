import { VideoConfig, TestResult, VideoGenerationResult } from './provider.types'
import { openAIEndpoint } from '../url'
import { writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, statSync } from 'fs'
import { dirname, join, resolve } from 'path'

export async function testConnection(config: VideoConfig): Promise<TestResult> {
  const start = Date.now()
  try {
    const res = await fetch(openAIEndpoint(config.base_url, '/models'), { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return { success: false, message: `HTTP ${res.status}` }
    return { success: true, message: 'LTX video provider reachable.', latency_ms: Date.now() - start }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Connection failed: ${message}` }
  }
}

/**
 * Extract job/event/video ID from submit response.
 * Supports: id, job_id, video_id, event_id, data.id, data.job_id, data.video_id, data.event_id
 */
function extractJobId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>

  // Top-level fields
  if (typeof d.id === 'string' && d.id) return d.id
  if (typeof d.job_id === 'string' && d.job_id) return d.job_id
  if (typeof d.video_id === 'string' && d.video_id) return d.video_id
  if (typeof d.event_id === 'string' && d.event_id) return d.event_id

  // Nested inside data
  const inner = d.data
  if (inner && typeof inner === 'object') {
    const dd = inner as Record<string, unknown>
    if (typeof dd.id === 'string' && dd.id) return dd.id
    if (typeof dd.job_id === 'string' && dd.job_id) return dd.job_id
    if (typeof dd.video_id === 'string' && dd.video_id) return dd.video_id
    if (typeof dd.event_id === 'string' && dd.event_id) return dd.event_id
  }

  return null
}

/**
 * Extract output path/URL from final (completed) polling response.
 * Supports many formats from various ComfyUI / LTX proxy implementations:
 *   video_path, path, file, filename, url, video_url, output,
 *   outputs[0], data.video_path, data.path, data.url, data.output, data.outputs[0]
 */
function extractOutputPath(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>

  // Top-level string fields
  for (const key of ['video_path', 'path', 'file', 'filename', 'url', 'video_url', 'output']) {
    if (typeof d[key] === 'string' && d[key]) return d[key] as string
  }

  // outputs[0]
  if (Array.isArray(d.outputs) && d.outputs.length > 0) {
    const first = d.outputs[0]
    if (typeof first === 'string' && first) return first
    if (typeof first === 'object' && first !== null) {
      const obj = first as Record<string, unknown>
      if (typeof obj.path === 'string' && obj.path) return obj.path
      if (typeof obj.url === 'string' && obj.url) return obj.url
      if (typeof obj.file === 'string' && obj.file) return obj.file
      if (typeof obj.video_path === 'string' && obj.video_path) return obj.video_path
    }
  }

  // Nested inside data
  const inner = d.data
  if (inner && typeof inner === 'object') {
    const dd = inner as Record<string, unknown>
    for (const key of ['video_path', 'path', 'url', 'output']) {
      if (typeof dd[key] === 'string' && dd[key]) return dd[key] as string
    }
    if (Array.isArray(dd.outputs) && dd.outputs.length > 0) {
      const first = dd.outputs[0]
      if (typeof first === 'string' && first) return first
      if (typeof first === 'object' && first !== null) {
        const obj = first as Record<string, unknown>
        if (typeof obj.path === 'string' && obj.path) return obj.path
        if (typeof obj.url === 'string' && obj.url) return obj.url
        if (typeof obj.video_path === 'string' && obj.video_path) return obj.video_path
      }
    }
  }

  return null
}

/**
 * Find the most recently modified .mp4 file in a directory (recursively, 1 level deep)
 * that was modified after the given timestamp.
 */
function findNewestMp4(dir: string, afterMs: number): string | null {
  if (!existsSync(dir)) return null

  let bestPath: string | null = null
  let bestTime = 0

  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      try {
        const st = statSync(fullPath)
        if (!st.isFile()) continue
        if (!fullPath.toLowerCase().endsWith('.mp4')) continue
        if (st.mtimeMs < afterMs) continue
        if (st.mtimeMs > bestTime) {
          bestTime = st.mtimeMs
          bestPath = fullPath
        }
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // dir not readable
  }

  // Also check subdirectories one level deep (e.g. "generated/")
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const subDir = join(dir, entry.name)
      try {
        const subEntries = readdirSync(subDir, { withFileTypes: true })
        for (const subEntry of subEntries) {
          const fullPath = join(subDir, subEntry.name)
          try {
            const st = statSync(fullPath)
            if (!st.isFile()) continue
            if (!fullPath.toLowerCase().endsWith('.mp4')) continue
            if (st.mtimeMs < afterMs) continue
            if (st.mtimeMs > bestTime) {
              bestTime = st.mtimeMs
              bestPath = fullPath
            }
          } catch {
            // skip
          }
        }
      } catch {
        // subdirectory not readable
      }
    }
  } catch {
    // ignore
  }

  return bestPath
}

/**
 * Copy source file to destination, creating directories as needed.
 * Returns the destination path on success, throws on failure.
 */
function copyToOutput(srcPath: string, destPath: string): string {
  if (!existsSync(srcPath)) {
    throw new Error(`Source video file does not exist: ${srcPath}`)
  }
  mkdirSync(dirname(destPath), { recursive: true })
  copyFileSync(srcPath, destPath)
  const st = statSync(destPath)
  console.log(`[video.ltx] Copied ${srcPath} → ${destPath} (${st.size} bytes)`)
  return destPath
}

export async function generateVideo(
  config: VideoConfig,
  imagePath: string,
  motionPrompt: string,
  outputPath: string,
  options?: { duration?: number; fps?: number; resolution?: string; seed?: number }
): Promise<VideoGenerationResult> {
  const timeoutMs = Number(process.env.LTX_TIMEOUT_MS || 900000)
  const proxyDir = process.env.LTX_PROXY_DIR || ''

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

  // ── Submit request ──────────────────────────────────────────────────────
  const submitUrl = openAIEndpoint(config.base_url, '/videos')
  console.log(`[video.ltx] POST ${submitUrl} model=${body.model} duration=${duration}fps=${fps} resolution=${resolution} timeout=${timeoutMs}ms`)

  const submitController = new AbortController()
  const submitTimeout = setTimeout(() => submitController.abort(), timeoutMs)

  const jobStartTime = Date.now()

  let res: Response
  try {
    res = await fetch(submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: submitController.signal,
    })
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        `LTX submit request timed out after ${timeoutMs} ms. Increase LTX_TIMEOUT_MS or reduce resolution.`
      )
    }
    throw err
  } finally {
    clearTimeout(submitTimeout)
  }

  console.log(`[video.ltx] Submit response status: ${res.status}`)

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Video generation submit failed (${res.status}): ${errText.substring(0, 1000)}`)
  }

  const submitData: unknown = await res.json()
  const submitPreview = JSON.stringify(submitData).substring(0, 1000)
  console.log(`[video.ltx] Submit response preview: ${submitPreview}`)

  // ── Handle sync response (video data directly in submit response) ──────
  if (
    (submitData && typeof submitData === 'object' &&
      ((submitData as Record<string, unknown>).video ||
        (submitData as Record<string, unknown>).data &&
        Array.isArray((submitData as Record<string, unknown>).data) &&
        ((submitData as Record<string, unknown>).data as unknown[])[0] &&
        typeof ((submitData as Record<string, unknown>).data as unknown[])[0] === 'object' &&
        (((submitData as Record<string, unknown>).data as Record<string, unknown>[])[0] as Record<string, unknown>).video))
  ) {
    const d = submitData as Record<string, unknown>
    const videoData = (d.video || (d.data as Record<string, unknown>[])?.[0]?.video) as Record<string, unknown> | undefined

    if (videoData) {
      mkdirSync(dirname(outputPath), { recursive: true })

      if (videoData.b64_json && typeof videoData.b64_json === 'string') {
        writeFileSync(outputPath, Buffer.from(videoData.b64_json, 'base64'))
        console.log(`[video.ltx] Sync response: wrote b64 video to ${outputPath}`)
        return { file_path: outputPath, duration }
      }
      if (videoData.url && typeof videoData.url === 'string') {
        console.log(`[video.ltx] Sync response: downloading from ${videoData.url.substring(0, 100)}`)
        const vidRes = await fetch(videoData.url, { signal: AbortSignal.timeout(120000) })
        if (!vidRes.ok) throw new Error('Failed to download video from sync response URL')
        writeFileSync(outputPath, Buffer.from(await vidRes.arrayBuffer()))
        return { file_path: outputPath, duration }
      }
      if (videoData.path && typeof videoData.path === 'string') {
        const srcPath = videoData.path as string
        if (existsSync(srcPath)) {
          copyToOutput(srcPath, outputPath)
          return { file_path: outputPath, duration }
        }
        // If path doesn't exist, try resolving
        const resolved = resolvePathWithFallbacks(srcPath, proxyDir)
        if (resolved && existsSync(resolved)) {
          copyToOutput(resolved, outputPath)
          return { file_path: outputPath, duration }
        }
        console.log(`[video.ltx] Sync response video path not found: ${srcPath}`)
      }
    }
  }

  // ── Handle async response (job ID → poll) ──────────────────────────────
  const jobId = extractJobId(submitData)
  if (!jobId) {
    throw new Error(
      `Could not extract job ID from submit response. Tried: id, job_id, video_id, event_id, data.id, data.job_id, data.video_id, data.event_id. Response preview: ${submitPreview}`
    )
  }
  console.log(`[video.ltx] Job ID: ${jobId}`)

  const pollUrl = openAIEndpoint(config.base_url, `/videos/${jobId}`)
  console.log(`[video.ltx] Polling endpoint: ${pollUrl}`)

  // ── Poll for completion ─────────────────────────────────────────────────
  const maxAttempts = Math.ceil(timeoutMs / 5000)
  const pollIntervalMs = 5000

  let finalData: Record<string, unknown> | null = null
  for (let i = 0; i < maxAttempts; i++) {
    const pollController = new AbortController()
    const pollTimeout = setTimeout(() => pollController.abort(), 30000)

    let pollRes: Response
    try {
      pollRes = await fetch(pollUrl, { signal: pollController.signal })
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.log(`[video.ltx] Poll request #${i + 1} timed out (30s), retrying...`)
        continue
      }
      throw err
    } finally {
      clearTimeout(pollTimeout)
    }

    if (!pollRes.ok) {
      console.log(`[video.ltx] Poll request #${i + 1} failed: HTTP ${pollRes.status}`)
      await new Promise((r) => setTimeout(r, pollIntervalMs))
      continue
    }

    const pollData: unknown = await pollRes.json()
    const pollPreview = JSON.stringify(pollData).substring(0, 1000)
    console.log(`[video.ltx] Poll #${i + 1} preview: ${pollPreview}`)

    const status = String((pollData as Record<string, unknown>)?.status || (pollData as Record<string, unknown>)?.state || '').toLowerCase()
    console.log(`[video.ltx] Poll #${i + 1} status: "${status}"`)

    if (status === 'completed' || status === 'done' || status === 'success') {
      finalData = pollData as Record<string, unknown>
      break
    }

    if (status === 'failed' || status === 'error') {
      const errMsg = String(
        (pollData as Record<string, unknown>)?.error ||
        (pollData as Record<string, unknown>)?.message ||
        'Video generation failed'
      )
      throw new Error(`LTX video generation failed: ${errMsg}`)
    }

    // Still processing — wait before next poll
    await new Promise((r) => setTimeout(r, pollIntervalMs))
  }

  if (!finalData) {
    throw new Error(
      `LTX video generation timed out after ${timeoutMs} ms (job ${jobId}). Increase LTX_TIMEOUT_MS.`
    )
  }

  // ── Extract output from completed response ──────────────────────────────
  const outputStr = extractOutputPath(finalData)
  console.log(`[video.ltx] Output path/url from response: ${outputStr || '(none)'}`)
  console.log(`[video.ltx] Destination output path: ${outputPath}`)

  mkdirSync(dirname(outputPath), { recursive: true })

  if (outputStr) {
    // Case 1: It's an HTTP URL — download it
    if (outputStr.startsWith('http://') || outputStr.startsWith('https://')) {
      console.log(`[video.ltx] Downloading video from URL: ${outputStr.substring(0, 100)}`)
      const vidRes = await fetch(outputStr, { signal: AbortSignal.timeout(120000) })
      if (!vidRes.ok) throw new Error(`Failed to download video from URL (${vidRes.status})`)
      writeFileSync(outputPath, Buffer.from(await vidRes.arrayBuffer()))
      const st = statSync(outputPath)
      console.log(`[video.ltx] Downloaded video to ${outputPath} (${st.size} bytes)`)
      return { file_path: outputPath, duration }
    }

    // Case 2: It's an absolute Windows path (e.g. D:\local-video-proxy\generated\xxx.mp4)
    if (existsSync(outputStr)) {
      copyToOutput(outputStr, outputPath)
      return { file_path: outputPath, duration }
    }

    // Case 3: Try resolving relative path with fallbacks
    const resolved = resolvePathWithFallbacks(outputStr, proxyDir)
    if (resolved && existsSync(resolved)) {
      copyToOutput(resolved, outputPath)
      return { file_path: outputPath, duration }
    }

    console.log(`[video.ltx] Could not resolve output path: ${outputStr}`)
  }

  // ── Fallback: status completed but no path — search for newest mp4 ──────
  console.log(`[video.ltx] No output path found in response. Searching for newest mp4 in proxy directories...`)

  const searchDirs = [
    proxyDir ? join(proxyDir, 'generated') : '',
    proxyDir || '',
    join(process.cwd(), 'generated'),
    'D:\\local-video-proxy\\generated',
    'D:\\local-video-proxy',
  ].filter(Boolean)

  for (const searchDir of searchDirs) {
    const found = findNewestMp4(searchDir, jobStartTime)
    if (found) {
      console.log(`[video.ltx] Found newest mp4: ${found}`)
      copyToOutput(found, outputPath)
      return { file_path: outputPath, duration }
    }
  }

  // ── Nothing found — clear error ─────────────────────────────────────────
  const finalPreview = JSON.stringify(finalData).substring(0, 1000)
  throw new Error(
    `LTX video completed (job ${jobId}) but could not find output file. Tried path fields: video_path, path, file, filename, url, video_url, output, outputs[0], data.video_path, data.path, data.url, data.output, data.outputs[0]. Also searched for newest mp4 in: ${searchDirs.join(', ')}. Final response preview: ${finalPreview}`
  )
}

/**
 * Try to resolve a relative or partial path using multiple base directories.
 */
function resolvePathWithFallbacks(partialPath: string, proxyDir: string): string | null {
  // Already absolute and exists
  if (existsSync(partialPath)) return partialPath

  const candidates = [
    resolve(process.cwd(), partialPath),
  ]

  if (proxyDir) {
    candidates.push(resolve(proxyDir, partialPath))
    candidates.push(join(proxyDir, partialPath))
  }

  // Hardcoded fallback for common Windows proxy setup
  candidates.push(resolve('D:\\local-video-proxy', partialPath))
  candidates.push(join('D:\\local-video-proxy', partialPath))

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return null
}
