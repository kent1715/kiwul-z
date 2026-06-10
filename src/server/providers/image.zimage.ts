import { ImageConfig, TestResult, ImageGenerationResult } from './provider.types'
import { openAIEndpoint } from '../url'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'

export async function testConnection(config: ImageConfig): Promise<TestResult> {
  const start = Date.now()
  try {
    const url = openAIEndpoint(config.base_url, '/models')
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return { success: false, message: `HTTP ${res.status} from ${url}` }
    return { success: true, message: `Z-Image provider reachable at ${url}.`, latency_ms: Date.now() - start }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Connection failed: ${message}` }
  }
}

/**
 * Attempt to extract image data from various Z-Image / ComfyUI response formats.
 * Returns { b64: string } | { url: string } | { path: string } | null
 */
function extractImageData(data: unknown): { b64: string } | { url: string } | { path: string } | null {
  if (!data || typeof data !== 'object') return null

  const d = data as Record<string, unknown>

  // Format 1: OpenAI-style: { data: [ { b64_json: "..." } ] } or { data: [ { url: "..." } ] }
  if (Array.isArray(d.data) && d.data.length > 0) {
    const item = d.data[0] as Record<string, unknown>
    if (item.b64_json && typeof item.b64_json === 'string') return { b64: item.b64_json }
    if (item.base64 && typeof item.base64 === 'string') return { b64: item.base64 }
    if (item.image_base64 && typeof item.image_base64 === 'string') return { b64: item.image_base64 }
    if (item.url && typeof item.url === 'string') return { url: item.url }
    if (item.path && typeof item.path === 'string') return { path: item.path }
  }

  // Format 2: { output: [ { b64_json: "..." } ] } or { output: [ { url: "..." } ] }
  if (Array.isArray(d.output) && d.output.length > 0) {
    const item = d.output[0] as Record<string, unknown>
    if (item.b64_json && typeof item.b64_json === 'string') return { b64: item.b64_json }
    if (item.base64 && typeof item.base64 === 'string') return { b64: item.base64 }
    if (item.image_base64 && typeof item.image_base64 === 'string') return { b64: item.image_base64 }
    if (item.url && typeof item.url === 'string') return { url: item.url }
    if (item.path && typeof item.path === 'string') return { path: item.path }
  }

  // Format 3: { images: [ "base64..." ] } or { images: [ { url: "..." } ] }
  if (Array.isArray(d.images) && d.images.length > 0) {
    const first = d.images[0]
    if (typeof first === 'string') {
      // Could be base64 or URL — detect by prefix
      if (first.startsWith('http://') || first.startsWith('https://')) return { url: first }
      if (first.startsWith('data:image')) {
        // data:image/png;base64,xxxxx
        const b64part = first.split(',')[1]
        if (b64part) return { b64: b64part }
      }
      // Assume base64
      return { b64: first }
    }
    if (typeof first === 'object' && first !== null) {
      const item = first as Record<string, unknown>
      if (item.b64_json && typeof item.b64_json === 'string') return { b64: item.b64_json }
      if (item.base64 && typeof item.base64 === 'string') return { b64: item.base64 }
      if (item.url && typeof item.url === 'string') return { url: item.url }
      if (item.path && typeof item.path === 'string') return { path: item.path }
    }
  }

  // Format 4: { image: "base64..." } or { image: "http://..." }
  if (typeof d.image === 'string') {
    if (d.image.startsWith('http://') || d.image.startsWith('https://')) return { url: d.image }
    if (d.image.startsWith('data:image')) {
      const b64part = d.image.split(',')[1]
      if (b64part) return { b64: b64part }
    }
    return { b64: d.image }
  }

  // Format 5: { b64_json: "..." } or { base64: "..." } or { image_base64: "..." } at top level
  if (d.b64_json && typeof d.b64_json === 'string') return { b64: d.b64_json }
  if (d.base64 && typeof d.base64 === 'string') return { b64: d.base64 }
  if (d.image_base64 && typeof d.image_base64 === 'string') return { b64: d.image_base64 }

  // Format 6: { url: "..." } at top level
  if (d.url && typeof d.url === 'string') return { url: d.url }

  // Format 7: { path: "..." } at top level (local file path)
  if (d.path && typeof d.path === 'string') return { path: d.path }

  // Format 8: Response body is a plain string (base64 or URL)
  if (typeof data === 'string') {
    if (data.startsWith('http://') || data.startsWith('https://')) return { url: data }
    return { b64: data }
  }

  return null
}

/**
 * Extract seed from response if available
 */
function extractSeed(data: unknown): number | undefined {
  if (!data || typeof data !== 'object') return undefined
  const d = data as Record<string, unknown>

  // Check top-level
  if (typeof d.seed === 'number') return d.seed

  // Check inside data[0]
  if (Array.isArray(d.data) && d.data.length > 0) {
    const item = d.data[0] as Record<string, unknown>
    if (typeof item.seed === 'number') return item.seed
  }

  // Check inside output[0]
  if (Array.isArray(d.output) && d.output.length > 0) {
    const item = d.output[0] as Record<string, unknown>
    if (typeof item.seed === 'number') return item.seed
  }

  return undefined
}

export async function generateImage(
  config: ImageConfig,
  prompt: string,
  negativePrompt: string,
  outputPath: string,
  options?: { seed?: number; size?: string }
): Promise<ImageGenerationResult> {
  const url = openAIEndpoint(config.base_url, '/images/generations')
  const size = options?.size || config.default_size || '768x1024'

  const body: Record<string, unknown> = {
    model: config.model || 'z-image-turbo',
    prompt,
    negative_prompt:
      negativePrompt ||
      'blurry, low quality, distorted face, bad anatomy, extra fingers, text, watermark',
    size,
    n: 1,
    steps: config.steps || 8,
    cfg: config.cfg || 1,
  }
  if (options?.seed !== undefined) body.seed = options.seed

  console.log(`[image.zimage] POST ${url} model=${body.model} size=${size} steps=${body.steps} cfg=${body.cfg} prompt_length=${prompt.length}`)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Image generation failed (${res.status}) from ${url}: ${errText.substring(0, 500)}`)
  }

  // Try to parse as JSON first
  const contentType = res.headers.get('content-type') || ''
  let data: unknown

  if (contentType.includes('application/json')) {
    data = await res.json()
  } else {
    // Response might be raw base64 or binary
    const text = await res.text()
    // Try JSON parse anyway (some servers don't set content-type correctly)
    try {
      data = JSON.parse(text)
    } catch {
      // Not JSON — could be raw base64 string
      data = text
    }
  }

  // Ensure output directory exists
  mkdirSync(dirname(outputPath), { recursive: true })

  // Extract image data from response
  const extracted = extractImageData(data)

  if (!extracted) {
    const preview = JSON.stringify(data).substring(0, 1000)
    throw new Error(
      `Could not extract image from response. Tried formats: data[0].b64_json, data[0].url, data[0].base64, data[0].image_base64, images[0], image, output[0], top-level b64_json/base64/url/path. Response preview: ${preview}`
    )
  }

  if ('b64' in extracted) {
    const buffer = Buffer.from(extracted.b64, 'base64')
    if (buffer.length < 100) {
      throw new Error(`Decoded base64 image is too small (${buffer.length} bytes). Likely corrupted or empty response.`)
    }
    writeFileSync(outputPath, buffer)
  } else if ('url' in extracted) {
    console.log(`[image.zimage] Downloading image from URL: ${extracted.url.substring(0, 100)}`)
    const imgRes = await fetch(extracted.url, { signal: AbortSignal.timeout(60000) })
    if (!imgRes.ok) throw new Error(`Failed to download generated image from URL (${imgRes.status})`)
    const arrayBuffer = await imgRes.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    if (buffer.length < 100) {
      throw new Error(`Downloaded image is too small (${buffer.length} bytes). Likely corrupted or empty.`)
    }
    writeFileSync(outputPath, buffer)
  } else if ('path' in extracted) {
    // Local file path — copy it
    const srcPath = extracted.path
    if (!existsSync(srcPath)) {
      throw new Error(`Local file path returned by provider does not exist: ${srcPath}`)
    }
    const { copyFileSync } = await import('fs')
    copyFileSync(srcPath, outputPath)
  }

  // Verify the output file exists and has content
  if (!existsSync(outputPath)) {
    throw new Error(`Image file was not written to ${outputPath}. Generation may have silently failed.`)
  }

  const { statSync } = await import('fs')
  const fileStat = statSync(outputPath)
  if (fileStat.size < 100) {
    throw new Error(`Output image file is too small (${fileStat.size} bytes): ${outputPath}`)
  }

  const seed = extractSeed(data) || options?.seed
  console.log(`[image.zimage] Saved ${outputPath} (${fileStat.size} bytes) seed=${seed}`)

  return { file_path: outputPath, seed }
}
