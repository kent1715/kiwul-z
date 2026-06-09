import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { scene_id, project_id, prompt, negative_prompt, width, height } = body

    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
    }

    // Get image provider
    const provider = await db.provider.findFirst({
      where: { type: 'image', is_active: true },
      orderBy: { is_default: 'desc' },
    })

    if (!provider) {
      return NextResponse.json({ error: 'No active image provider configured' }, { status: 400 })
    }

    const baseUrl = provider.base_url.replace(/\/$/, '')
    const url = `${baseUrl}/images/generations`

    const imageBody: Record<string, unknown> = {
      model: provider.model || 'dall-e-3',
      prompt,
      n: 1,
      size: `${width || 576}x${height || 1024}`,
      response_format: 'b64_json',
    }

    if (negative_prompt) {
      imageBody.negative_prompt = negative_prompt
    }

    const configJson = JSON.parse(provider.config_json || '{}')
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
      return NextResponse.json(
        { error: `Image generation failed (${response.status}): ${errorText}` },
        { status: 502 }
      )
    }

    const data = await response.json()
    const imageData = data.data?.[0]

    if (!imageData) {
      return NextResponse.json({ error: 'No image data returned from provider' }, { status: 502 })
    }

    // Ensure assets directory exists
    const assetsDir = path.join(process.cwd(), 'public', 'assets')
    await mkdir(assetsDir, { recursive: true })

    // Save image
    const timestamp = Date.now()
    const filename = `scene_${scene_id || 'gen'}_${timestamp}.png`
    const filePath = path.join(assetsDir, filename)
    const publicPath = `/assets/${filename}`

    if (imageData.b64_json) {
      const buffer = Buffer.from(imageData.b64_json, 'base64')
      await writeFile(filePath, buffer)
    } else if (imageData.url) {
      // Download from URL
      const imgResponse = await fetch(imageData.url)
      const arrayBuffer = await imgResponse.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      await writeFile(filePath, buffer)
    } else {
      return NextResponse.json({ error: 'No image data (b64_json or url) in response' }, { status: 502 })
    }

    // Create asset record
    const asset = await db.asset.create({
      data: {
        project_id: project_id || 'unknown',
        type: 'image',
        scene_id: scene_id || null,
        file_path: publicPath,
        prompt,
        seed: data.seed,
        provider: provider.name,
        metadata: JSON.stringify({ provider: provider.name, model: provider.model, width, height }),
      },
    })

    // Update scene if scene_id provided
    if (scene_id) {
      await db.scene.update({
        where: { id: scene_id },
        data: { image_path: publicPath, status: 'image_generated' },
      })
    }

    return NextResponse.json({
      success: true,
      image_path: publicPath,
      asset,
    })
  } catch (error) {
    console.error('Error generating image:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate image' },
      { status: 500 }
    )
  }
}
