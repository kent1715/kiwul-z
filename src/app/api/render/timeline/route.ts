import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'project_id is required' }, { status: 400 })
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
    })

    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    }

    const rawTimeline = (project as unknown as { timeline_json?: string }).timeline_json

    let timeline = null

    try {
      timeline = rawTimeline ? JSON.parse(rawTimeline) : null
    } catch {
      timeline = null
    }

    return NextResponse.json({
      success: true,
      project_id: project.id,
      timeline,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TIMELINE GET] error:', message)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load timeline',
        detail: message,
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const projectId = body.project_id
    const timeline = body.timeline

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'project_id is required' }, { status: 400 })
    }

    if (!timeline || typeof timeline !== 'object') {
      return NextResponse.json({ success: false, error: 'timeline object is required' }, { status: 400 })
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
    })

    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    }

    await db.project.update({
      where: { id: projectId },
      data: {
        timeline_json: JSON.stringify(timeline),
      },
    })

    return NextResponse.json({
      success: true,
      project_id: projectId,
      saved: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TIMELINE POST] error:', message)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to save timeline',
        detail: message,
      },
      { status: 500 }
    )
  }
}
