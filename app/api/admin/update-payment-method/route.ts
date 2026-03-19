import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Check if user is admin
    const { data: { user: adminUser } } = await supabase.auth.getUser()
    if (!adminUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // TODO: Re-enable admin role check when roles are properly configured
    // const { data: adminProfile } = await supabase
    //   .from('profiles')
    //   .select('role')
    //   .eq('id', adminUser.id)
    //   .single()

    // const adminRoles = ['admin', 'super_admin', 'Broker Owner', 'Partner Lender', 'Partner Vendor']
    // if (!adminProfile || !adminRoles.includes(adminProfile.role)) {
    //   return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    // }

    // Get request data
    const { userId, customerId } = await request.json()

    if (!userId || !customerId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get base URL from environment or construct from request headers
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
                    `${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('host')}`

    // Create a Stripe Checkout session in 'setup' mode to update payment method
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'setup',
      payment_method_types: ['card'],
      success_url: `${baseUrl}/admin/users?payment_updated=true&user=${userId}`,
      cancel_url: `${baseUrl}/admin/users?payment_cancelled=true`,
      metadata: {
        supabase_user_id: userId,
        admin_initiated: 'true',
        admin_user_id: adminUser.id,
      },
    })

    if (!session.url) {
      return NextResponse.json(
        { error: 'Failed to create checkout session URL' },
        { status: 500 }
      )
    }

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Error creating payment update session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create payment update session' },
      { status: 500 }
    )
  }
}
