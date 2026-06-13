export * from './provider.types'
export { testConnection as testLLM, callLLM, generateJSON, parseJSONFromLLM } from './llm.ollama'
export { testConnection as testImage, generateImage } from './image.zimage'
export { testConnection as testVideo, generateVideo } from './video.ltx'
export { testConnection as testEdgeTTS, generateTTS as generateEdgeTTS } from './tts.edge'
export { testConnection as testF5TTS, generateTTS as generateF5TTS } from './tts.f5tts'
export { testConnection as testFFmpeg, render } from './render.ffmpeg'

import { db } from '@/lib/db'
import type { ProviderConfig, LLMConfig, ImageConfig, VideoConfig, TTSConfig, RenderConfig, TestResult } from './provider.types'
import { testConnection as testLLM } from './llm.ollama'
import { testConnection as testImage } from './image.zimage'
import { testConnection as testVideo } from './video.ltx'
import { testConnection as testEdgeTTS } from './tts.edge'
import { testConnection as testF5TTS } from './tts.f5tts'
import { testConnection as testFFmpeg } from './render.ffmpeg'

export async function getProviderConfig<T extends ProviderConfig>(type: string): Promise<T | null> {
  const provider = await db.provider.findFirst({
    where: { type, is_active: true },
    orderBy: { is_default: 'desc' },
  })
  if (!provider) return null

  const configJson =
    typeof provider.config_json === 'string'
      ? JSON.parse(provider.config_json)
      : provider.config_json

  const base = {
    id: provider.id,
    provider: provider.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
    base_url: provider.base_url,
    model: provider.model,
    enabled: provider.is_active,
    config_json: configJson,
  }

  switch (type) {
    case 'llm':
      return {
        ...base,
        provider: 'ollama',
        temperature: configJson.temperature,
        max_tokens: configJson.max_tokens,
      } as T
    case 'image':
      return {
        ...base,
        provider: 'zimage',
        default_size: configJson.default_size || '768x1024',
        steps: configJson.steps || 8,
        cfg: configJson.cfg || 1,
      } as T
    case 'video':
      return {
        ...base,
        provider: 'ltx',
        duration: configJson.duration || 3,
        fps: configJson.fps || 24,
        resolution: configJson.resolution || '768x1024',
        motion_strength: Number(process.env.LTX_MOTION_STRENGTH || configJson.motion_strength || 0.30),
      } as T
    case 'tts':
      return {
        ...base,
        provider: configJson.provider || 'edge',
        voice: configJson.voice || configJson.model,
        speed: configJson.speed || 1.0,
      } as T
    case 'render':
      return {
        ...base,
        provider: 'ffmpeg',
        output_format: configJson.output_format || 'mp4',
        ffmpeg_path: configJson.ffmpeg_path || configJson.path || 'ffmpeg',
      } as T
    default:
      return base as T
  }
}

export async function testProviderConnection(type: string): Promise<TestResult> {
  const config = await getProviderConfig(type)
  if (!config) return { success: false, message: `No active ${type} provider configured.` }
  if (!config.enabled) return { success: false, message: `${type} provider is disabled.` }

  switch (type) {
    case 'llm':
      return testLLM(config as LLMConfig)
    case 'image':
      return testImage(config as ImageConfig)
    case 'video':
      return testVideo(config as VideoConfig)
    case 'tts': {
      const ttsConfig = config as TTSConfig
      if (ttsConfig.provider === 'f5tts' && ttsConfig.base_url) {
        const result = await testF5TTS(ttsConfig)
        if (result.success) return result
        // Fallback to edge-tts
        return testEdgeTTS({ ...ttsConfig, provider: 'edge' })
      }
      return testEdgeTTS(ttsConfig)
    }
    case 'render':
      return testFFmpeg(config as RenderConfig)
    default:
      return { success: false, message: `Unknown provider type: ${type}` }
  }
}
