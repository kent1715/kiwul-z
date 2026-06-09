import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.idea.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
    }

    const allowedFields = ['title', 'hook', 'angle', 'content_type', 'raw_json', 'selected']
    const updateData: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    const idea = await db.idea.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(idea)
  } catch (error) {
    console.error('Error updating idea:', error)
    return NextResponse.json({ error: 'Failed to update idea' }, { status: 500 })
  }
}
