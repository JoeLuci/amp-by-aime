'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Check for error in URL hash (Supabase sends errors this way)
    const hash = window.location.hash.substring(1)
    if (hash) {
      const params = new URLSearchParams(hash)
      const error = params.get('error')
      const errorDescription = params.get('error_description')

      if (error) {
        const message = errorDescription
          ? decodeURIComponent(errorDescription.replace(/\+/g, ' '))
          : 'Password reset link has expired. Please request a new one.'
        toast.error(message)
        router.push('/forgot-password')
      }
    }
  }, [router])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setIsLoading(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        password: password
      })

      if (error) throw error

      toast.success('Password updated successfully!')
      router.push('/sign-in')
    } catch (error: any) {
      toast.error(error.message || 'Failed to reset password')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      {/* Solid brand background */}
      <div className="absolute inset-0 z-0 bg-[#021649]" />

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

        {/* Reset Password Form */}
        <form onSubmit={handleResetPassword} className="space-y-4">
          <Input
            type="password"
            placeholder="New Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="h-14 bg-white text-gray-900 placeholder:text-gray-500 border-0 rounded-lg text-base"
          />

          <Input
            type="password"
            placeholder="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            className="h-14 bg-white text-gray-900 placeholder:text-gray-500 border-0 rounded-lg text-base"
          />

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-14 bg-white hover:bg-gray-100 text-gray-900 font-semibold text-base rounded-full shadow-lg"
          >
            {isLoading ? 'Resetting...' : 'Reset Password'}
          </Button>
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
      </div>
    </div>
  )
}
