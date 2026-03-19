import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover'
})

const ESCALATION_PRICE = 19900 // $199.00 in cents

export async function POST(request: Request) {
  try {
    const { quantity } = await request.json()

    if (!quantity || quantity < 1) {
      return NextResponse.json(
        { error: 'Invalid quantity' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get customer ID and plan tier
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, escalations_remaining, plan_tier')
      .eq('id', user.id)
      .single()

    // VIP users have unlimited escalations, they shouldn't purchase more
    if (profile?.plan_tier === 'VIP') {
      return NextResponse.json(
        { error: 'VIP members have unlimited escalations and do not need to purchase additional.' },
        { status: 400 }
      )
    }

    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No payment method on file. Please add a card first.' },
        { status: 400 }
      )
    }

    // Create a payment intent for the escalations
    const paymentIntent = await stripe.paymentIntents.create({
      amount: ESCALATION_PRICE * quantity,
      currency: 'usd',
      customer: profile.stripe_customer_id,
      description: `Purchase ${quantity} escalation${quantity > 1 ? 's' : ''}`,
      metadata: {
        user_id: user.id,
        quantity: quantity.toString(),
        type: 'escalation_purchase'
      },
      // Automatically charge the default payment method
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      }
    })

    if (paymentIntent.status === 'succeeded') {
      // Get current escalations_purchased value
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('escalations_remaining, escalations_purchased')
        .eq('id', user.id)
        .single()

      // Update user's escalations count
      const newEscalationsRemaining = (currentProfile?.escalations_remaining || 0) + quantity
      const newEscalationsPurchased = (currentProfile?.escalations_purchased || 0) + quantity

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          escalations_remaining: newEscalationsRemaining,
          escalations_purchased: newEscalationsPurchased
        })
        .eq('id', user.id)

      if (updateError) {
        console.error('Error updating escalations:', updateError)
        // Payment succeeded but update failed - log this for manual resolution
        return NextResponse.json(
          {
            error: 'Payment succeeded but failed to update escalations count. Please contact support.',
            paymentIntentId: paymentIntent.id
          },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        escalationsRemaining: newEscalationsRemaining,
        paymentIntentId: paymentIntent.id
      })
    } else {
      return NextResponse.json(
        { error: 'Payment failed. Please try again.' },
        { status: 400 }
      )
    }
  } catch (error: any) {
    console.error('Error purchasing escalations:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to purchase escalations' },
      { status: 500 }
    )
  }
}
