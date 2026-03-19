import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/config'
import Stripe from 'stripe'

// Map Stripe price IDs to plan tiers
function getPlanTierFromPrice(priceId: string): string {
  const priceTierMap: Record<string, string> = {
    // Add your price ID mappings here
    'price_vip': 'VIP',
    'price_elite': 'Elite',
    'price_premium': 'Premium',
  }

  // Check if the price ID contains certain keywords
  const priceIdLower = priceId.toLowerCase()
  if (priceIdLower.includes('vip')) return 'VIP'
  if (priceIdLower.includes('elite')) return 'Elite'
  if (priceIdLower.includes('premium')) return 'Premium'

  return priceTierMap[priceId] || 'Premium'
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Verify admin is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify caller is an admin
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin, role')
      .eq('id', user.id)
      .single()

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const {
      email,
      first_name,
      last_name,
      phone,
      password,
      stripe_customer_id,
      stripe_subscription_id,
      plan_tier,
      role = 'member'
    } = body

    // Validate required fields
    if (!email || !first_name || !last_name || !password) {
      return NextResponse.json(
        { error: 'Missing required fields: email, first_name, last_name, password' },
        { status: 400 }
      )
    }

    // Need either stripe_customer_id or stripe_subscription_id to lookup
    if (!stripe_customer_id && !stripe_subscription_id) {
      return NextResponse.json(
        { error: 'Either stripe_customer_id or stripe_subscription_id is required' },
        { status: 400 }
      )
    }

    // Fetch Stripe data
    let customerId = stripe_customer_id
    let subscriptionData: Stripe.Subscription | null = null
    let customerData: Stripe.Customer | null = null
    let determinedPlanTier = plan_tier

    if (stripe_subscription_id) {
      // Get subscription details
      subscriptionData = await stripe.subscriptions.retrieve(stripe_subscription_id)
      customerId = subscriptionData.customer as string

      // Get plan tier from subscription if not provided
      if (!determinedPlanTier && subscriptionData.items.data.length > 0) {
        const priceId = subscriptionData.items.data[0].price.id
        determinedPlanTier = getPlanTierFromPrice(priceId)
      }
    }

    if (customerId) {
      // Verify customer exists and get details
      const customer = await stripe.customers.retrieve(customerId)
      if (customer.deleted) {
        return NextResponse.json(
          { error: 'Stripe customer has been deleted' },
          { status: 400 }
        )
      }
      customerData = customer as Stripe.Customer

      // If no subscription provided, try to find one
      if (!subscriptionData) {
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: 'active',
          limit: 1,
        })
        if (subscriptions.data.length > 0) {
          subscriptionData = subscriptions.data[0]
          if (!determinedPlanTier && subscriptionData.items.data.length > 0) {
            const priceId = subscriptionData.items.data[0].price.id
            determinedPlanTier = getPlanTierFromPrice(priceId)
          }
        }
      }
    }

    // Check if user already exists
    const adminClient = createAdminClient()
    const { data: existingUsers } = await adminClient
      .from('profiles')
      .select('id, email')
      .eq('email', email.toLowerCase())

    if (existingUsers && existingUsers.length > 0) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 400 }
      )
    }

    // Create auth user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        first_name,
        last_name,
        full_name: `${first_name} ${last_name}`,
        phone: phone || '',
        role,
      },
    })

    if (createError || !newUser.user) {
      console.error('Error creating user:', createError)
      return NextResponse.json(
        { error: createError?.message || 'Failed to create user' },
        { status: 500 }
      )
    }

    // Guard: check if this subscription ID already belongs to another profile
    const finalSubscriptionId = subscriptionData?.id || stripe_subscription_id
    if (finalSubscriptionId) {
      const { data: existingOwner } = await adminClient
        .from('profiles')
        .select('id, email')
        .eq('stripe_subscription_id', finalSubscriptionId)
        .limit(1)
        .single()

      if (existingOwner) {
        // Clean up the created user since we can't assign this subscription
        await adminClient.auth.admin.deleteUser(newUser.user.id)
        return NextResponse.json(
          { error: `Subscription ${finalSubscriptionId} is already assigned to ${existingOwner.email}. Cannot assign to new user.` },
          { status: 400 }
        )
      }
    }

    // Update profile with Stripe data
    const subscriptionStatus = subscriptionData?.status || 'active'
    const { error: updateError } = await adminClient
      .from('profiles')
      .update({
        first_name,
        last_name,
        full_name: `${first_name} ${last_name}`,
        phone: phone || null,
        role,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionData?.id || stripe_subscription_id,
        subscription_status: subscriptionStatus,
        plan_tier: determinedPlanTier || 'Premium',
        profile_complete: true,
        onboarding_step: 'completed',
      })
      .eq('id', newUser.user.id)

    if (updateError) {
      console.error('Error updating profile:', updateError)
      // Try to clean up the created user
      await adminClient.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json(
        { error: 'Failed to update profile with Stripe data' },
        { status: 500 }
      )
    }

    // Update Stripe customer metadata to link back to Supabase
    if (customerId) {
      try {
        await stripe.customers.update(customerId, {
          metadata: {
            supabase_user_id: newUser.user.id,
          },
        })
      } catch (stripeError) {
        console.error('Error updating Stripe customer metadata:', stripeError)
        // Non-fatal, continue
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
      },
      stripe: {
        customer_id: customerId,
        subscription_id: subscriptionData?.id || stripe_subscription_id,
        subscription_status: subscriptionStatus,
        plan_tier: determinedPlanTier,
      },
    })

  } catch (error: any) {
    console.error('Error in create-user-with-stripe:', error)

    // Handle Stripe errors specifically
    if (error.type === 'StripeInvalidRequestError') {
      return NextResponse.json(
        { error: `Stripe error: ${error.message}` },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
