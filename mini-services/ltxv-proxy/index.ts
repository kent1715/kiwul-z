/**
 * LTXV I2V Proxy — OpenAI-compatible API for Kiwul-Z
 *
 * Endpoints:
 *   POST /v1/videos       — Submit video generation job
 *   GET  /v1/videos/:id   — Poll job status
 *   GET  /v1/models       — List available models
 *
 * Image Priority:
 *   1. body.image (local file path) — always used if valid
 *   2. body.image_url / body.url   — only if body.image is missing
 *   3. Latest IPAdapter image       — only if LTX_ALLOW_LATEST_IMAGE_FALLBACK=true
 */

import { existsSync, mkdirSync, copyFileSync, statSync, readdirSync, writeFileSync, readFileSync } from 'fs'
import { join, resolve, basename, dirname } from 'path'

// ── Config ──────────────────────────────────────────────────────────────────

const COMFY_URL = process.env.COMFY_URL || 'http://127.0.0.1:8188'
const OUTPUT_DIR = process.env.OUTPUT_DIR || 'D:\\local-video-proxy\\generated'
const ALLOW_FALLBACK = process.env.LTX_ALLOW_LATEST_IMAGE_FALLBACK === 'true'
const IPADAPTER_OUTPUT_DIR = process.env.COMFY_IPADAPTER_OUTPUT_DIR || 'D:\\comfy-image-reference-proxy\\generated'
const WORKFLOW_FILE = process.env.WORKFLOW_FILE || 'workflow_ltxv_i2v.json'
const PORT = Number(process.env.PORT || 9200)

// ── Types ───────────────────────────────────────────────────────────────────

interface VideoRequest {
  model?: string
  image?: string
  image_url?: string
  url?: string
  prompt?: string
  duration?: number
  fps?: number
  resolution?: string
  seed?: number
  motion_strength?: number
  negative_prompt?: string
}

interface Job {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  promptId?: string
  inputImage?: string
  error?: string
  output?: string
  createdAt: number
}

// ── State ───────────────────────────────────────────────────────────────────

const jobs = new Map<string, Job>()
let workflowTemplate: Record<string, unknown> | null = null

// ── Helpers ─────────────────────────────────────────────────────────────────

function log(tag: string, msg: string) {
  console.log(`[${tag}] ${new Date().toISOString()} ${msg}`)
}

function logError(tag: string, msg: string, err?: unknown) {
  console.error(`[${tag}] ${new Date().toISOString()} ${msg}`, err || '')
}

function generateId(): string {
  return 'ltxv_' + Math.random().toString(36).substring(2, 18)
}

/**
 * Verify a file exists and is > 1000 bytes.
 */
function isValidImage(filePath: string): boolean {
  if (!existsSync(filePath)) return false
  try {
    const st = statSync(filePath)
    return st.isFile() && st.size > 1000
  } catch {
    return false
  }
}

/**
 * Find the newest image file in a directory.
 */
function findNewestImage(dir: string, extensions: string[]): string | null {
  if (!existsSync(dir)) return null

  let bestPath: string | null = null
  let bestTime = 0

  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const ext = entry.name.toLowerCase()
      if (!extensions.some(e => ext.endsWith(e))) continue
      const fullPath = join(dir, entry.name)
      try {
        const st = statSync(fullPath)
        if (st.size <= 1000) continue
        if (st.mtimeMs > bestTime) {
          bestTime = st.mtimeMs
          bestPath = fullPath
        }
      } catch {
        // skip
      }
    }
  } catch {
    // dir not readable
  }

  return bestPath
}

/**
 * Select the input image based on priority:
 * 1. body.image (local file path)
 * 2. body.image_url / body.url
 * 3. Latest IPAdapter image (only if LTX_ALLOW_LATEST_IMAGE_FALLBACK=true)
 */
