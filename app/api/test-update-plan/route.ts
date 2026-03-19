import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Temporary test endpoint to manually update plan
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { planTier } = await request.json()

    // Update the plan
    const { data, error } = await supabase
      .from('profiles')
      .update({
        plan_tier: planTier,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
      .select()

    if (error) {
      console.error('Update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
