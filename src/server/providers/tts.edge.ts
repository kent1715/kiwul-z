import { TTSConfig, TestResult, TTSGenerationResult } from './provider.types'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export async function testConnection(config: TTSConfig): Promise<TestResult> {
  const start = Date.now()
  const voice = config.voice || config.model || 'id-ID-ArdiNeural'
  
  // Try edge-tts CLI
  const commands = [
    ['edge-tts', ['--list-voices']],
    ['python', ['-m', 'edge_tts', '--list-voices']],
    ['python3', ['-m', 'edge_tts', '--list-voices']],
  ]

  for (const [cmd, args] of commands) {
    try {
      const { stdout } = await execFileAsync(cmd, args, { timeout: 15000 })
      const voices = stdout.split('\n').filter((l) => l.trim())
      const voiceFound = voices.some((v) => v.includes(voice))
      return {
        success: true,
        message: voiceFound
          ? `Edge-TTS available via "${cmd}". Voice "${voice}" found.`
          : `Edge-TTS available via "${cmd}". Voice "${voice}" will use closest match.`,
        latency_ms: Date.now() - start,
      }
    } catch {
      continue
    }
  }

  return { 
    success: false, 
    message: 'Edge-TTS not found. Install with: pip install edge-tts\nThen restart the server.' 
  }
}

export async function generateTTS(
  config: TTSConfig,
  text: string,
  outputPath: string,
  options?: { speed?: number }
): Promise<TTSGenerationResult> {
  mkdirSync(dirname(outputPath), { recursive: true })
  const voice = config.voice || config.model || 'id-ID-ArdiNeural'
  const speed = options?.speed || config.speed || 1.0
  const rate = speed !== 1.0 ? `${speed > 1 ? '+' : ''}${Math.round((speed - 1) * 100)}%` : '+0%'

  // Write text to temp file to avoid shell escaping issues
  const textFilePath = outputPath.replace(/\.\w+$/, '.txt')
  writeFileSync(textFilePath, text, 'utf-8')

  const commands = [
    ['edge-tts', ['--voice', voice, '--rate', rate, '--file', textFilePath, '--write-media', outputPath]],
    ['python', ['-m', 'edge_tts', '--voice', voice, '--rate', rate, '--file', textFilePath, '--write-media', outputPath]],
    ['python3', ['-m', 'edge_tts', '--voice', voice, '--rate', rate, '--file', textFilePath, '--write-media', outputPath]],
  ]

  for (const [cmd, args] of commands) {
    try {
      await execFileAsync(cmd, args, { timeout: 60000 })
      return { file_path: outputPath, duration: estimateDuration(text, speed) }
    } catch {
      continue
    }
  }

  throw new Error(
    'Edge-TTS generation failed. No TTS engine available.\n' +
    'Install with: pip install edge-tts\n' +
    'Then restart the server.'
  )
}

function estimateDuration(text: string, speed: number): number {
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.round((words / (150 * speed)) * 60)
}