function selectInputImage(req: VideoRequest): { path: string; reason: string } | null {
  // Priority 1: body.image — local file path
  if (req.image && typeof req.image === 'string') {
    const imgPath = req.image.replace(/\\/g, '\\') // normalize for Windows
    log('LTXV', `BODY image: ${imgPath}`)

    if (isValidImage(imgPath)) {
      log('LTXV', `selected input image: ${imgPath}`)
      log('LTXV', `selected input reason: body.image`)
      return { path: imgPath, reason: 'body.image' }
    }

    log('LTXV', `body.image exists but invalid (missing or <1000 bytes): ${imgPath}`)
  }

  // Priority 2: body.image_url / body.url
  const imageUrl = req.image_url || req.url
  if (imageUrl && typeof imageUrl === 'string') {
    log('LTXV', `BODY image_url: ${imageUrl}`)
    log('LTXV', `selected input image: ${imageUrl}`)
    log('LTXV', `selected input reason: image_url`)
    return { path: imageUrl, reason: 'image_url' }
  }

  // Priority 3: Latest IPAdapter image (only if allowed)
  if (ALLOW_FALLBACK) {
    log('LTXV', `LTX_ALLOW_LATEST_IMAGE_FALLBACK=true, searching ${IPADAPTER_OUTPUT_DIR}`)
    const latest = findNewestImage(IPADAPTER_OUTPUT_DIR, ['.png', '.jpg', '.jpeg', '.webp'])
    if (latest) {
      log('LTXV', `selected input image: ${latest}`)
      log('LTXV', `selected input reason: fallback_latest_ipadapter`)
      return { path: latest, reason: 'fallback_latest_ipadapter' }
    }
    log('LTXV', `no IPAdapter fallback image found in ${IPADAPTER_OUTPUT_DIR}`)
  } else {
    log('LTXV', `LTX_ALLOW_LATEST_IMAGE_FALLBACK=false, skipping IPAdapter fallback`)
  }

  return null
}

/**
 * Upload an image file to ComfyUI's /upload/image endpoint.
 * Returns the filename assigned by ComfyUI.
 */
async function uploadImageToComfy(filePath: string): Promise<string> {
  const fileName = basename(filePath)

  log('LTXV', `UPLOAD IMAGE TO COMFY: ${filePath}`)

  const fileBuffer = Bun.file(filePath)
  if (!(await fileBuffer.exists())) {
    throw new Error(`Image file does not exist: ${filePath}`)
  }

  const formData = new FormData()
  formData.append('image', new Blob([await fileBuffer.arrayBuffer()]), fileName)
  formData.append('overwrite', 'true')

  const res = await fetch(`${COMFY_URL}/upload/image`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`ComfyUI upload failed (${res.status}): ${errText}`)
  }

  const data = await res.json() as { name?: string; subfolder?: string; error?: string }
  if (data.error) {
    throw new Error(`ComfyUI upload error: ${data.error}`)
  }

  const comfyName = data.name || fileName
  log('LTXV', `Uploaded to ComfyUI as: ${comfyName} (subfolder: ${data.subfolder || ''})`)
  return comfyName
}

/**
 * Load the workflow template from disk.
 */
function loadWorkflowTemplate(): Record<string, unknown> {
  if (workflowTemplate) return workflowTemplate

  const workflowPath = resolve(__dirname, WORKFLOW_FILE)
  if (!existsSync(workflowPath)) {
    throw new Error(`Workflow file not found: ${workflowPath}`)
  }

  const content = readFileSync(workflowPath, 'utf-8')
  workflowTemplate = JSON.parse(content)
  return workflowTemplate!
}

/**
 * Find all LoadImage nodes in the workflow and patch them with the uploaded image.
 * Returns the list of patched node IDs.
 */
function patchLoadImageNodes(
  workflow: Record<string, unknown>,
  imageFilename: string
): string[] {
  const patched: string[] = []
  const wf = workflow as Record<string, Record<string, unknown>>

  for (const [nodeId, node] of Object.entries(wf)) {
    if (!node || typeof node !== 'object') continue

    const classType = node.class_type as string

    // Patch LoadImage nodes
    if (classType === 'LoadImage' || classType === 'image_2_output') {
      if (node.inputs && typeof node.inputs === 'object') {
        const inputs = node.inputs as Record<string, unknown>
        inputs.image = imageFilename
        patched.push(nodeId)
        log('LTXV', `Patched LoadImage node ${nodeId}: image=${imageFilename}`)
      }
    }
  }

  return patched
}

/**
 * Patch workflow parameters (prompt, seed, etc.)
 */
