import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBasePlanEscalations, shouldResetEscalations } from '@/lib/escalations'

/**
 * Check if user's escalations need annual reset and perform it if needed
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user profile with escalation data
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan_tier, escalations_remaining, escalations_purchased, escalations_last_reset_date')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    // Check if reset is needed
    if (shouldResetEscalations(profile.escalations_last_reset_date)) {
      const basePlanEscalations = getBasePlanEscalations(profile.plan_tier)

      // Reset escalations to base plan amount
      // Keep any purchased escalations from this year
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          escalations_remaining: basePlanEscalations + (profile.escalations_purchased || 0),
          escalations_used: 0,
          escalations_last_reset_date: new Date().toISOString()
        })
        .eq('id', user.id)

      if (updateError) {
        console.error('Error resetting escalations:', updateError)
        return NextResponse.json(
          { error: 'Failed to reset escalations' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        reset: true,
        escalationsRemaining: basePlanEscalations + (profile.escalations_purchased || 0)
      })
    }

    // No reset needed
    return NextResponse.json({
      reset: false,
      escalationsRemaining: profile.escalations_remaining
    })
  } catch (error) {
    console.error('Error checking escalation reset:', error)
    return NextResponse.json(
      { error: 'Failed to check escalation reset' },
      { status: 500 }
    )
  }
}
