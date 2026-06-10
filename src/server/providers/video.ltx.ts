import { VideoConfig, TestResult, VideoGenerationResult } from './provider.types'
import { openAIEndpoint } from '../url'
import { writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, statSync } from 'fs'
import { dirname, join, resolve } from 'path'

// ── Helpers ────────────────────────────────────────────────────────────────

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm']
const MIN_VIDEO_BYTES = 1000

/**
 * Extract job/event/video ID from submit response.
 * Supports: id, job_id, video_id, event_id, data.id, data.job_id, data.video_id, data.event_id
 */
function extractJobId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>

  if (typeof d.id === 'string' && d.id) return d.id
  if (typeof d.job_id === 'string' && d.job_id) return d.job_id
  if (typeof d.video_id === 'string' && d.video_id) return d.video_id
  if (typeof d.event_id === 'string' && d.event_id) return d.event_id

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
 * Supports many formats from various ComfyUI / LTX proxy implementations.
 */
function extractOutputPath(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>

  // Top-level string fields (ordered by specificity)
  for (const key of ['file_path', 'video_path', 'path', 'output', 'url', 'video_url']) {
    if (typeof d[key] === 'string' && d[key]) return d[key] as string
  }

  // outputs[0]
  if (Array.isArray(d.outputs) && d.outputs.length > 0) {
    const first = d.outputs[0]
    if (typeof first === 'string' && first) return first
    if (typeof first === 'object' && first !== null) {
      const obj = first as Record<string, unknown>
      for (const key of ['file_path', 'video_path', 'path', 'url', 'file']) {
        if (typeof obj[key] === 'string' && obj[key]) return obj[key] as string
      }
    }
  }

  // Nested inside data
  const inner = d.data
  if (inner && typeof inner === 'object') {
    const dd = inner as Record<string, unknown>
    for (const key of ['file_path', 'video_path', 'path', 'url', 'output']) {
      if (typeof dd[key] === 'string' && dd[key]) return dd[key] as string
    }
    if (Array.isArray(dd.outputs) && dd.outputs.length > 0) {
      const first = dd.outputs[0]
      if (typeof first === 'string' && first) return first
      if (typeof first === 'object' && first !== null) {
        const obj = first as Record<string, unknown>
        for (const key of ['file_path', 'video_path', 'path', 'url']) {
          if (typeof obj[key] === 'string' && obj[key]) return obj[key] as string
        }
      }
    }
  }

  return null
}

/**
 * Find the most recently modified video file (.mp4/.mov/.webm) in a directory
 * (and one level of subdirectories) that:
 *   - LastWriteTime >= afterMs - 10_000 (10 second tolerance)
 *   - file size > MIN_VIDEO_BYTES
 */
