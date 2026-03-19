import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover'
})

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check for impersonation - if userId provided, verify admin status
    const { searchParams } = new URL(request.url)
    const impersonatedUserId = searchParams.get('userId')
    let targetUserId = user.id

    if (impersonatedUserId) {
      // Verify current user is an admin
      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      if (!adminProfile?.is_admin) {
        return NextResponse.json(
          { error: 'Admin access required for impersonation' },
          { status: 403 }
        )
      }
      targetUserId = impersonatedUserId
    }

    // Get customer ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', targetUserId)
      .single()

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({
        paymentMethod: null
      })
    }

    // Get customer with default payment method
    let customer
    try {
      customer = await stripe.customers.retrieve(profile.stripe_customer_id, {
        expand: ['invoice_settings.default_payment_method']
      })
    } catch (stripeError: any) {
      // If customer doesn't exist in Stripe (e.g., migrated from old system), return null
      if (stripeError?.code === 'resource_missing' || stripeError?.message?.includes('No such customer')) {
        console.log(`Stripe customer ${profile.stripe_customer_id} not found - may be from old system`)
        return NextResponse.json({
          paymentMethod: null,
          needsNewCustomer: true
        })
      }
      throw stripeError
    }

    if (!customer || customer.deleted) {
      return NextResponse.json({
        paymentMethod: null
      })
    }

    const defaultPaymentMethod = customer.invoice_settings?.default_payment_method

    if (!defaultPaymentMethod || typeof defaultPaymentMethod === 'string') {
      return NextResponse.json({
        paymentMethod: null
      })
    }

    // Extract card details
    const card = defaultPaymentMethod.card
    if (!card) {
      return NextResponse.json({
        paymentMethod: null
      })
    }

    return NextResponse.json({
      paymentMethod: {
        id: defaultPaymentMethod.id,
        brand: card.brand.toUpperCase(),
        last4: card.last4,
        expMonth: card.exp_month,
        expYear: card.exp_year,
        name: defaultPaymentMethod.billing_details?.name || 'Cardholder'
      }
    })
  } catch (error) {
    console.error('Error fetching payment method:', error)
    return NextResponse.json(
      { error: 'Failed to fetch payment method' },
      { status: 500 }
    )
  }
}
