import { TTSConfig, TestResult, TTSGenerationResult } from './provider.types'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

export async function testConnection(config: TTSConfig): Promise<TestResult> {
  const start = Date.now()
  try {
    const res = await fetch(`${config.base_url}/health`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) {
      // Try root endpoint
      const res2 = await fetch(config.base_url, { signal: AbortSignal.timeout(10000) })
      if (!res2.ok) return { success: false, message: `F5-TTS not reachable (HTTP ${res.status})` }
    }
    return { success: true, message: 'F5-TTS provider reachable.', latency_ms: Date.now() - start }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Connection failed: ${message}` }
  }
}

export async function generateTTS(
  config: TTSConfig,
  text: string,
  outputPath: string,
  options?: { speed?: number; emotion?: string; refAudio?: string; refText?: string }
): Promise<TTSGenerationResult> {
  mkdirSync(dirname(outputPath), { recursive: true })

  const body: Record<string, unknown> = {
    text,
    speed: options?.speed || config.speed || 1.0,
  }
  if (options?.emotion) body.emotion = options.emotion
  if (config.voice) body.voice = config.voice
  if (options?.refAudio) body.ref_audio = options.refAudio
  if (options?.refText) body.ref_text = options.refText

  // Try /synthesize endpoint
  const url = `${config.base_url}/synthesize`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`F5-TTS generation failed (${res.status}): ${errText}`)
  }

  // Check if response is audio directly
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('audio') || contentType.includes('octet-stream')) {
    const buffer = Buffer.from(await res.arrayBuffer())
    writeFileSync(outputPath, buffer)
    return { file_path: outputPath, duration: estimateDuration(text, options?.speed || 1.0) }
  }

  // JSON response with audio data
  const data = await res.json()
  if (data.audio || data.data) {
    const audioData = data.audio || data.data
    if (typeof audioData === 'string') {
      // base64
      writeFileSync(outputPath, Buffer.from(audioData, 'base64'))
    } else if (audioData.url) {
      const audioRes = await fetch(audioData.url, { signal: AbortSignal.timeout(60000) })
      writeFileSync(outputPath, Buffer.from(await audioRes.arrayBuffer()))
    } else if (audioData.path) {
      try {
        const { copyFileSync } = await import('fs')
        copyFileSync(audioData.path, outputPath)
      } catch {
        return { file_path: audioData.path, duration: estimateDuration(text, options?.speed || 1.0) }
      }
    }
    return { file_path: outputPath, duration: estimateDuration(text, options?.speed || 1.0) }
  }

  throw new Error('Unexpected F5-TTS response format')
}

function estimateDuration(text: string, speed: number): number {
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.round((words / (150 * speed)) * 60)
}