function findNewestVideo(dir: string, afterMs: number): string | null {
  if (!existsSync(dir)) return null

  const cutoff = afterMs - 10_000 // 10 second tolerance
  let bestPath: string | null = null
  let bestTime = 0

  function checkEntry(fullPath: string, st: { mtimeMs: number; size: number; isFile(): boolean }) {
    if (!st.isFile()) return
    const lower = fullPath.toLowerCase()
    if (!VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return
    if (st.mtimeMs < cutoff) return
    if (st.size <= MIN_VIDEO_BYTES) return
    if (st.mtimeMs > bestTime) {
      bestTime = st.mtimeMs
      bestPath = fullPath
    }
  }

  function scanDir(dirPath: string, depth: number) {
    let entries: ReturnType<typeof readdirSync>
    try {
      entries = readdirSync(dirPath, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      try {
        if (entry.isFile()) {
          const st = statSync(fullPath)
          checkEntry(fullPath, st)
        } else if (entry.isDirectory() && depth < 2) {
          scanDir(fullPath, depth + 1)
        }
      } catch {
        // skip unreadable
      }
    }
  }

  scanDir(dir, 0)
  return bestPath
}

/**
 * Try to resolve a relative or partial path using multiple base directories.
 */
function resolvePathWithFallbacks(partialPath: string, proxyDir: string): string | null {
  if (existsSync(partialPath)) return partialPath

  const candidates = [resolve(process.cwd(), partialPath)]

  if (proxyDir) {
    candidates.push(resolve(proxyDir, partialPath))
    candidates.push(join(proxyDir, partialPath))
    candidates.push(resolve(proxyDir, 'generated', partialPath))
    candidates.push(join(proxyDir, 'generated', partialPath))
  }

  // Hardcoded fallback for common Windows proxy setup
  candidates.push(resolve('D:\\local-video-proxy', partialPath))
  candidates.push(join('D:\\local-video-proxy', partialPath))
  candidates.push(resolve('D:\\local-video-proxy', 'generated', partialPath))
  candidates.push(join('D:\\local-video-proxy', 'generated', partialPath))

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return null
}

/**
 * Copy source video to outputPath, creating directories as needed.
 * Verifies the destination file exists and is > MIN_VIDEO_BYTES.
 */
function copyAndVerify(srcPath: string, destPath: string): void {
  if (!existsSync(srcPath)) {
    throw new Error(`[LTX] Source video file does not exist: ${srcPath}`)
  }
  mkdirSync(dirname(destPath), { recursive: true })
  copyFileSync(srcPath, destPath)

  if (!existsSync(destPath)) {
    throw new Error(`[LTX] Copy succeeded but destination not found: ${destPath}`)
  }
  const st = statSync(destPath)
  if (st.size <= MIN_VIDEO_BYTES) {
    throw new Error(`[LTX] Copied video too small (${st.size} bytes): ${destPath}`)
  }
  console.log(`[LTX] Copied video to ${destPath} (${st.size} bytes)`)
}

/**
 * Verify outputPath is a valid video file. Returns true if valid.
 */
function verifyOutput(outputPath: string): boolean {
  if (!existsSync(outputPath)) return false
  try {
    const st = statSync(outputPath)
    return st.size > MIN_VIDEO_BYTES
  } catch {
    return false
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

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

export async function generateVideo(
  config: VideoConfig,
  imagePath: string,
  motionPrompt: string,
  outputPath: string,
  options?: { duration?: number; fps?: number; resolution?: string; seed?: number }
): Promise<VideoGenerationResult> {
  const timeoutMs = Number(process.env.LTX_TIMEOUT_MS || 900000)
  const proxyDir = process.env.LTX_PROXY_DIR || 'D:\\local-video-proxy'
  const startedAt = Date.now()

  const duration = options?.duration || config.duration || 3
  const fps = options?.fps || config.fps || 24
  const resolution = options?.resolution || config.resolution || '768x1024'

  console.log(`[LTX] startedAt: ${new Date(startedAt).toISOString()}`)
  console.log(`[LTX] outputPath: ${outputPath}`)
  console.log(`[LTX] proxyDir: ${proxyDir}`)
  console.log(`[LTX] timeoutMs: ${timeoutMs}`)

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

  // ── 1. Submit request ─────────────────────────────────────────────────
  const submitUrl = openAIEndpoint(config.base_url, '/videos')
  console.log(`[LTX] Submit POST ${submitUrl}`)

  const submitController = new AbortController()
  const submitTimeout = setTimeout(() => submitController.abort(), timeoutMs)

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
      // Even on timeout, try fallback before throwing
      const fallback = tryFallbackNewestVideo(proxyDir, startedAt, outputPath)
      if (fallback) return fallback
      throw new Error(
        `LTX submit timed out after ${timeoutMs} ms. Increase LTX_TIMEOUT_MS.`
      )
    }
    throw err
  } finally {
    clearTimeout(submitTimeout)
  }

  console.log(`[LTX] Submit response status: ${res.status}`)

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Video submit failed (${res.status}): ${errText.substring(0, 1000)}`)
  }

  const submitData: unknown = await res.json()
  const submitPreview = JSON.stringify(submitData).substring(0, 1000)
  console.log(`[LTX] Submit response: ${submitPreview}`)

  // ── 2. Try extracting output directly from submit response ────────────
  const directPath = extractOutputPath(submitData)
  if (directPath) {
    console.log(`[LTX] Direct output from submit response: ${directPath}`)
    const resolved = resolveAndCopy(directPath, proxyDir, outputPath)
    if (resolved) return resolved
  }

  // ── 3. Handle sync b64/url response ───────────────────────────────────
  if (submitData && typeof submitData === 'object') {
    const d = submitData as Record<string, unknown>
    const videoObj = d.video || (Array.isArray(d.data) && d.data[0] && (d.data[0] as Record<string, unknown>).video)
    if (videoObj && typeof videoObj === 'object') {
      const vd = videoObj as Record<string, unknown>
      mkdirSync(dirname(outputPath), { recursive: true })

      if (typeof vd.b64_json === 'string' && vd.b64_json) {
        writeFileSync(outputPath, Buffer.from(vd.b64_json, 'base64'))
        if (verifyOutput(outputPath)) {
          console.log(`[LTX] Sync b64 video saved: ${outputPath}`)
          return { file_path: outputPath, duration }
        }
      }

      if (typeof vd.url === 'string' && vd.url) {
        console.log(`[LTX] Downloading sync video from: ${vd.url.substring(0, 100)}`)
        const vidRes = await fetch(vd.url, { signal: AbortSignal.timeout(120000) })
        if (vidRes.ok) {
          writeFileSync(outputPath, Buffer.from(await vidRes.arrayBuffer()))
          if (verifyOutput(outputPath)) {
            console.log(`[LTX] Sync URL video saved: ${outputPath}`)
            return { file_path: outputPath, duration }
          }
        }
      }
    }
  }

  // ── 4. Extract job ID and poll ────────────────────────────────────────
  const jobId = extractJobId(submitData)
  if (!jobId) {
    // No job ID — try fallback before throwing
    const fallback = tryFallbackNewestVideo(proxyDir, startedAt, outputPath)
    if (fallback) return fallback

    throw new Error(
      `Could not extract job ID from submit response. Tried: id, job_id, video_id, event_id, data.id, data.job_id, data.video_id, data.event_id. Response: ${submitPreview}`
    )
  }
  console.log(`[LTX] Job ID: ${jobId}`)

  const pollUrl = openAIEndpoint(config.base_url, `/videos/${jobId}`)
  console.log(`[LTX] Polling endpoint: ${pollUrl}`)

  // ── 5. Poll for completion (with aggressive fallback) ──────────────────
  const maxAttempts = Math.ceil(timeoutMs / 5000)
  const pollIntervalMs = 5000
  const overallDeadline = startedAt + timeoutMs
  const FALLBACK_CHECK_AFTER_MS = 30_000 // Start checking fallback after 30s

  let finalData: Record<string, unknown> | null = null

  for (let i = 0; i < maxAttempts; i++) {
    const now = Date.now()
    if (now > overallDeadline) break

    const elapsed = now - startedAt
    console.log(`[LTX] Poll #${i + 1} elapsed: ${elapsed} ms`)

    const pollController = new AbortController()
    const pollTimeout = setTimeout(() => pollController.abort(), 30000)

    let pollRes: Response
    try {
      pollRes = await fetch(pollUrl, { signal: pollController.signal })
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.log(`[LTX] Poll #${i + 1} timed out (30s), retrying...`)
      } else {
        throw err
      }

      // Even on poll timeout, check fallback if enough time has passed
      if (elapsed >= FALLBACK_CHECK_AFTER_MS) {
        const fallback = tryFallbackNewestVideo(proxyDir, startedAt, outputPath)
        if (fallback) return fallback
      }
      continue
    } finally {
      clearTimeout(pollTimeout)
    }

    if (!pollRes.ok) {
      console.log(`[LTX] Poll #${i + 1} failed: HTTP ${pollRes.status}`)

      // Check fallback even on HTTP error
      if (elapsed >= FALLBACK_CHECK_AFTER_MS) {
        const fallback = tryFallbackNewestVideo(proxyDir, startedAt, outputPath)
        if (fallback) return fallback
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs))
      continue
    }

    let pollData: unknown
    try {
      pollData = await pollRes.json()
    } catch {
      console.log(`[LTX] Poll #${i + 1} invalid JSON response`)

      if (elapsed >= FALLBACK_CHECK_AFTER_MS) {
        const fallback = tryFallbackNewestVideo(proxyDir, startedAt, outputPath)
        if (fallback) return fallback
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs))
      continue
    }

    const pollPreview = JSON.stringify(pollData).substring(0, 1000)
    console.log(`[LTX] Poll #${i + 1} response: ${pollPreview}`)

    const status = String(
      (pollData as Record<string, unknown>)?.status ||
      (pollData as Record<string, unknown>)?.state || ''
    ).toLowerCase()
    console.log(`[LTX] Poll #${i + 1} status: "${status}"`)

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
      // Even on failed status, try fallback — the file might already exist
      const fallback = tryFallbackNewestVideo(proxyDir, startedAt, outputPath)
      if (fallback) return fallback
      throw new Error(`LTX video generation failed: ${errMsg}`)
    }

    // ── Aggressive fallback: if >30s elapsed, check filesystem ──────────
    if (elapsed >= FALLBACK_CHECK_AFTER_MS) {
      console.log(`[LTX] checking fallback during polling (elapsed ${elapsed} ms)`)
      const fallback = tryFallbackNewestVideo(proxyDir, startedAt, outputPath)
      if (fallback) return fallback
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs))
  }

  // ── 6. If polling timed out, try fallback before throwing ─────────────
  if (!finalData) {
    console.log(`[LTX] Polling timed out after ${timeoutMs} ms. Trying fallback newest video...`)
    const fallback = tryFallbackNewestVideo(proxyDir, startedAt, outputPath)
    if (fallback) return fallback

    throw new Error(
      `LTX video generation timed out after ${timeoutMs} ms (job ${jobId}). Increase LTX_TIMEOUT_MS.`
    )
  }

  // ── 7. Extract output from completed response ─────────────────────────
  console.log(`[LTX] Poll response summary: status=completed, keys=${Object.keys(finalData).join(',')}`)

  const outputStr = extractOutputPath(finalData)
  console.log(`[LTX] Resolved video path from response: ${outputStr || '(none)'}`)

  mkdirSync(dirname(outputPath), { recursive: true })

  if (outputStr) {
    // Case A: HTTP URL → download
    if (outputStr.startsWith('http://') || outputStr.startsWith('https://')) {
      console.log(`[LTX] Downloading video from URL: ${outputStr.substring(0, 100)}`)
      const vidRes = await fetch(outputStr, { signal: AbortSignal.timeout(120000) })
      if (!vidRes.ok) throw new Error(`Failed to download video (${vidRes.status})`)
      writeFileSync(outputPath, Buffer.from(await vidRes.arrayBuffer()))
      if (verifyOutput(outputPath)) {
        const sz = statSync(outputPath).size
        console.log(`[LTX] Final file size: ${sz} bytes`)
        return { file_path: outputPath, duration }
      }
      console.log(`[LTX] Downloaded video failed verification, trying fallback...`)
    }

    // Case B: Absolute path that exists → copy
    const resolved = resolveAndCopy(outputStr, proxyDir, outputPath)
    if (resolved) return resolved

    console.log(`[LTX] Could not resolve output path: ${outputStr}`)
  }

  // ── 8. Fallback: search for newest video file ─────────────────────────
  const fallback = tryFallbackNewestVideo(proxyDir, startedAt, outputPath)
  if (fallback) return fallback

  // ── 9. Nothing found — clear error ────────────────────────────────────
  const finalPreview = JSON.stringify(finalData).substring(0, 1000)
  throw new Error(
    `LTX video completed (job ${jobId}) but could not find output file. ` +
    `Tried path fields: file_path, video_path, path, output, url, video_url, outputs[0], ` +
    `data.file_path, data.video_path, data.path, data.url, data.output, data.outputs[0]. ` +
    `Also searched for newest video in ${proxyDir}\\generated. ` +
    `Final response: ${finalPreview}`
  )
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Try to resolve a path string (could be absolute Windows path, relative path, etc.)
 * and copy it to outputPath. Returns VideoGenerationResult on success, null on failure.
 */
