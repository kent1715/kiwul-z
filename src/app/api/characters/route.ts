import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const project_id = searchParams.get('project_id')

    if (!project_id) {
      return NextResponse.json({ error: 'project_id query parameter is required' }, { status: 400 })
    }

    const characters = await db.character.findMany({
      where: { project_id },
      orderBy: { created_at: 'desc' },
    })

    return NextResponse.json(characters)
  } catch (error) {
    console.error('Error fetching characters:', error)
    return NextResponse.json({ error: 'Failed to fetch characters' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      project_id, name, description, gender, age_range, ethnicity_style,
      face_description, hair_or_hijab, outfit, body_type, personality,
      visual_prompt, negative_prompt, reference_image_path,
      visual_consistency_prompt, raw_json,
    } = body

    if (!project_id || !name) {
      return NextResponse.json({ error: 'project_id and name are required' }, { status: 400 })
    }

    const character = await db.character.create({
      data: {
        project_id,
        name,
        description: description || null,
        gender: gender || null,
        age_range: age_range || null,
        ethnicity_style: ethnicity_style || null,
        face_description: face_description || null,
        hair_or_hijab: hair_or_hijab || null,
        outfit: outfit || null,
        body_type: body_type || null,
        personality: personality || null,
        visual_prompt: visual_prompt || null,
        negative_prompt: negative_prompt || null,
        reference_image_path: reference_image_path || null,
        visual_consistency_prompt: visual_consistency_prompt || null,
        raw_json: raw_json || '{}',
      },
    })

    return NextResponse.json(character, { status: 201 })
  } catch (error) {
    console.error('Error creating character:', error)
    return NextResponse.json({ error: 'Failed to create character' }, { status: 500 })
  }
}
