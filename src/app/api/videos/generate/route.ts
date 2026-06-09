import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id, sceneId } = body

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    return NextResponse.json(
      {
        error: 'Video generation is not yet configured. This feature will be available when LTX/ComfyUI is set up.',
        hint: 'Configure a video generation provider (e.g., LTX Studio, ComfyUI with AnimateDiff) in the Providers section to enable video generation.',
      },
      { status: 501 }
    )
  } catch (error) {
    console.error('Error in video generation:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate video' },
      { status: 500 }
    )
  }
}
