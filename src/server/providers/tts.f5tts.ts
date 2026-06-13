import { TTSConfig, TestResult, TTSGenerationResult } from './provider.types'
import { writeFileSync, copyFileSync, existsSync } from 'fs'

function joinUrl(base: string, path: string): string {
  return base.replace(/\/$/, '') + '/' + path.replace(/^\//, '')
}

export async function testConnection(config: TTSConfig): Promise<TestResult> {
  try {
    const baseUrl = config.base_url || 'http://127.0.0.1:9880'
    const res = await fetch(joinUrl(baseUrl, '/v1/models'), {
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      const res2 = await fetch(baseUrl, { signal: AbortSignal.timeout(10000) })
      if (!res2.ok) return { success: false, message: `F5-TTS not reachable: HTTP ${res.status}` }
    }

    return { success: true, message: 'F5-TTS provider reachable' }
  } catch (error) {
    return {
      success: false,
      message: `F5-TTS connection failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export async function generateTTS(
  config: TTSConfig,
  text: string,
  outputPath: string,
  options?: { speed?: number; emotion?: string; refAudio?: string; refText?: string }
): Promise<TTSGenerationResult> {
  const baseUrl = config.base_url || 'http://127.0.0.1:9880'
  const endpoint = joinUrl(baseUrl, '/v1/audio/speech')

  const body: Record<string, unknown> = {
    model: config.model || 'f5-tts-pria1',
    input: text,
    response_format: 'wav',
  }

  if (options?.refAudio) body.ref_audio = options.refAudio
  if (options?.refText) body.ref_text = options.refText
  if (options?.speed) body.speed = options.speed

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(900000),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`F5-TTS generation failed (${res.status}): ${err}`)
  }

  const contentType = res.headers.get('content-type') || ''

  // Case 1: response adalah audio langsung
  if (contentType.includes('audio') || contentType.includes('wav') || contentType.includes('mpeg')) {
    const buffer = Buffer.from(await res.arrayBuffer())
    writeFileSync(outputPath, buffer)
    return { file_path: outputPath, duration: estimateDuration(text) }
  }

  // Case 2: response JSON dari local F5 proxy
  const data = await res.json().catch(async () => {
    const raw = await res.text().catch(() => '')
    throw new Error(`Unexpected F5-TTS non-JSON response: ${raw.slice(0, 500)}`)
  })

  // Proxy kita mengembalikan output_path lokal
  const outputPathFromJson =
    data.output_path ||
    data.path ||
    data.audio_path ||
    data.file_path

  if (typeof outputPathFromJson === 'string' && existsSync(outputPathFromJson)) {
    copyFileSync(outputPathFromJson, outputPath)
    return { file_path: outputPath, duration: estimateDuration(text) }
  }

  // Proxy kita juga mengembalikan audio_url/url/file/output
  const audioUrl =
    data.audio_url ||
    data.url ||
    data.file ||
    data.output ||
    (data.audio && typeof data.audio === 'object' ? data.audio.url : undefined) ||
    (data.data && typeof data.data === 'object' ? data.data.url : undefined)

  if (typeof audioUrl === 'string' && /^https?:\/\//i.test(audioUrl)) {
    const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(300000) })
    if (!audioRes.ok) {
      throw new Error(`F5-TTS audio URL download failed (${audioRes.status}): ${audioUrl}`)
    }
    writeFileSync(outputPath, Buffer.from(await audioRes.arrayBuffer()))
    return { file_path: outputPath, duration: estimateDuration(text) }
  }

  // Kompatibilitas format lama: data.audio/data.data berisi base64/string
  const audioData = data.audio || data.data
  if (typeof audioData === 'string') {
    writeFileSync(outputPath, Buffer.from(audioData, 'base64'))
    return { file_path: outputPath, duration: estimateDuration(text) }
  }

  throw new Error(`Unexpected F5-TTS response format: ${JSON.stringify(data).slice(0, 1000)}`)
}

function estimateDuration(text: string): number {
  return Math.max(1, text.length / 15)
}
