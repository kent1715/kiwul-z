import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const project_id = searchParams.get('project_id')

    if (!project_id) {
      return NextResponse.json({ error: 'project_id query parameter is required' }, { status: 400 })
    }

    const project = await db.project.findUnique({ where: { id: project_id } })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const storyline = project.storyline_json && project.storyline_json !== '{}' ? project.storyline_json : null
    return NextResponse.json({ storyline })
  } catch (error) {
    console.error('Error fetching storyline:', error)
    return NextResponse.json({ error: 'Failed to fetch storyline' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id, storyline } = body

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    const project = await db.project.findUnique({ where: { id: project_id } })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    await db.project.update({
      where: { id: project_id },
      data: { storyline_json: storyline },
    })

    return NextResponse.json({ storyline })
  } catch (error) {
    console.error('Error updating storyline:', error)
    return NextResponse.json({ error: 'Failed to update storyline' }, { status: 500 })
  }
}
