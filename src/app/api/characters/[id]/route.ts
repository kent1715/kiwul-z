import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.character.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    const allowedFields = [
      'name', 'description', 'gender', 'age_range', 'ethnicity_style',
      'face_description', 'hair_or_hijab', 'outfit', 'body_type', 'personality',
      'visual_prompt', 'negative_prompt', 'reference_image_path',
      'visual_consistency_prompt', 'raw_json',
    ]

    const updateData: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    const character = await db.character.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(character)
  } catch (error) {
    console.error('Error updating character:', error)
    return NextResponse.json({ error: 'Failed to update character' }, { status: 500 })
  }
}
