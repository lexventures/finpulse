import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { withAuth } from '@/lib/dal'
import { createServiceClient } from '@/lib/supabase/server'

const CreateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  role: z.string().min(1, 'Role is required'),
  annual_salary: z.number().nonnegative('Salary must be non-negative'),
  benefits_annual: z.number().nonnegative('Benefits must be non-negative'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
})

const PatchSchema = z.object({
  id: z.string().uuid('Invalid employee id'),
  name: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  annual_salary: z.number().nonnegative().optional(),
  benefits_annual: z.number().nonnegative().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  is_active: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('fin_headcount')
      .select('*')
      .eq('is_active', true)
      .order('start_date', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  })
}

export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
    const body = await request.json().catch(() => null)
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Validation failed' },
        { status: 400 }
      )
    }

    const { name, role, annual_salary, benefits_annual, start_date } = parsed.data
    const fully_loaded_annual = annual_salary + benefits_annual

    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('fin_headcount')
      .insert({
        name,
        role,
        annual_salary,
        benefits_annual,
        fully_loaded_annual,
        start_date,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await supabase.from('fin_audit_log').insert({
      action: 'headcount.create',
      entity_type: 'fin_headcount',
      entity_id: data.id,
      details: { name, role, annual_salary, benefits_annual, fully_loaded_annual, start_date },
    })

    return NextResponse.json(data, { status: 201 })
  })
}

export async function PATCH(request: NextRequest) {
  return withAuth(request, async () => {
    const body = await request.json().catch(() => null)
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Validation failed' },
        { status: 400 }
      )
    }

    const { id, ...updates } = parsed.data

    if (
      updates.annual_salary !== undefined ||
      updates.benefits_annual !== undefined
    ) {
      const supabase = createServiceClient()
      const { data: existing } = await supabase
        .from('fin_headcount')
        .select('annual_salary, benefits_annual')
        .eq('id', id)
        .single()

      if (!existing) {
        return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
      }

      const salary = updates.annual_salary ?? Number(existing.annual_salary)
      const benefits = updates.benefits_annual ?? Number(existing.benefits_annual)
      ;(updates as Record<string, unknown>).fully_loaded_annual = salary + benefits
    }

    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('fin_headcount')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    await supabase.from('fin_audit_log').insert({
      action: 'headcount.update',
      entity_type: 'fin_headcount',
      entity_id: id,
      details: updates,
    })

    return NextResponse.json(data)
  })
}
