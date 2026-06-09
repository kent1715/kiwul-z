import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const project_id = searchParams.get('project_id')
    const storyboard_id = searchParams.get('storyboard_id')

    if (!project_id && !storyboard_id) {
      return NextResponse.json(
        { error: 'project_id or storyboard_id query parameter is required' },
        { status: 400 }
      )
    }

    const where: Record<string, string> = {}
    if (project_id) where.project_id = project_id
    if (storyboard_id) where.storyboard_id = storyboard_id

    const scenes = await db.scene.findMany({
      where,
      orderBy: [{ part_number: 'asc' }, { scene_number: 'asc' }],
    })

    return NextResponse.json(scenes)
  } catch (error) {
    console.error('Error fetching scenes:', error)
    return NextResponse.json({ error: 'Failed to fetch scenes' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Scene id is required' }, { status: 400 })
    }

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
      if (updates[field] !== undefined) {
        updateData[field] = updates[field]
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
