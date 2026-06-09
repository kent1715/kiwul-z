import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const location = await db.location.findUnique({ where: { id } })
    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    if (!location.consistency_prompt && !location.description) {
      return NextResponse.json({ error: 'Location has no consistency_prompt or description. Please add a description first.' }, { status: 400 })
    }

    // Get image provider
    const provider = await db.provider.findFirst({
      where: { type: 'image', is_active: true },
      orderBy: { is_default: 'desc' },
    })

    if (!provider) {
      return NextResponse.json({ error: 'No active image provider configured. Please configure an image provider in the Providers section.' }, { status: 400 })
    }

    const configJson = JSON.parse(provider.config_json || '{}')
    const baseUrl = provider.base_url.replace(/\/$/, '')
    const url = `${baseUrl}/images/generations`

    const prompt = `Location: ${location.name}. ${location.description || ''} ${location.consistency_prompt ? `Style: ${location.consistency_prompt}` : ''} ${location.lighting ? `Lighting: ${location.lighting}` : ''}`

    const imageBody: Record<string, unknown> = {
      model: provider.model || 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x576',
      response_format: 'b64_json',
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
    const filename = `location_${id}_${timestamp}.png`
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
      return NextResponse.json({ error: 'No image data (b64_json or url) in response' }, { status: 502 })
    }

    // Update location with reference image
    const updatedLocation = await db.location.update({
      where: { id },
      data: { reference_image_path: publicPath },
    })

    // Create asset record
    await db.asset.create({
      data: {
        project_id: location.project_id,
        type: 'image',
        file_path: publicPath,
        prompt,
        provider: provider.name,
        metadata: JSON.stringify({ provider: provider.name, model: provider.model, type: 'location_reference' }),
      },
    })

    return NextResponse.json({ reference_image_path: publicPath, location: updatedLocation })
  } catch (error) {
    console.error('Error generating location reference image:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate reference image' },
      { status: 500 }
    )
  }
}
