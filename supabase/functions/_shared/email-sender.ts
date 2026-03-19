// Email sender for vendor notifications
// Uses Resend API (can be swapped for SendGrid, AWS SES, etc.)

export interface VendorEmailData {
  vendorEmail: string
  vendorName: string
  leadInfo: {
    name: string
    email: string
    phone?: string
    nmls?: string
    stateLicenses?: string[]
  }
}

export interface EmailResult {
  success: boolean
  error?: string
  messageId?: string
}

/**
 * Send email to vendor with lead information
 */
export async function sendVendorEmail(data: VendorEmailData): Promise<EmailResult> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')

  if (!resendApiKey) {
    console.error('RESEND_API_KEY not configured - email sending disabled')
    return {
      success: false,
      error: 'Email service not configured'
    }
  }

  const emailBody = generateVendorEmailHTML(data)
  const emailText = generateVendorEmailText(data)

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'AIME Group <noreply@notifications.aimegroup.com>',
        to: [data.vendorEmail],
        subject: `New Lead from AIME AMP - ${data.leadInfo.name}`,
        html: emailBody,
        text: emailText
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Email send failed:', errorText)
      return {
        success: false,
        error: `Email API error: ${response.status}`
      }
    }

    const result = await response.json()
    console.log('Email sent successfully:', result.id)

    return {
      success: true,
      messageId: result.id
    }

  } catch (error) {
    console.error('Error sending email:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Generate HTML email template for vendor
 */
function generateVendorEmailHTML(data: VendorEmailData): string {
  const { vendorName, leadInfo } = data

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Lead from AIME AMP</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #dd1969; padding: 20px; text-align: center;">
    <h1 style="color: white; margin: 0;">New Lead from AIME AMP</h1>
  </div>

  <div style="background-color: #f9f9f9; padding: 20px; margin-top: 20px; border-radius: 5px;">
    <h2 style="color: #dd1969; margin-top: 0;">Hi ${vendorName},</h2>
    <p>You have received a new connection request through the AIME AMP platform. Here are the details:</p>

    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr style="background-color: #fff;">
        <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">Name:</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${leadInfo.name}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">Email:</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">
          <a href="mailto:${leadInfo.email}" style="color: #dd1969; text-decoration: none;">${leadInfo.email}</a>
        </td>
      </tr>
      ${leadInfo.phone ? `
      <tr style="background-color: #fff;">
        <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">Phone:</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">
          <a href="tel:${leadInfo.phone}" style="color: #dd1969; text-decoration: none;">${leadInfo.phone}</a>
        </td>
      </tr>
      ` : ''}
      ${leadInfo.nmls ? `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">NMLS #:</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${leadInfo.nmls}</td>
      </tr>
      ` : ''}
      ${leadInfo.stateLicenses && leadInfo.stateLicenses.length > 0 ? `
      <tr style="background-color: #fff;">
        <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">State Licenses:</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${leadInfo.stateLicenses.join(', ')}</td>
      </tr>
      ` : ''}
    </table>

    <p>Please reach out to this member to discuss potential partnership opportunities.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="mailto:${leadInfo.email}?subject=Partnership%20Opportunity%20via%20AIME%20AMP"
         style="background-color: #dd1969; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
        Contact Lead
      </a>
    </div>
  </div>

  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 12px;">
    <p>This email was sent by the AIME AMP platform on behalf of one of our members.</p>
    <p>If you have any questions, please contact <a href="mailto:support@aime-amp.com" style="color: #dd1969;">support@aime-amp.com</a></p>
  </div>
</body>
</html>
  `.trim()
}

/**
 * Generate plain text email for vendor
 */
function generateVendorEmailText(data: VendorEmailData): string {
  const { vendorName, leadInfo } = data

  return `
Hi ${vendorName},

You have received a new connection request through the AIME AMP platform.

Lead Details:
- Name: ${leadInfo.name}
- Email: ${leadInfo.email}
${leadInfo.phone ? `- Phone: ${leadInfo.phone}` : ''}
${leadInfo.nmls ? `- NMLS #: ${leadInfo.nmls}` : ''}
${leadInfo.stateLicenses && leadInfo.stateLicenses.length > 0 ? `- State Licenses: ${leadInfo.stateLicenses.join(', ')}` : ''}

Please reach out to this member to discuss potential partnership opportunities.

---
This email was sent by the AIME AMP platform on behalf of one of our members.
If you have any questions, please contact support@aime-amp.com
  `.trim()
}
