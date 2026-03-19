import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

Deno.serve(async (req) => {
  // Verify this is called from a trusted source (cron or admin)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const now = new Date().toISOString()

    // Find all users with expired overrides
    const { data: expiredUsers, error: fetchError } = await supabase
      .from('profiles')
      .select('id, email, full_name, override_plan_tier, override_expires_at')
      .eq('subscription_override', true)
      .lt('override_expires_at', now)

    if (fetchError) {
      console.error('Error fetching expired overrides:', fetchError)
      throw fetchError
    }

    if (!expiredUsers || expiredUsers.length === 0) {
      console.log('No expired overrides found')
      return new Response(
        JSON.stringify({ message: 'No expired overrides', processed: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${expiredUsers.length} expired overrides`)

    // Process each expired override
    const results = []
    for (const user of expiredUsers) {
      console.log(`Processing expired override for ${user.email} (${user.full_name})`)

      // Update user to Canceled status
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          plan_tier: 'Canceled',
          subscription_status: 'canceled',
          subscription_override: false,
          override_plan_tier: null,
          override_subscription_status: null,
          override_reason: null,
          override_expires_at: null,
          override_set_by: null,
          override_set_at: null,
          escalations_remaining: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (updateError) {
        console.error(`Error updating user ${user.email}:`, updateError)
        results.push({ id: user.id, email: user.email, success: false, error: updateError.message })
      } else {
        console.log(`Successfully canceled override for ${user.email}`)
        results.push({ id: user.id, email: user.email, success: true })

        // Track the cancellation
        try {
          await supabase.rpc('track_subscription_conversion', {
            p_user_id: user.id,
            p_from_tier: user.override_plan_tier || 'Unknown',
            p_to_tier: 'Canceled',
            p_conversion_type: 'override_expiration'
          })
        } catch (trackError) {
          console.error('Error tracking override expiration:', trackError)
        }

        // Send notification email
        try {
          const notifyUrl = `${supabaseUrl}/functions/v1/send-subscription-notification`
          await fetch(notifyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              type: 'override_expired',
              userEmail: user.email,
              userName: user.full_name,
              fromTier: user.override_plan_tier,
              toTier: 'Canceled',
            }),
          })
        } catch (emailError) {
          console.error('Error sending notification email:', emailError)
        }
      }
    }

    const successCount = results.filter(r => r.success).length
    console.log(`Processed ${results.length} overrides, ${successCount} successful`)

    return new Response(
      JSON.stringify({
        message: `Processed ${results.length} expired overrides`,
        processed: results.length,
        successful: successCount,
        results
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Expire overrides error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to process expired overrides' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
