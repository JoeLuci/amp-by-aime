import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ghlClient } from '@/lib/ghl/client'
import { getImpersonationSettings } from '@/lib/impersonation-server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check for impersonation mode
    const impersonationSettings = await getImpersonationSettings()
    const isImpersonating = impersonationSettings?.isImpersonating && impersonationSettings?.impersonatedUserId
    const effectiveUserId = isImpersonating ? impersonationSettings.impersonatedUserId : user.id

    // Get user profile (use impersonated user's profile if impersonating)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, full_name, phone, company, plan_tier, ghl_contact_id')
      .eq('id', effectiveUserId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Check if user is admin (admins can register for testing regardless of tier)
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
    const isAdmin = adminProfile?.is_admin === true

    // Check eligibility (admins bypass tier check)
    const eligibleTiers = ['Premium', 'Elite', 'VIP']
    if (!isAdmin && (!profile.plan_tier || !eligibleTiers.includes(profile.plan_tier))) {
      return NextResponse.json(
        { error: 'Your membership tier does not include a Fuse ticket' },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json()
    const {
      fuse_event_id,
      first_name,
      last_name,
      preferred_name,
      phone,
      email,
      company,
      gender,
      fuse_attendance,
      ticket_type,
      has_hall_of_aime = false,
      has_wmn_at_fuse = false,
      marketing_consent = false,
      guests = [],
    } = body

    // Validation
    if (!fuse_event_id) {
      return NextResponse.json({ error: 'Event ID required' }, { status: 400 })
    }
    if (!first_name || !last_name) {
      return NextResponse.json({ error: 'First and last name required' }, { status: 400 })
    }
    if (!phone || !email || !company) {
      return NextResponse.json({ error: 'Phone, email, and company required' }, { status: 400 })
    }
    if (!gender || !fuse_attendance) {
      return NextResponse.json({ error: 'Gender and Fuse attendance required' }, { status: 400 })
    }

    // Get the event
    const { data: event } = await supabase
      .from('fuse_events')
      .select('id, year, name')
      .eq('id', fuse_event_id)
      .eq('is_active', true)
      .single()

    if (!event) {
      return NextResponse.json(
        { error: 'Event not found or not active' },
        { status: 404 }
      )
    }

    // Check for existing registration
    const { data: existingReg } = await supabase
      .from('fuse_registrations')
      .select('id')
      .eq('fuse_event_id', fuse_event_id)
      .eq('user_id', effectiveUserId)
      .single()

    if (existingReg) {
      return NextResponse.json(
        { error: 'You are already registered for this event' },
        { status: 400 }
      )
    }

    // Determine the correct ticket type based on tier
    let actualTicketType = ticket_type || 'general_admission'
    if (profile.plan_tier === 'VIP') {
      actualTicketType = 'vip'
    } else if (profile.plan_tier === 'Premium' || profile.plan_tier === 'Elite') {
      actualTicketType = 'general_admission'
    } else if (isAdmin) {
      // Admins without eligible tier default to GA for testing
      actualTicketType = 'general_admission'
    }

    const fullName = `${first_name} ${last_name}`.trim()

    // Create registration
    const { data: registration, error: regError } = await supabase
      .from('fuse_registrations')
      .insert({
        fuse_event_id,
        user_id: effectiveUserId,
        full_name: fullName,
        first_name,
        last_name,
        preferred_name: preferred_name || null,
        email: email.toLowerCase(),
        phone,
        company,
        gender,
        fuse_attendance,
        ticket_type: actualTicketType,
        tier: profile.plan_tier,
        purchase_type: 'claimed',
        has_hall_of_aime,
        has_wmn_at_fuse,
        marketing_consent,
        ghl_contact_id: profile.ghl_contact_id,
        registration_source: isAdmin ? 'admin_manual' : 'ghl_form',
      })
      .select()
      .single()

    if (regError) {
      console.error('Error creating registration:', regError)
      return NextResponse.json(
        { error: 'Failed to create registration' },
        { status: 500 }
      )
    }

    // Insert guests
    if (guests.length > 0) {
      const guestRecords = guests.map((guest: any) => ({
        registration_id: registration.id,
        full_name: guest.full_name,
        email: guest.email || null,
        phone: guest.phone || null,
        ticket_type: guest.ticket_type || 'vip_guest',
        is_included: guest.is_included || false,
      }))

      const { error: guestError } = await supabase
        .from('fuse_registration_guests')
        .insert(guestRecords)

      if (guestError) {
        console.error('Error inserting guests:', guestError)
      }
    }

    // Update profile's fuse_ticket_claimed_year
    await supabase
      .from('profiles')
      .update({ fuse_ticket_claimed_year: event.year })
      .eq('id', effectiveUserId)

    // Add GHL tags (skip for admin test registrations)
    const contactId = profile.ghl_contact_id
    if (contactId && !isAdmin) {
      try {
        const tags = [`fuse-${event.year}-registered`]
        if (actualTicketType === 'vip') {
          tags.push(`fuse-${event.year}-vip`)
        }
        if (has_hall_of_aime) {
          tags.push(`fuse-${event.year}-hall-of-aime`)
        }
        if (has_wmn_at_fuse) {
          tags.push(`fuse-${event.year}-wmn`)
        }

        await Promise.all(tags.map((tag) => ghlClient.addTagToContact(contactId, tag)))
      } catch (tagError) {
        console.error('Error adding GHL tags:', tagError)
      }
    }

    // Build Stripe line items for any paid add-ons or guest tickets
    const stripeLineItems: { price: string; quantity: number }[] = []

    // HOA add-on
    if (has_hall_of_aime && profile.plan_tier) {
      const { data: hoaPrice } = await supabase
        .from('fuse_ticket_prices')
        .select('price, stripe_price_id, is_included')
        .eq('fuse_event_id', fuse_event_id)
        .eq('product_key', 'hoa')
        .eq('tier', profile.plan_tier)
        .eq('is_active', true)
        .single()

      if (hoaPrice && !hoaPrice.is_included && hoaPrice.price > 0 && hoaPrice.stripe_price_id) {
        stripeLineItems.push({ price: hoaPrice.stripe_price_id, quantity: 1 })
      }
    }

    // Guest tickets
    if (guests.length > 0) {
      const { data: guestPrice } = await supabase
        .from('fuse_ticket_prices')
        .select('stripe_price_id')
        .eq('fuse_event_id', fuse_event_id)
        .eq('product_key', 'guest')
        .is('tier', null)
        .eq('is_active', true)
        .single()

      if (guestPrice?.stripe_price_id) {
        stripeLineItems.push({ price: guestPrice.stripe_price_id, quantity: guests.length })
      }
    }

    // If there are paid items, create Stripe checkout
    if (stripeLineItems.length > 0) {
      const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || ''

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: stripeLineItems,
        customer_email: email.toLowerCase(),
        metadata: {
          registration_id: registration.id,
          fuse_event_id,
          type: 'fuse_claim_addon',
        },
        success_url: `${origin}/dashboard/fuse-registration/confirmation`,
        cancel_url: `${origin}/dashboard/fuse-registration`,
      })

      return NextResponse.json({
        success: true,
        registration_id: registration.id,
        checkout_url: session.url,
      })
    }

    return NextResponse.json({
      success: true,
      registration_id: registration.id,
    })
  } catch (error: any) {
    console.error('Error in claim registration:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
