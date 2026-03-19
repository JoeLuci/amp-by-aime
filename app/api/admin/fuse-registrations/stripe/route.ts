import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: admin } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!admin?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { action, registration_id, email, line_items } = body

    if (!registration_id) {
      return NextResponse.json({ error: 'Registration ID required' }, { status: 400 })
    }

    // Verify registration exists
    const { data: registration } = await supabase
      .from('fuse_registrations')
      .select('id, email, full_name, fuse_event_id')
      .eq('id', registration_id)
      .single()

    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    }

    const customerEmail = email || registration.email
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || ''

    // Build line items server-side from registration data + fuse_ticket_prices
    const buildLineItemsFromRegistration = async () => {
      const items: { price: string; quantity: number }[] = []

      // Get the full registration with guests
      const { data: fullReg } = await supabase
        .from('fuse_registrations')
        .select('*, guests:fuse_registration_guests(*)')
        .eq('id', registration_id)
        .single()

      if (!fullReg) return items

      // Fetch all prices for this event
      const { data: allPrices } = await supabase
        .from('fuse_ticket_prices')
        .select('*')
        .eq('fuse_event_id', fullReg.fuse_event_id)
        .eq('is_active', true)

      if (!allPrices) return items

      // GA ticket — find by tier or public
      if (fullReg.purchase_type === 'purchased' && fullReg.ticket_type === 'general_admission') {
        const gaPrice = allPrices.find(p => p.product_key === 'ga' && !p.tier && p.stripe_price_id)
        if (gaPrice) items.push({ price: gaPrice.stripe_price_id!, quantity: 1 })
      }

      // HOA — tier-specific or public
      if (fullReg.has_hall_of_aime) {
        const hoaPrice = allPrices.find(p => p.product_key === 'hoa' && p.tier === fullReg.tier && !p.is_included && p.stripe_price_id)
          || allPrices.find(p => p.product_key === 'hoa' && !p.tier && p.stripe_price_id)
        if (hoaPrice) items.push({ price: hoaPrice.stripe_price_id!, quantity: 1 })
      }

      // Guest tickets (non-included)
      const paidGuests = fullReg.guests?.filter((g: any) => !g.is_included) || []
      if (paidGuests.length > 0) {
        const guestPrice = allPrices.find(p => p.product_key === 'guest' && p.stripe_price_id)
        if (guestPrice) items.push({ price: guestPrice.stripe_price_id!, quantity: paidGuests.length })
      }

      return items
    }

    if (action === 'checkout') {
      const resolvedItems = line_items?.length > 0 ? line_items : await buildLineItemsFromRegistration()

      if (resolvedItems.length === 0) {
        return NextResponse.json({ error: 'No paid items found for this registration' }, { status: 400 })
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: resolvedItems,
        customer_email: customerEmail,
        metadata: {
          registration_id: registration.id,
          fuse_event_id: registration.fuse_event_id,
          type: 'fuse_admin_checkout',
          admin_user_id: user.id,
        },
        success_url: `${origin}/admin/fuse-registration?paid=${registration.id}`,
        cancel_url: `${origin}/admin/fuse-registration`,
      })

      return NextResponse.json({ checkout_url: session.url })
    }

    if (action === 'invoice') {
      const resolvedItems = line_items?.length > 0 ? line_items : await buildLineItemsFromRegistration()

      if (resolvedItems.length === 0) {
        return NextResponse.json({ error: 'No paid items found for this registration' }, { status: 400 })
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: resolvedItems,
        customer_email: customerEmail,
        metadata: {
          registration_id: registration.id,
          fuse_event_id: registration.fuse_event_id,
          type: 'fuse_member_invoice',
        },
        expires_at: Math.floor(Date.now() / 1000) + (72 * 60 * 60), // 72 hours
        success_url: `${origin}/dashboard/fuse-registration/confirmation`,
        cancel_url: `${origin}/dashboard`,
      })

      return NextResponse.json({
        payment_url: session.url,
        expires_at: new Date(session.expires_at! * 1000).toISOString(),
      })
    }

    if (action === 'claim_for_member') {
      // Admin claims a ticket on behalf of a member
      const { member_email } = body

      if (!member_email) {
        return NextResponse.json({ error: 'Member email required' }, { status: 400 })
      }

      // Look up the member
      const { data: member } = await supabase
        .from('profiles')
        .select('id, plan_tier, ghl_contact_id')
        .eq('email', member_email.toLowerCase())
        .single()

      if (!member) {
        return NextResponse.json({ error: 'Member not found' }, { status: 404 })
      }

      // Update the registration to link to the member
      const { error: updateError } = await supabase
        .from('fuse_registrations')
        .update({
          user_id: member.id,
          tier: member.plan_tier,
          purchase_type: 'claimed',
          ghl_contact_id: member.ghl_contact_id,
        })
        .eq('id', registration_id)

      if (updateError) {
        return NextResponse.json({ error: 'Failed to update registration' }, { status: 500 })
      }

      // Set fuse_ticket_claimed_year on the member's profile
      const { data: event } = await supabase
        .from('fuse_events')
        .select('year')
        .eq('id', registration.fuse_event_id)
        .single()

      if (event) {
        await supabase
          .from('profiles')
          .update({ fuse_ticket_claimed_year: event.year })
          .eq('id', member.id)
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    console.error('Error in admin fuse stripe:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