function patchWorkflowParams(
  workflow: Record<string, unknown>,
  req: VideoRequest
): void {
  const wf = workflow as Record<string, Record<string, unknown>>

  for (const [nodeId, node] of Object.entries(wf)) {
    if (!node || typeof node !== 'object') continue
    if (!node.inputs || typeof node.inputs !== 'object') continue

    const classType = node.class_type as string
    const inputs = node.inputs as Record<string, unknown>

    // Patch prompt in CLIPTextEncode or similar nodes
    if (classType === 'CLIPTextEncode' || classType === 'CLIPTextEncodeSDXL') {
      if (typeof inputs.text === 'string' && req.prompt) {
        // Only patch the positive prompt node (not negative)
        if (!inputs.text.toLowerCase().includes('blurry') && !inputs.text.toLowerCase().includes('low quality')) {
          inputs.text = req.prompt
          log('LTXV', `Patched prompt node ${nodeId}: "${req.prompt.substring(0, 80)}..."`)
        }
      }
    }

    // Patch negative prompt
    if (classType === 'CLIPTextEncode' || classType === 'CLIPTextEncodeSDXL') {
      if (typeof inputs.text === 'string' && inputs.text.toLowerCase().includes('blurry')) {
        if (req.negative_prompt) {
          inputs.text = req.negative_prompt
          log('LTXV', `Patched negative prompt node ${nodeId}`)
        }
      }
    }

    // Patch seed in KSampler or similar nodes
    if (classType === 'KSampler' || classType === 'KSamplerAdvanced' || classType === 'SamplerCustom') {
      if (req.seed !== undefined && typeof inputs.seed === 'number') {
        inputs.seed = req.seed
        log('LTXV', `Patched seed node ${nodeId}: seed=${req.seed}`)
      }
    }
  }
}

/**
 * Submit a workflow to ComfyUI.
 * Returns the prompt ID.
 */
async function submitWorkflow(workflow: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${COMFY_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`ComfyUI prompt submission failed (${res.status}): ${errText}`)
  }

  const data = await res.json() as { prompt_id?: string; error?: string; node_errors?: unknown }
  if (data.error) {
    throw new Error(`ComfyUI workflow error: ${JSON.stringify(data.error).substring(0, 500)}`)
  }

  return data.prompt_id || ''
}

/**
 * Poll ComfyUI for prompt completion.
 */
