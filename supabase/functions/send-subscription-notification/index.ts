import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const NOTIFICATION_EMAIL = 'brokermembership@aimegroup.com'

interface NotificationPayload {
  type: 'upgrade' | 'downgrade' | 'cancellation'
  userEmail: string
  userName: string
  fromTier: string
  toTier: string
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
    const payload: NotificationPayload = await req.json()
    const { type, userEmail, userName, fromTier, toTier } = payload

    if (!RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not configured - notification email disabled')
      return new Response(
        JSON.stringify({ success: false, error: 'Email service not configured' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Generate email content based on type
    const subject = getSubject(type, userName)
    const html = generateEmailHTML(type, userName, userEmail, fromTier, toTier)
    const text = generateEmailText(type, userName, userEmail, fromTier, toTier)

    // Send notification to brokermembership@aimegroup.com
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'AIME Group <noreply@notifications.aimegroup.com>',
        to: [NOTIFICATION_EMAIL],
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
    console.log(`Subscription ${type} notification sent for ${userEmail}:`, result.id)

    return new Response(
      JSON.stringify({ success: true, messageId: result.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error sending notification:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to send notification' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

function getSubject(type: string, userName: string): string {
  switch (type) {
    case 'upgrade':
      return `[AMP] Subscription Upgrade: ${userName}`
    case 'downgrade':
      return `[AMP] Subscription Downgrade: ${userName}`
    case 'cancellation':
      return `[AMP] Subscription Cancellation: ${userName}`
    default:
      return `[AMP] Subscription Change: ${userName}`
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'upgrade':
      return 'UPGRADE'
    case 'downgrade':
      return 'DOWNGRADE'
    case 'cancellation':
      return 'CANCELLATION'
    default:
      return 'CHANGE'
  }
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'upgrade':
      return '#10B981' // green
    case 'downgrade':
      return '#F59E0B' // amber
    case 'cancellation':
      return '#EF4444' // red
    default:
      return '#6B7280' // gray
  }
}

function generateEmailHTML(type: string, userName: string, userEmail: string, fromTier: string, toTier: string): string {
  const typeLabel = getTypeLabel(type)
  const typeColor = getTypeColor(type)
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription ${typeLabel}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${typeColor}; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Subscription ${typeLabel}</h1>
  </div>

  <div style="background-color: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px; margin-bottom: 20px;">A member has ${type === 'cancellation' ? 'canceled their subscription' : `${type}d their subscription`}:</p>

    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: white; border-radius: 8px; overflow: hidden;">
      <tr>
        <td style="padding: 12px 15px; border-bottom: 1px solid #eee; font-weight: bold; width: 140px;">Member Name:</td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #eee;">${userName || 'N/A'}</td>
      </tr>
      <tr>
        <td style="padding: 12px 15px; border-bottom: 1px solid #eee; font-weight: bold;">Email:</td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #eee;">
          <a href="mailto:${userEmail}" style="color: #dd1969; text-decoration: none;">${userEmail}</a>
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 15px; border-bottom: 1px solid #eee; font-weight: bold;">Previous Tier:</td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #eee;">${fromTier}</td>
      </tr>
      <tr>
        <td style="padding: 12px 15px; border-bottom: 1px solid #eee; font-weight: bold;">New Tier:</td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #eee;">
          <span style="background-color: ${typeColor}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 14px;">${toTier}</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 15px; font-weight: bold;">Timestamp:</td>
        <td style="padding: 12px 15px;">${timestamp} ET</td>
      </tr>
    </table>

    ${type === 'cancellation' ? `
    <div style="background-color: #FEE2E2; border: 1px solid #FECACA; border-radius: 8px; padding: 15px; margin-top: 20px;">
      <p style="margin: 0; color: #DC2626; font-weight: bold;">Action Required</p>
      <p style="margin: 10px 0 0 0; color: #7F1D1D;">Consider reaching out to understand why this member canceled their subscription.</p>
    </div>
    ` : ''}

    ${type === 'downgrade' ? `
    <div style="background-color: #FEF3C7; border: 1px solid #FCD34D; border-radius: 8px; padding: 15px; margin-top: 20px;">
      <p style="margin: 0; color: #B45309; font-weight: bold;">Note</p>
      <p style="margin: 10px 0 0 0; color: #78350F;">This member has downgraded. You may want to follow up to understand their needs.</p>
    </div>
    ` : ''}

    <div style="text-align: center; margin-top: 25px;">
      <a href="https://amp.aimegroup.com/admin/users?search=${encodeURIComponent(userEmail)}"
         style="background-color: #dd1969; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
        View Member in Admin
      </a>
    </div>
  </div>

  <div style="margin-top: 20px; text-align: center; color: #666; font-size: 12px;">
    <p>This is an automated notification from the AIME AMP platform.</p>
  </div>
</body>
</html>
  `.trim()
}

function generateEmailText(type: string, userName: string, userEmail: string, fromTier: string, toTier: string): string {
  const typeLabel = getTypeLabel(type)
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })

  return `
SUBSCRIPTION ${typeLabel}

A member has ${type === 'cancellation' ? 'canceled their subscription' : `${type}d their subscription`}:

Member Name: ${userName || 'N/A'}
Email: ${userEmail}
Previous Tier: ${fromTier}
New Tier: ${toTier}
Timestamp: ${timestamp} ET

${type === 'cancellation' ? 'ACTION REQUIRED: Consider reaching out to understand why this member canceled their subscription.' : ''}
${type === 'downgrade' ? 'NOTE: This member has downgraded. You may want to follow up to understand their needs.' : ''}

View member in admin: https://amp.aimegroup.com/admin/users?search=${encodeURIComponent(userEmail)}

---
This is an automated notification from the AIME AMP platform.
  `.trim()
}
