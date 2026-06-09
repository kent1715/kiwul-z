import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id } = body

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    return NextResponse.json(
      {
        error: 'FFmpeg rendering is not yet configured. This feature will be available when FFmpeg is set up on the server.',
        hint: 'Install FFmpeg and configure the render pipeline to enable final video rendering.',
      },
      { status: 501 }
    )
  } catch (error) {
    console.error('Error in render:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to render video' },
      { status: 500 }
    )
  }
}
