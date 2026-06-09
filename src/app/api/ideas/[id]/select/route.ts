import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.idea.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
    }

    // Deselect all other ideas in the project
    await db.idea.updateMany({
      where: { project_id: existing.project_id },
      data: { selected: false },
    })

    // Select this idea
    const idea = await db.idea.update({
      where: { id },
      data: { selected: true },
    })

    return NextResponse.json(idea)
  } catch (error) {
    console.error('Error selecting idea:', error)
    return NextResponse.json({ error: 'Failed to select idea' }, { status: 500 })
  }
}
