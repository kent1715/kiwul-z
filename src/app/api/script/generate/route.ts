import { NextRequest, NextResponse } from 'next/server'
import { runScriptPipeline } from '@/server/pipeline/script/runScriptPipeline'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const project_id = body.project_id || body.projectId

    if (!project_id) {
      return NextResponse.json(
        { error: 'project_id is required' },
        { status: 400 }
      )
    }

    const result = await runScriptPipeline(project_id)

    return NextResponse.json({
      success: true,
      script: result.script,
      factual_brief: result.factualBrief,
      visual_bible: result.visualBible,
      validation_errors: result.validationErrors,
    })
  } catch (error) {
    console.error('[SCRIPT GENERATE ERROR]', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate script'
      },
      { status: 500 }
    )
  }
}
