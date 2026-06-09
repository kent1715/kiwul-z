import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.scene.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 })
    }

    const allowedFields = [
      'part_number', 'scene_number', 'start_time', 'end_time', 'duration',
      'action', 'vo', 'visual_description', 'scene_goal', 'image_prompt',
      'negative_prompt', 'motion_prompt', 'image_path', 'video_path',
      'audio_path', 'status', 'locked', 'seed', 'raw_json',
    ]

    const updateData: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    const scene = await db.scene.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(scene)
  } catch (error) {
    console.error('Error updating scene:', error)
    return NextResponse.json({ error: 'Failed to update scene' }, { status: 500 })
  }
}
