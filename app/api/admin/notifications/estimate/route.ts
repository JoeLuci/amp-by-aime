import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  // Check admin access
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user?.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { roles, tiers } = await request.json()

  try {
    let query = supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })

    // Filter by roles if provided
    if (roles && roles.length > 0) {
      query = query.in('role', roles)
    }

    // Filter by tiers if provided
    if (tiers && tiers.length > 0) {
      query = query.in('plan_tier', tiers)
    }

    // Exclude admins unless explicitly targeted
    if (!roles || !roles.includes('admin')) {
      query = query.not('role', 'in', '(admin,super_admin)')
    }

    const { count, error } = await query

    if (error) {
      console.error('Error estimating recipients:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ count: count || 0 })
  } catch (error) {
    console.error('Error estimating recipients:', error)
    return NextResponse.json({ error: 'Failed to estimate recipients' }, { status: 500 })
  }
}
