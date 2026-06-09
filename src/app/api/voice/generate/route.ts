import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { project_id, sceneId, speed } = body

    if (!project_id) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    return NextResponse.json(
      {
        error: 'TTS voice generation is not yet configured. This feature will be available when F5-TTS is set up.',
        hint: 'Configure a TTS provider (e.g., F5-TTS, ElevenLabs, OpenAI TTS) in the Providers section to enable voice generation.',
      },
      { status: 501 }
    )
  } catch (error) {
    console.error('Error in voice generation:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate voice' },
      { status: 500 }
    )
  }
}
