import { RenderConfig, TestResult, RenderResult } from './provider.types'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdirSync, writeFileSync, existsSync, statSync, readdirSync, unlinkSync, rmdirSync, copyFileSync } from 'fs'
import { dirname, join } from 'path'

const execFileAsync = promisify(execFile)

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
  scenes: Array<{ video_path: string; audio_path?: string; subtitle_path?: string; duration: number }>,
  outputPath: string,
  options?: { subtitles_path?: string; resolution?: string }
): Promise<RenderResult> {
  mkdirSync(dirname(outputPath), { recursive: true })
  const ffmpegPath = config.ffmpeg_path || 'ffmpeg'
  const tempDir = join(dirname(outputPath), 'temp')
  mkdirSync(tempDir, { recursive: true })

  try {
    // Step 1: Merge audio into each scene video
    const mergedVideos: string[] = []
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]
      const mergedPath = join(tempDir, `scene_${i}_merged.mp4`)

      if (scene.audio_path && existsSync(scene.audio_path)) {
        // Merge video + audio
        await execFileAsync(
          ffmpegPath,
          [
            '-y',
            '-i', scene.video_path,
            '-i', scene.audio_path,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-shortest',
            mergedPath,
          ],
          { timeout: 60000 }
        )
      } else {
        // Just copy video (add silent audio track for concat compatibility)
        await execFileAsync(
          ffmpegPath,
          [
            '-y',
            '-i', scene.video_path,
            '-f', 'lavfi',
            '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-shortest',
            mergedPath,
          ],
          { timeout: 60000 }
        )
      }
      mergedVideos.push(mergedPath)
    }

    // Step 2: Create concat list
    const concatListPath = join(tempDir, 'concat.txt')
    const concatContent = mergedVideos.map((p) => `file '${p}'`).join('\n')
    writeFileSync(concatListPath, concatContent)

    // Step 3: Concatenate
    const concatOutput = join(tempDir, 'concat_output.mp4')
    await execFileAsync(
      ffmpegPath,
      ['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', concatOutput],
      { timeout: 120000 }
    )

    // Step 4: Add subtitles if available
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
      // Just copy to final output
      copyFileSync(concatOutput, outputPath)
    }

    const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0)
    const fileStats = statSync(outputPath)

    return {
      file_path: outputPath,
      duration: totalDuration,
      file_size: fileStats.size,
    }
  } finally {
    // Cleanup temp files
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