async function pollComfyCompletion(promptId: string, timeoutMs: number = 600000): Promise<Record<string, unknown>> {
  const start = Date.now()
  const interval = 5000

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${COMFY_URL}/history/${promptId}`)
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>
        const entry = data[promptId] as Record<string, unknown> | undefined

        if (entry) {
          const status = entry.status as Record<string, unknown> | undefined
          if (status) {
            const completed = status.completed
            const statusStr = status.status_str as string

            if (completed || statusStr === 'success' || statusStr === 'completed') {
              log('LTXV', `ComfyUI prompt ${promptId} completed`)
              return entry
            }

            if (statusStr === 'error' || statusStr === 'failed') {
              const messages = entry.outputs ? JSON.stringify(entry.outputs).substring(0, 500) : ''
              throw new Error(`ComfyUI prompt ${promptId} failed: ${messages}`)
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('failed')) {
        throw err
      }
      // Network error, retry
    }

    await new Promise(r => setTimeout(r, interval))
  }

  throw new Error(`ComfyUI prompt ${promptId} timed out after ${timeoutMs}ms`)
}

/**
 * Extract output video path from ComfyUI history entry.
 */
function extractOutputVideo(entry: Record<string, unknown>): string | null {
  const outputs = entry.outputs as Record<string, Record<string, unknown>> | undefined
  if (!outputs) return null

  for (const [, nodeOutput] of Object.entries(outputs)) {
    if (!nodeOutput || typeof nodeOutput !== 'object') continue

    // Check for video outputs
    const videos = nodeOutput.videos as Array<Record<string, unknown>> | undefined
    if (Array.isArray(videos) && videos.length > 0) {
      const video = videos[0]
      if (video.filename && typeof video.filename === 'string') {
        const subfolder = (video.subfolder as string) || ''
        const filename = video.filename as string
        // Construct ComfyUI output path
        return subfolder ? join(subfolder, filename) : filename
      }
    }

    // Check for images (some workflows output images)
    const images = nodeOutput.images as Array<Record<string, unknown>> | undefined
    if (Array.isArray(images) && images.length > 0) {
      const image = images[0]
      if (image.filename && typeof image.filename === 'string') {
        return image.filename as string
      }
    }
  }

  return null
}

/**
 * Copy generated video from ComfyUI output to our output directory.
 */
async function copyToOutput(comfyFilename: string, jobId: string): Promise<string> {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  // Try ComfyUI output directory
  const comfyOutputDirs = [
    resolve(COMFY_URL.replace('http://', '').replace(':8188', ''), 'ComfyUI', 'output'),
    'D:\\ComfyUI\\output',
    'C:\\ComfyUI\\output',
  ]

  // Also try fetching via ComfyUI API
  try {
    const viewUrl = `${COMFY_URL}/view?filename=${encodeURIComponent(comfyFilename)}`
    const res = await fetch(viewUrl)
    if (res.ok) {
      const outputPath = join(OUTPUT_DIR, `${jobId}.mp4`)
      const buffer = await res.arrayBuffer()
      await Bun.write(outputPath, buffer)
      if (existsSync(outputPath) && statSync(outputPath).size > 1000) {
        log('LTXV', `Copied video via API to: ${outputPath} (${statSync(outputPath).size} bytes)`)
        return outputPath
      }
    }
  } catch {
    // API download failed, try filesystem copy
  }

  // Try filesystem copy from ComfyUI output directories
  for (const dir of comfyOutputDirs) {
    const srcPath = join(dir, comfyFilename)
    if (existsSync(srcPath)) {
      const outputPath = join(OUTPUT_DIR, `${jobId}.mp4`)
      copyFileSync(srcPath, outputPath)
      if (existsSync(outputPath) && statSync(outputPath).size > 1000) {
        log('LTXV', `Copied video from ${srcPath} to ${outputPath} (${statSync(outputPath).size} bytes)`)
        return outputPath
      }
    }
  }

  throw new Error(`Could not find generated video: ${comfyFilename}`)
}

/**
 * Save debug workflow JSON.
 */
function saveDebugWorkflow(jobId: string, workflow: Record<string, unknown>): void {
  try {
    const debugDir = resolve(__dirname, 'debug')
    mkdirSync(debugDir, { recursive: true })
    const debugPath = join(debugDir, `workflow_${jobId}.json`)
    writeFileSync(debugPath, JSON.stringify(workflow, null, 2))
    log('LTXV', `Saved debug workflow: ${debugPath}`)
  } catch {
    // Non-critical
  }
}

// ── HTTP Server ─────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request) {
    const url = new URL(req.url)
    const path = url.pathname

    // CORS
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      })
    }

    try {
      // ── GET /v1/models ────────────────────────────────────────────────
      if (path === '/v1/models' && req.method === 'GET') {
        return Response.json({
          object: 'list',
          data: [
            { id: 'comfy-ltxv-i2v', object: 'model', owned_by: 'local', permission: [] }
          ],
        })
      }

      // ── POST /v1/videos ──────────────────────────────────────────────
      if (path === '/v1/videos' && req.method === 'POST') {
        const body = await req.json() as VideoRequest
        log('LTXV', `POST /v1/videos — model=${body.model} image=${body.image ? body.image.substring(0, 80) : '(none)'} prompt=${body.prompt ? body.prompt.substring(0, 80) : '(none)'}`)

        // ── Select input image ──────────────────────────────────────
        const imageSelection = selectInputImage(body)

        if (!imageSelection) {
          const errMsg = ALLOW_FALLBACK
            ? 'No valid input image found. body.image, image_url, and IPAdapter fallback all missing/invalid.'
            : 'No valid input image. body.image is missing or invalid, and LTX_ALLOW_LATEST_IMAGE_FALLBACK=false. Provide body.image with a valid local file path.'

          logError('LTXV', errMsg)
          return Response.json({ error: errMsg }, { status: 400 })
        }

        log('LTXV', `selected input image: ${imageSelection.path}`)
        log('LTXV', `selected input reason: ${imageSelection.reason}`)

        // ── Upload image to ComfyUI ─────────────────────────────────
        let comfyImageName: string
        if (imageSelection.reason === 'image_url') {
          // Download URL and upload to Comfy
          log('LTXV', `Downloading image from URL: ${imageSelection.path}`)
          const imgRes = await fetch(imageSelection.path)
          if (!imgRes.ok) {
            return Response.json({ error: `Failed to download image URL: ${imgRes.status}` }, { status: 400 })
          }
          const imgBuffer = await imgRes.arrayBuffer()
          const tmpName = `ltxv_input_${Date.now()}.png`
          const tmpPath = join(OUTPUT_DIR, '..', tmpName)
          mkdirSync(dirname(tmpPath), { recursive: true })
          await Bun.write(tmpPath, imgBuffer)
          comfyImageName = await uploadImageToComfy(tmpPath)
        } else {
          // Local file path — upload directly
          comfyImageName = await uploadImageToComfy(imageSelection.path)
        }

        // ── Prepare workflow ────────────────────────────────────────
        const workflow = JSON.parse(JSON.stringify(loadWorkflowTemplate()))

        // Patch LoadImage nodes
        const patchedNodes = patchLoadImageNodes(workflow, comfyImageName)
        log('LTXV', `Patched ${patchedNodes.length} LoadImage nodes with: ${comfyImageName}`)

        // Log LoadImage node filenames after patch
        for (const nodeId of patchedNodes) {
          const node = (workflow as Record<string, Record<string, unknown>>)[nodeId]
          if (node?.inputs) {
            log('LTXV', `LoadImage node ${nodeId} filename: ${(node.inputs as Record<string, unknown>).image}`)
          }
        }

        // Patch workflow parameters
        patchWorkflowParams(workflow, body)

        // Save debug workflow
        const jobId = generateId()
        saveDebugWorkflow(jobId, workflow)

        // ── Submit to ComfyUI ───────────────────────────────────────
        const promptId = await submitWorkflow(workflow)
        log('LTXV', `Submitted to ComfyUI — jobId=${jobId} promptId=${promptId}`)

        // Track job
        const job: Job = {
          id: jobId,
          status: 'running',
          promptId,
          inputImage: imageSelection.path,
          createdAt: Date.now(),
        }
        jobs.set(jobId, job)

        // ── Start async completion polling ──────────────────────────
        const timeoutMs = Number(process.env.LTX_TIMEOUT_MS || 900000)
        pollComfyCompletion(promptId, timeoutMs)
          .then(async (entry) => {
            const outputPath = extractOutputVideo(entry)
            if (outputPath) {
              try {
                const finalPath = await copyToOutput(outputPath, jobId)
                job.output = finalPath
                job.status = 'completed'
                log('LTXV', `Job ${jobId} completed: ${finalPath}`)
              } catch (err) {
                job.status = 'failed'
                job.error = `Output copy failed: ${err instanceof Error ? err.message : err}`
                logError('LTXV', `Job ${jobId} output copy failed`, err)
              }
            } else {
              // Check fallback: newest video in output dir
              const fallback = findNewestImage(OUTPUT_DIR, ['.mp4', '.mov', '.webm'])
              if (fallback) {
                job.output = fallback
                job.status = 'completed'
                log('LTXV', `Job ${jobId} completed (fallback): ${fallback}`)
              } else {
                job.status = 'failed'
                job.error = 'No output video found in ComfyUI response'
                logError('LTXV', `Job ${jobId} no output video`)
              }
            }
          })
          .catch((err) => {
            job.status = 'failed'
            job.error = err instanceof Error ? err.message : String(err)
            logError('LTXV', `Job ${jobId} failed`, err)
          })

        // Return job ID immediately (async pattern)
        return Response.json({
          id: jobId,
          status: 'queued',
          prompt_id: promptId,
        }, { status: 200 })
      }

      // ── GET /v1/videos/:id ──────────────────────────────────────────
      const videosMatch = path.match(/^\/v1\/videos\/(.+)$/)
      if (videosMatch && req.method === 'GET') {
        const jobId = videosMatch[1]
        const job = jobs.get(jobId)

        if (!job) {
          return Response.json({ error: `Job not found: ${jobId}` }, { status: 404 })
        }

        const elapsed = Date.now() - job.createdAt
        log('LTXV', `GET /v1/videos/${jobId} — status=${job.status} elapsed=${elapsed}ms`)

        const response: Record<string, unknown> = {
          id: job.id,
          status: job.status,
          created_at: job.createdAt,
          elapsed_ms: elapsed,
        }

        if (job.output) {
          response.video_path = job.output
          response.output = job.output
        }
        if (job.error) {
          response.error = job.error
          response.message = job.error
        }

        return Response.json(response)
      }

      // ── Health check ─────────────────────────────────────────────────
      if (path === '/' || path === '/health') {
        return Response.json({
          service: 'ltxv-proxy',
          version: '1.0.0',
          comfy_url: COMFY_URL,
          output_dir: OUTPUT_DIR,
          allow_fallback: ALLOW_FALLBACK,
          jobs: jobs.size,
        })
      }

      return Response.json({ error: 'Not found' }, { status: 404 })

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logError('LTXV', `Unhandled error: ${message}`)
      return Response.json({ error: message }, { status: 500 })
    }
  },
})

log('LTXV', `Server started on port ${PORT}`)
log('LTXV', `COMFY_URL: ${COMFY_URL}`)
log('LTXV', `OUTPUT_DIR: ${OUTPUT_DIR}`)
log('LTXV', `LTX_ALLOW_LATEST_IMAGE_FALLBACK: ${ALLOW_FALLBACK}`)
