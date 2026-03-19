import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const SUPPORT_EMAIL = 'brokermembership@aimegroup.com'

interface MemberEmailPayload {
  type: 'upgrade' | 'downgrade' | 'cancellation'
  memberEmail: string
  firstName: string
  tierName?: string // For upgrade
  subscriptionEndDate?: string // For cancellation and downgrade (ISO date string)
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  try {
    const payload: MemberEmailPayload = await req.json()
    const { type, memberEmail, firstName, tierName, subscriptionEndDate } = payload

    if (!RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not configured - member email disabled')
      return new Response(
        JSON.stringify({ success: false, error: 'Email service not configured' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!memberEmail) {
      return new Response(
        JSON.stringify({ success: false, error: 'Member email is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Format the subscription end date for display
    const formattedEndDate = subscriptionEndDate
      ? new Date(subscriptionEndDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : ''

    // Generate email content based on type
    const { subject, html, text } = generateEmail(type, firstName || 'Member', tierName, formattedEndDate)

    // Send email to the member
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'AIME Group <noreply@notifications.aimegroup.com>',
        to: [memberEmail],
        subject,
        html,
        text,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Email send failed:', errorText)
      return new Response(
        JSON.stringify({ success: false, error: `Email API error: ${response.status}` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const result = await response.json()
    console.log(`Member ${type} email sent to ${memberEmail}:`, result.id)

    return new Response(
      JSON.stringify({ success: true, messageId: result.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error sending member email:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to send member email' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

interface EmailContent {
  subject: string
  html: string
  text: string
}

function generateEmail(
  type: 'upgrade' | 'downgrade' | 'cancellation',
  firstName: string,
  tierName?: string,
  subscriptionEndDate?: string
): EmailContent {
  switch (type) {
    case 'cancellation':
      return generateCancellationEmail(firstName, subscriptionEndDate || '')
    case 'upgrade':
      return generateUpgradeEmail(firstName, tierName || '')
    case 'downgrade':
      return generateDowngradeEmail(firstName, subscriptionEndDate || '')
    default:
      throw new Error(`Unknown email type: ${type}`)
  }
}

function generateCancellationEmail(firstName: string, subscriptionEndDate: string): EmailContent {
  const subject = 'AIME Membership Cancellation Confirmation'

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Membership Cancellation Confirmation</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #dd1969; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">AIME Membership</h1>
  </div>

  <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${firstName},</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      This email confirms that your membership has been successfully canceled.
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Your access will remain active through the end of your current subscription period, which is set to end on <strong>${subscriptionEndDate}</strong>. You will continue to receive all membership benefits until that date, and no further charges will occur after your subscription concludes.
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      If you have any questions or need additional assistance, please don't hesitate to reach out to us at
      <a href="mailto:${SUPPORT_EMAIL}" style="color: #dd1969; text-decoration: none;">${SUPPORT_EMAIL}</a>.
    </p>

    <p style="font-size: 16px; margin-bottom: 0;">
      Thank you for being a member of our community.
    </p>
  </div>

  <div style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">
    <p>AIME - Association of Independent Mortgage Experts</p>
  </div>
</body>
</html>
  `.trim()

  const text = `
Hi ${firstName},

This email confirms that your membership has been successfully canceled.

Your access will remain active through the end of your current subscription period, which is set to end on ${subscriptionEndDate}. You will continue to receive all membership benefits until that date, and no further charges will occur after your subscription concludes.

If you have any questions or need additional assistance, please don't hesitate to reach out to us at ${SUPPORT_EMAIL}.

Thank you for being a member of our community.

---
AIME - Association of Independent Mortgage Experts
  `.trim()

  return { subject, html, text }
}

function generateUpgradeEmail(firstName: string, tierName: string): EmailContent {
  const subject = 'AIME Membership Plan Change'

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Membership Plan Change</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #dd1969; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">AIME Membership</h1>
  </div>

  <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${firstName},</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Your upgrade to <strong>${tierName}</strong> membership is now active and your new benefits are available immediately.
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      If you have any questions about your plan or need help reviewing your membership options, please contact us at
      <a href="mailto:${SUPPORT_EMAIL}" style="color: #dd1969; text-decoration: none;">${SUPPORT_EMAIL}</a>.
    </p>

    <p style="font-size: 16px; margin-bottom: 0;">
      Thank you for being a valued member of our community.
    </p>
  </div>

  <div style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">
    <p>AIME - Association of Independent Mortgage Experts</p>
  </div>
</body>
</html>
  `.trim()

  const text = `
Hi ${firstName},

Your upgrade to ${tierName} membership is now active and your new benefits are available immediately.

If you have any questions about your plan or need help reviewing your membership options, please contact us at ${SUPPORT_EMAIL}.

Thank you for being a valued member of our community.

---
AIME - Association of Independent Mortgage Experts
  `.trim()

  return { subject, html, text }
}

function generateDowngradeEmail(firstName: string, subscriptionEndDate: string): EmailContent {
  const subject = 'AIME Membership Plan Change'

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Membership Plan Change</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #dd1969; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">AIME Membership</h1>
  </div>

  <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${firstName},</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Your membership downgrade has been scheduled and will take effect at the end of your current subscription period on <strong>${subscriptionEndDate}</strong>. Until then, you may continue to enjoy your current plan benefits.
    </p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      If you have any questions about your plan or need help reviewing your membership options, please contact us at
      <a href="mailto:${SUPPORT_EMAIL}" style="color: #dd1969; text-decoration: none;">${SUPPORT_EMAIL}</a>.
    </p>

    <p style="font-size: 16px; margin-bottom: 0;">
      Thank you for being a valued member of our community.
    </p>
  </div>

  <div style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">
    <p>AIME - Association of Independent Mortgage Experts</p>
  </div>
</body>
</html>
  `.trim()

  const text = `
Hi ${firstName},

Your membership downgrade has been scheduled and will take effect at the end of your current subscription period on ${subscriptionEndDate}. Until then, you may continue to enjoy your current plan benefits.

If you have any questions about your plan or need help reviewing your membership options, please contact us at ${SUPPORT_EMAIL}.

Thank you for being a valued member of our community.

---
AIME - Association of Independent Mortgage Experts
  `.trim()

  return { subject, html, text }
}
