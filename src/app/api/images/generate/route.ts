import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id, sceneId } = body

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    // Get image provider
    const provider = await db.provider.findFirst({
      where: { type: 'image', is_active: true },
      orderBy: { is_default: 'desc' },
    })

    if (!provider) {
      return NextResponse.json({ error: 'No active image provider configured. Please configure an image provider in the Providers section.' }, { status: 400 })
    }

    // Determine which scenes to generate images for
    let scenes
    if (sceneId) {
      const scene = await db.scene.findUnique({ where: { id: sceneId } })
      if (!scene) {
        return NextResponse.json({ error: 'Scene not found' }, { status: 404 })
      }
      if (!scene.image_prompt) {
        return NextResponse.json({ error: 'Scene has no image_prompt. Generate image prompts first.' }, { status: 400 })
      }
      scenes = [scene]
    } else {
      // Get all scenes with image_prompt but no image_path
      scenes = await db.scene.findMany({
        where: {
          project_id,
          image_prompt: { not: null },
          image_path: null,
        },
        orderBy: [{ part_number: 'asc' }, { scene_number: 'asc' }],
      })
    }

    if (scenes.length === 0) {
      return NextResponse.json({ error: 'No scenes found that need image generation', scenes: [] }, { status: 200 })
    }

    // Ensure assets directory exists
    const assetsDir = path.join(process.cwd(), 'public', 'assets')
    await mkdir(assetsDir, { recursive: true })

    const configJson = JSON.parse(provider.config_json || '{}')
    const baseUrl = provider.base_url.replace(/\/$/, '')
    const url = `${baseUrl}/images/generations`

    const results = []

    for (const scene of scenes) {
      try {
        if (!scene.image_prompt) continue

        // Determine dimensions from project
        const project = await db.project.findUnique({ where: { id: project_id } })
        const [width, height] = (project?.resolution || '1080x1920').split('x').map(Number)

        const imageBody: Record<string, unknown> = {
          model: provider.model || 'dall-e-3',
          prompt: scene.image_prompt,
          n: 1,
          size: `${Math.min(width, 576)}x${Math.min(height, 1024)}`,
          response_format: 'b64_json',
        }

        if (scene.negative_prompt) {
          imageBody.negative_prompt = scene.negative_prompt
        }

        if (configJson.extra_params) {
          Object.assign(imageBody, configJson.extra_params)
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(configJson.api_key ? { 'Authorization': `Bearer ${configJson.api_key}` } : {}),
          },
          body: JSON.stringify(imageBody),
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Image generation failed for scene ${scene.id}: ${errorText}`)
          continue
        }

        const data = await response.json()
        const imageData = data.data?.[0]

        if (!imageData) continue

        // Save image
        const timestamp = Date.now()
        const filename = `scene_${scene.id}_${timestamp}.png`
        const filePath = path.join(assetsDir, filename)
        const publicPath = `/assets/${filename}`

        if (imageData.b64_json) {
          const buffer = Buffer.from(imageData.b64_json, 'base64')
          await writeFile(filePath, buffer)
        } else if (imageData.url) {
          const imgResponse = await fetch(imageData.url)
          const arrayBuffer = await imgResponse.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          await writeFile(filePath, buffer)
        } else {
          continue
        }

        // Create asset record
        await db.asset.create({
          data: {
            project_id,
            type: 'image',
            scene_id: scene.id,
            file_path: publicPath,
            prompt: scene.image_prompt,
            provider: provider.name,
            metadata: JSON.stringify({ provider: provider.name, model: provider.model }),
          },
        })

        // Update scene
        const updatedScene = await db.scene.update({
          where: { id: scene.id },
          data: { image_path: publicPath, status: 'image_generated' },
        })

        results.push(updatedScene)
      } catch (sceneError) {
        console.error(`Error generating image for scene ${scene.id}:`, sceneError)
        // Continue with other scenes
      }
    }

    // Return updated scenes
    const updatedScenes = await db.scene.findMany({
      where: { project_id },
      orderBy: [{ part_number: 'asc' }, { scene_number: 'asc' }],
    })

    if (sceneId && results.length === 1) {
      return NextResponse.json({ scene: results[0], scenes: updatedScenes })
    }

    return NextResponse.json({ scenes: updatedScenes, generated: results.length })
  } catch (error) {
    console.error('Error generating images:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate images' },
      { status: 500 }
    )
  }
}
