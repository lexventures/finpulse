import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createServiceClient } from '@/lib/supabase/server'

const VALID_TYPES = [
  'ad_spend',
  'wholesale_growth',
  'cogs_change',
  'new_hire',
  'price_change',
] as const

const CreateScenarioSchema = z.object({
  name: z.string().min(1).max(200),
  scenario_type: z.enum(VALID_TYPES),
  inputs: z.record(z.string(), z.unknown()),
  outputs: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().max(2000).optional(),
})

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('fin_scenarios')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = CreateScenarioSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('fin_scenarios')
    .insert({
      name: parsed.data.name,
      scenario_type: parsed.data.scenario_type,
      inputs: parsed.data.inputs,
      outputs: parsed.data.outputs ?? null,
      notes: parsed.data.notes ?? null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json()
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing scenario id' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('fin_scenarios')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
