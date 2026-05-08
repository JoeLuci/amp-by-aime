'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, Suspense } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'

function ConfirmResetContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  // Support both token and token_hash (Supabase uses different ones depending on flow)
  const token = searchParams.get('token')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  const handleConfirm = () => {
    setIsLoading(true)
    // Redirect to Supabase verify endpoint - this is what consumes the token
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const redirectTo = `${window.location.origin}/reset-password`

    // Use token if available, otherwise token_hash
    if (token) {
      window.location.href = `${supabaseUrl}/auth/v1/verify?token=${token}&type=${type}&redirect_to=${encodeURIComponent(redirectTo)}`
    } else {
      window.location.href = `${supabaseUrl}/auth/v1/verify?token_hash=${tokenHash}&type=${type}&redirect_to=${encodeURIComponent(redirectTo)}`
    }
  }

  if ((!token && !tokenHash) || !type) {
    return (
      <div className="text-center text-white space-y-4">
        <p>Invalid reset link. Please request a new password reset.</p>
        <Button
          onClick={() => router.push('/forgot-password')}
          className="bg-white hover:bg-gray-100 text-gray-900 font-semibold rounded-full"
        >
          Request New Link
        </Button>
      </div>
    )
  }

  return (
    <div className="text-center space-y-6">
      <h1 className="text-2xl font-bold text-white">Reset Your Password</h1>
      <p className="text-white/80">Click the button below to continue to the password reset page.</p>
      <Button
        onClick={handleConfirm}
        disabled={isLoading}
        className="w-full h-14 bg-white hover:bg-gray-100 text-gray-900 font-semibold text-base rounded-full shadow-lg"
      >
        {isLoading ? 'Redirecting...' : 'Reset My Password'}
      </Button>
      <p className="text-white/60 text-sm">
        This extra step protects your account from email security scanners.
      </p>
    </div>
  )
}

export default function ConfirmResetPage() {
  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      <div className="absolute inset-0 z-0 bg-[#021649]" />
      <div className="relative z-10 w-full max-w-md">
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
        <Suspense fallback={<div className="text-white text-center">Loading...</div>}>
          <ConfirmResetContent />
        </Suspense>
      </div>
    </div>
  )
}
