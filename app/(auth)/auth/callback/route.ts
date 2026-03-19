import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const type = searchParams.get('type')
  const token_hash = searchParams.get('token_hash')
  const error = searchParams.get('error')
  const error_description = searchParams.get('error_description')

  // Get the correct base URL
  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocalEnv = process.env.NODE_ENV === 'development'
  const baseUrl = isLocalEnv ? origin : forwardedHost ? `https://${forwardedHost}` : origin

  // Handle errors from Supabase
  if (error) {
    console.error('Auth callback error:', error, error_description)
    return NextResponse.redirect(`${baseUrl}/sign-in?error=${encodeURIComponent(error_description || error)}`)
  }

  // Handle PKCE flow (code exchange)
  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (!exchangeError) {
      // Update last login timestamp (skip for recovery - they're resetting password)
      if (type !== 'recovery') {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase
            .from('profiles')
            .update({ last_login_at: new Date().toISOString() })
            .eq('id', user.id)
        }
      }

      // Redirect to appropriate page
      const redirectTo = type === 'recovery' ? '/reset-password' : next
      return NextResponse.redirect(`${baseUrl}${redirectTo}`)
    } else {
      console.error('Code exchange error:', exchangeError)
      return NextResponse.redirect(`${baseUrl}/sign-in?error=${encodeURIComponent(exchangeError.message)}`)
    }
  }

  // Handle magic link / OTP flow with token_hash
  if (token_hash && type) {
    const supabase = await createClient()
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'magiclink' | 'recovery' | 'invite' | 'signup' | 'email_change',
    })

    if (!verifyError) {
      // Update last login timestamp (skip for recovery)
      if (type !== 'recovery') {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase
            .from('profiles')
            .update({ last_login_at: new Date().toISOString() })
            .eq('id', user.id)
        }
      }

      const redirectTo = type === 'recovery' ? '/reset-password' : '/dashboard'
      return NextResponse.redirect(`${baseUrl}${redirectTo}`)
    } else {
      console.error('OTP verification error:', verifyError)
      return NextResponse.redirect(`${baseUrl}/sign-in?error=${encodeURIComponent(verifyError.message)}`)
    }
  }

  // For implicit flow (recovery emails), the token is in the hash fragment
  // which the server can't see. Redirect to the destination page which will
  // handle the hash token client-side.
  if (type === 'recovery') {
    return NextResponse.redirect(`${baseUrl}/reset-password`)
  }

  // No valid auth parameters - redirect to sign-in
  return NextResponse.redirect(`${baseUrl}/sign-in?error=${encodeURIComponent('Invalid or expired link. Please try again.')}`)
}
