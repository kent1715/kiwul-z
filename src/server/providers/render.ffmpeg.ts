import { RenderConfig, TestResult, RenderResult } from './provider.types'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdirSync, writeFileSync, existsSync, statSync, readdirSync, unlinkSync, rmdirSync, copyFileSync } from 'fs'
import { dirname, join } from 'path'

const execFileAsync = promisify(execFile)

type RenderScene = {
  video_path: string
  audio_path?: string
  subtitle_path?: string
  duration: number
  audio_offset?: number
  audio_volume?: number
}

export async function testConnection(config: RenderConfig): Promise<TestResult> {
  const start = Date.now()
  try {
    const ffmpegPath = config.ffmpeg_path || 'ffmpeg'
    const { stdout } = await execFileAsync(ffmpegPath, ['-version'], { timeout: 10000 })
    const versionLine = stdout.split('\n')[0]
    return { success: true, message: `FFmpeg available: ${versionLine}`, latency_ms: Date.now() - start }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `FFmpeg not found: ${message}` }
  }
}

export async function render(
  config: RenderConfig,
  scenes: RenderScene[],
  outputPath: string,
  options?: { subtitles_path?: string; resolution?: string }
): Promise<RenderResult> {
  mkdirSync(dirname(outputPath), { recursive: true })

  const ffmpegPath = config.ffmpeg_path || 'ffmpeg'
  const tempDir = join(dirname(outputPath), 'temp')
  mkdirSync(tempDir, { recursive: true })

  try {
    // Step 1: Merge audio into each scene video.
    // Timeline support:
    // - audio_offset shifts VO earlier/later.
    // - audio_volume changes VO loudness.
    const mergedVideos: string[] = []

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]
      const mergedPath = join(tempDir, `scene_${i}_merged.mp4`)
      const duration = Number(scene.duration) || 3

      if (scene.audio_path && existsSync(scene.audio_path)) {
        const audioOffset = Number(scene.audio_offset || 0)
        const audioVolume = Number(scene.audio_volume ?? 1)

        const args: string[] = ['-y', '-i', scene.video_path]

        // FFmpeg accepts -itsoffset before the input it should affect.
        // Positive offset delays audio. Negative offset makes audio start earlier.
        if (audioOffset !== 0) {
          args.push('-itsoffset', String(audioOffset))
        }

        args.push('-i', scene.audio_path)

        args.push(
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-filter:a', `volume=${audioVolume}`,
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-t', String(duration),
          '-shortest',
          mergedPath
        )

        await execFileAsync(ffmpegPath, args, { timeout: 60000 })
      } else {
        // Just copy video and add silent audio track for concat compatibility.
        await execFileAsync(
          ffmpegPath,
          [
            '-y',
            '-i', scene.video_path,
            '-f', 'lavfi',
            '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-t', String(duration),
            '-shortest',
            mergedPath,
          ],
          { timeout: 60000 }
        )
      }

      mergedVideos.push(mergedPath)
    }

    // Step 2: Create concat list.
    const concatListPath = join(tempDir, 'concat.txt')
    const concatContent = mergedVideos.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
    writeFileSync(concatListPath, concatContent)

    // Step 3: Concatenate.
    const concatOutput = join(tempDir, 'concat_output.mp4')
    await execFileAsync(
      ffmpegPath,
      ['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', concatOutput],
      { timeout: 120000 }
    )

    // Step 4: Add subtitles if available.
    if (options?.subtitles_path && existsSync(options.subtitles_path)) {
      await execFileAsync(
        ffmpegPath,
        [
          '-y',
          '-i', concatOutput,
          '-vf', `subtitles=${options.subtitles_path}`,
          '-c:a', 'copy',
          outputPath,
        ],
        { timeout: 120000 }
      )
    } else {
      copyFileSync(concatOutput, outputPath)
    }

    const totalDuration = scenes.reduce((sum, s) => sum + (Number(s.duration) || 0), 0)
    const fileStats = statSync(outputPath)

    return {
      file_path: outputPath,
      duration: totalDuration,
      file_size: fileStats.size,
    }
  } finally {
    // Cleanup temp files.
    try {
      const files = readdirSync(tempDir)

      for (const file of files) {
        try {
          unlinkSync(join(tempDir, file))
        } catch {
          // ignore cleanup errors
        }
      }

      try {
        rmdirSync(tempDir)
      } catch {
        // ignore cleanup errors
      }
    } catch {
      // ignore cleanup errors
    }
  }
}
