import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const projects = await db.project.findMany({
      orderBy: { updated_at: 'desc' },
      include: {
        _count: {
          select: { ideas: true, scenes: true, characters: true, assets: true },
        },
      },
    })
    return NextResponse.json(projects)
  } catch (error) {
    console.error('Error fetching projects:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      title,
      content_type = 'tutorial_cooking',
      language = 'id',
      duration_seconds = 50,
      aspect_ratio = '9:16',
      resolution = '1080x1920',
      visual_style = 'realistic cinematic vertical',
      target_platform = 'tiktok,reels,youtube_shorts',
      niche,
      topic,
      audience,
      tone,
      config_json = '{}',
    } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const project = await db.project.create({
      data: {
        title,
        content_type,
        language,
        duration_seconds,
        aspect_ratio,
        resolution,
        visual_style,
        target_platform,
        niche: niche || null,
        topic: topic || null,
        audience: audience || null,
        tone: tone || null,
        config_json,
      },
    })

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    console.error('Error creating project:', error)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
