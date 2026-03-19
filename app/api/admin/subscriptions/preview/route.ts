import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/config'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { subscriptionId, newPriceId } = await request.json()

    if (!subscriptionId || !newPriceId) {
      return NextResponse.json(
        { error: 'subscriptionId and newPriceId are required' },
        { status: 400 }
      )
    }

    // Get the current subscription
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)

    if (!subscription || subscription.status === 'canceled') {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 400 }
      )
    }

    // Get the current subscription item
    const currentItem = subscription.items.data[0]
    if (!currentItem) {
      return NextResponse.json(
        { error: 'No subscription item found' },
        { status: 400 }
      )
    }

    // Log current subscription state
    // Cast to any to access period fields (Stripe types vary by version)
    const sub = subscription as any
    const periodStart = sub.current_period_start
    const periodEnd = sub.current_period_end
    console.log('Current subscription:', {
      id: subscription.id,
      status: subscription.status,
      currentPriceId: currentItem.price.id,
      currentItemId: currentItem.id,
      newPriceId,
      currentPeriodStart: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    })

    // Create an invoice preview with the new price
    const invoicePreview = await stripe.invoices.createPreview({
      customer: subscription.customer as string,
      subscription: subscriptionId,
      subscription_details: {
        items: [
          {
            id: currentItem.id,
            price: newPriceId,
          },
        ],
        proration_behavior: 'create_prorations',
      },
    })

    // Log the invoice preview details
    console.log('Invoice preview lines:', invoicePreview.lines.data.map((line: any) => ({
      description: line.description,
      amount: line.amount / 100,
      proration: line.proration,
      type: line.type,
      period: line.period,
    })))
    console.log('Invoice preview totals:', {
      subtotal: invoicePreview.subtotal / 100,
      total: invoicePreview.total / 100,
      amountDue: invoicePreview.amount_due / 100,
    })

    // Calculate proration - exclude the next full billing cycle
    // Proration lines are those that start around "now" (within a day), not future full periods
    const now = Math.floor(Date.now() / 1000)
    const oneDayInSeconds = 86400

    // Filter to only proration-related items (items starting around now, not future periods)
    const prorationLines = invoicePreview.lines.data.filter((line: any) => {
      const periodStart = line.period?.start
      // If period starts within 1 day of now, it's a proration adjustment
      // If it starts far in the future, it's the next billing cycle
      return periodStart && Math.abs(periodStart - now) < oneDayInSeconds
    })

    const prorationCredit = prorationLines
      .filter((line: any) => line.amount < 0)
      .reduce((sum: number, line: any) => sum + Math.abs(line.amount), 0)

    const prorationCharge = prorationLines
      .filter((line: any) => line.amount > 0)
      .reduce((sum: number, line: any) => sum + line.amount, 0)

    // Net proration amount (what they pay/receive today for the plan switch)
    const netProration = prorationCharge - prorationCredit

    console.log('Proration calculation:', {
      prorationLinesCount: prorationLines.length,
      prorationCredit: prorationCredit / 100,
      prorationCharge: prorationCharge / 100,
      netProration: netProration / 100,
    })

    return NextResponse.json({
      success: true,
      preview: {
        // Net proration is the immediate charge for the plan switch (excluding next full billing)
        amountDue: netProration,
        prorationCredit,
        prorationCharge,
        // Also include the full invoice totals for reference
        invoiceTotal: invoicePreview.amount_due,
        subtotal: invoicePreview.subtotal,
        total: invoicePreview.total,
        currency: invoicePreview.currency,
        lines: invoicePreview.lines.data.map((line: any) => ({
          description: line.description,
          amount: line.amount,
          proration: line.proration,
        })),
        periodStart: periodStart,
        periodEnd: periodEnd,
      },
    })
  } catch (error: any) {
    console.error('Proration preview error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get proration preview' },
      { status: 500 }
    )
  }
}
