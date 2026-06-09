export type ProviderType = 'llm' | 'image' | 'tts' | 'video' | 'render'

export interface ProviderConfig {
  id: string
  provider: string
  base_url: string
  model: string | null
  enabled: boolean
  config_json: Record<string, unknown>
}

export interface LLMConfig extends ProviderConfig {
  provider: 'ollama'
  temperature?: number
  max_tokens?: number
}

export interface ImageConfig extends ProviderConfig {
  provider: 'zimage'
  default_size?: string  // e.g. "768x1024"
  steps?: number
  cfg?: number
}

export interface VideoConfig extends ProviderConfig {
  provider: 'ltx'
  duration?: number  // seconds per clip
  fps?: number
  resolution?: string  // e.g. "768x1024"
  motion_strength?: number  // 0.03-0.05 for LTX
}

export interface TTSConfig extends ProviderConfig {
  provider: 'edge' | 'f5tts'
  voice?: string  // e.g. "id-ID-ArdiNeural"
  speed?: number
}

export interface RenderConfig extends ProviderConfig {
  provider: 'ffmpeg'
  output_format?: string  // mp4
  ffmpeg_path?: string
}

export interface TestResult {
  success: boolean
  message: string
  latency_ms?: number
}

export interface ImageGenerationResult {
  file_path: string
  seed?: number
}

export interface VideoGenerationResult {
  file_path: string
  duration: number
}

export interface TTSGenerationResult {
  file_path: string
  duration: number
}

export interface RenderResult {
  file_path: string
  duration: number
  file_size: number
}
