import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const providers = await db.provider.findMany({
      orderBy: [{ is_default: 'desc' }, { type: 'asc' }],
    })
    return NextResponse.json(providers)
  } catch (error) {
    console.error('Error fetching providers:', error)
    return NextResponse.json({ error: 'Failed to fetch providers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, name, base_url, model, config_json, is_default, is_active } = body

    if (!type || !name || !base_url) {
      return NextResponse.json({ error: 'type, name, and base_url are required' }, { status: 400 })
    }

    const provider = await db.provider.create({
      data: {
        type,
        name,
        base_url,
        model: model || null,
        config_json: config_json || '{}',
        is_default: is_default ?? false,
        is_active: is_active ?? true,
      },
    })

    return NextResponse.json(provider, { status: 201 })
  } catch (error) {
    console.error('Error creating provider:', error)
    return NextResponse.json({ error: 'Failed to create provider' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Provider id is required' }, { status: 400 })
    }

    const existing = await db.provider.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    const allowedFields = ['type', 'name', 'base_url', 'model', 'config_json', 'is_default', 'is_active']
    const updateData: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field]
      }
    }

    const provider = await db.provider.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(provider)
  } catch (error) {
    console.error('Error updating provider:', error)
    return NextResponse.json({ error: 'Failed to update provider' }, { status: 500 })
  }
}
