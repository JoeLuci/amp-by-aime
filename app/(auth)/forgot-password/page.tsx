'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSendingMagicLink, setIsSendingMagicLink] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) throw error

      setEmailSent(true)
      toast.success('Password reset email sent! Please check your inbox.')
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reset email')
    } finally {
      setIsLoading(false)
    }
  }

  const handleMagicLink = async () => {
    if (!email) {
      toast.error('Please enter your email address first')
      return
    }

    setIsSendingMagicLink(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) throw error

      setMagicLinkSent(true)
      toast.success('Magic link sent! Check your email.')
    } catch (error: any) {
      toast.error(error.message || 'Failed to send magic link')
    } finally {
      setIsSendingMagicLink(false)
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/assets/AMP-BackgroundFull-optimized.jpg"
          alt="AMP Background"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 dotted-pattern" />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center mb-12">
          <Image
            src="/assets/AMP_MemberPortalLogo_White.svg"
            alt="AMP AIME Member Portal"
            width={350}
            height={100}
            className="w-auto h-24 mx-auto"
            priority
          />
        </div>

        {emailSent || magicLinkSent ? (
          /* Success Message */
          <div className="text-center space-y-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-8 border border-white/20">
              <h2 className="text-2xl font-semibold text-white mb-4">
                Check Your Email
              </h2>
              <p className="text-white/90 mb-6">
                {magicLinkSent ? (
                  <>We've sent a magic login link to <strong>{email}</strong>. Click the link in the email to sign in directly.</>
                ) : (
                  <>We've sent a password reset link to <strong>{email}</strong>. Please check your inbox and follow the instructions to reset your password.</>
                )}
              </p>
            </div>
            <Button
              asChild
              className="w-full h-14 bg-white hover:bg-gray-100 text-gray-900 font-semibold text-base rounded-full shadow-lg"
            >
              <Link href="/sign-in">Back to Sign In</Link>
            </Button>
            <button
              type="button"
              onClick={() => { setEmailSent(false); setMagicLinkSent(false); }}
              className="text-white/70 text-sm underline hover:text-white"
            >
              Try again
            </button>
          </div>
        ) : (
          /* Reset Password Form */
          <>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-14 bg-white text-gray-900 placeholder:text-gray-500 border-0 rounded-lg text-base"
              />

              <Button
                type="submit"
                disabled={isLoading || isSendingMagicLink}
                className="w-full h-14 bg-white hover:bg-gray-100 text-gray-900 font-semibold text-base rounded-full shadow-lg"
              >
                {isLoading ? 'Sending...' : 'Send Password Reset Link'}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/30" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-transparent px-2 text-white/70">Or</span>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleMagicLink}
                disabled={isLoading || isSendingMagicLink}
                variant="outline"
                className="w-full h-12 bg-transparent hover:bg-white/10 text-white border-white/30 hover:border-white/50 font-medium text-sm rounded-full"
              >
                {isSendingMagicLink ? 'Sending...' : 'Send Magic Link to Sign In'}
              </Button>

              <p className="text-white/60 text-xs text-center">
                Magic link lets you sign in without resetting your password
              </p>
            </form>

            {/* Back to Sign In */}
            <div className="text-center space-y-2">
              <p className="text-white text-sm">
                Remember your password?
              </p>
              <div className="flex justify-center">
                <Button
                  asChild
                  className="w-2/3 max-w-xs h-11 bg-[#dd1969] hover:bg-[#c01559] text-white font-semibold text-sm rounded-full shadow-lg"
                >
                  <Link href="/sign-in">Back to Sign In</Link>
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
