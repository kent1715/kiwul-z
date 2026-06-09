import { ImageConfig, TestResult, ImageGenerationResult } from './provider.types'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

export async function testConnection(config: ImageConfig): Promise<TestResult> {
  const start = Date.now()
  try {
    const res = await fetch(`${config.base_url}/models`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return { success: false, message: `HTTP ${res.status}` }
    return { success: true, message: 'Z-Image provider reachable.', latency_ms: Date.now() - start }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Connection failed: ${message}` }
  }
}

export async function generateImage(
  config: ImageConfig,
  prompt: string,
  negativePrompt: string,
  outputPath: string,
  options?: { seed?: number; size?: string }
): Promise<ImageGenerationResult> {
  const url = `${config.base_url}/images/generations`
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

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Image generation failed (${res.status}): ${errText}`)
  }

  const data = await res.json()
  mkdirSync(dirname(outputPath), { recursive: true })

  // Handle different response formats
  const imageData = data.data?.[0] || data.output?.[0] || data

  if (imageData.b64_json) {
    const buffer = Buffer.from(imageData.b64_json, 'base64')
    writeFileSync(outputPath, buffer)
  } else if (imageData.url) {
    // Download from URL
    const imgRes = await fetch(imageData.url, { signal: AbortSignal.timeout(60000) })
    if (!imgRes.ok) throw new Error('Failed to download generated image')
    const arrayBuffer = await imgRes.arrayBuffer()
    writeFileSync(outputPath, Buffer.from(arrayBuffer))
  } else if (imageData.path) {
    // It's a local file path - copy or reference it
    // For local providers, the file may already exist at the path
    // We'll just use the path as-is if it exists, otherwise try to read it
    try {
      const { copyFileSync } = await import('fs')
      copyFileSync(imageData.path, outputPath)
    } catch {
      // If copy fails, the path might be relative or the file might be at a different location
      // Just store the original path
      return { file_path: imageData.path, seed: imageData.seed }
    }
  } else {
    throw new Error(
      'No image data in response. Response keys: ' + Object.keys(data).join(', ')
    )
  }

  return { file_path: outputPath, seed: imageData.seed || options?.seed }
}