function resolveAndCopy(
  rawPath: string,
  proxyDir: string,
  outputPath: string
): VideoGenerationResult | null {
  // Already an absolute path that exists
  if (existsSync(rawPath)) {
    console.log(`[LTX] Found absolute path: ${rawPath}`)
    try {
      copyAndVerify(rawPath, outputPath)
      const sz = statSync(outputPath).size
      console.log(`[LTX] Final file size: ${sz} bytes`)
      return { file_path: outputPath, duration: 0 }
    } catch (err) {
      console.log(`[LTX] Copy failed for ${rawPath}: ${err instanceof Error ? err.message : err}`)
      return null
    }
  }

  // Try resolving with fallbacks
  const resolved = resolvePathWithFallbacks(rawPath, proxyDir)
  if (resolved) {
    console.log(`[LTX] Resolved path: ${rawPath} → ${resolved}`)
    try {
      copyAndVerify(resolved, outputPath)
      const sz = statSync(outputPath).size
      console.log(`[LTX] Final file size: ${sz} bytes`)
      return { file_path: outputPath, duration: 0 }
    } catch (err) {
      console.log(`[LTX] Copy failed for ${resolved}: ${err instanceof Error ? err.message : err}`)
      return null
    }
  }

  return null
}

/**
 * Search proxy directories for the newest video file created after startedAt.
 * If found, copy to outputPath and return VideoGenerationResult.
 * Returns null if nothing found.
 */
function tryFallbackNewestVideo(
  proxyDir: string,
  startedAt: number,
  outputPath: string
): VideoGenerationResult | null {
  const searchDirs = [
    join(proxyDir, 'generated'),
    proxyDir,
    join('D:\\local-video-proxy', 'generated'),
    'D:\\local-video-proxy',
  ]

  // Deduplicate
  const uniqueDirs = [...new Set(searchDirs)]

  for (const dir of uniqueDirs) {
    const found = findNewestVideo(dir, startedAt)
    if (found) {
      const st = statSync(found)
      console.log(`[LTX] fallback candidate: ${found} (${st.size} bytes, mtime ${new Date(st.mtimeMs).toISOString()})`)
      try {
        copyAndVerify(found, outputPath)
        const sz = statSync(outputPath).size
        console.log(`[LTX] fallback copied successfully: ${outputPath} (${sz} bytes)`)
        return { file_path: outputPath, duration: 0 }
      } catch (err) {
        console.log(`[LTX] fallback copy failed: ${err instanceof Error ? err.message : err}`)
      }
    }
  }

  return null
}
