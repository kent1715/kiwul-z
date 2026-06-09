import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const project_id = searchParams.get('project_id')

    if (!project_id) {
      return NextResponse.json({ error: 'project_id query parameter is required' }, { status: 400 })
    }

    const ideas = await db.idea.findMany({
      where: { project_id },
      orderBy: { created_at: 'desc' },
    })

    return NextResponse.json(ideas)
  } catch (error) {
    console.error('Error fetching ideas:', error)
    return NextResponse.json({ error: 'Failed to fetch ideas' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id, title, hook, angle, content_type, raw_json, selected } = body

    if (!project_id || !title) {
      return NextResponse.json({ error: 'project_id and title are required' }, { status: 400 })
    }

    const idea = await db.idea.create({
      data: {
        project_id,
        title,
        hook: hook || null,
        angle: angle || null,
        content_type: content_type || null,
        raw_json: raw_json || '{}',
        selected: selected ?? false,
      },
    })

    return NextResponse.json(idea, { status: 201 })
  } catch (error) {
    console.error('Error creating idea:', error)
    return NextResponse.json({ error: 'Failed to create idea' }, { status: 500 })
  }
}
