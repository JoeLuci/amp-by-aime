'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

function SignInContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Show error from URL params (e.g., from failed magic link)
  useEffect(() => {
    const error = searchParams.get('error')
    if (error) {
      toast.error(error)
      // Clean up the URL
      router.replace('/sign-in', { scroll: false })
    }
  }, [searchParams, router])

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      // Check if user is an admin
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', data.user.id)
        .single()

      // Reject admin users - they should use the admin login page
      if (profile?.is_admin) {
        await supabase.auth.signOut()
        toast.error('Admin users must sign in at /admin/login')
        setIsLoading(false)
        return
      }

      // Update last login timestamp
      await supabase
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', data.user.id)

      toast.success('Welcome back!')
      router.push('/dashboard')
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to sign in')
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

        {/* Migration Banner */}
        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-4 text-center">
          <p className="text-white text-sm">
            <strong>Welcome to the new AMP Member Portal!</strong>
          </p>
          <p className="text-white/80 text-sm mt-1">
            If this is your first time here, please{' '}
            <Link href="/forgot-password" className="underline text-white hover:text-white/80">
              reset your password
            </Link>{' '}
            to access your account.
          </p>
        </div>

        {/* Sign In Form */}
        <form onSubmit={handleSignIn} className="space-y-4">
          <Input
            id="email"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-14 bg-white text-gray-900 placeholder:text-gray-500 border-0 rounded-lg text-base"
          />

          <div className="relative">
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-14 bg-white text-gray-900 placeholder:text-gray-500 border-0 rounded-lg text-base pr-12"
            />
          </div>

          <div className="text-center">
            <Link
              href="/forgot-password"
              className="text-sm text-white hover:text-white/80 transition-colors underline"
            >
              Forgot your password?
            </Link>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-14 bg-white hover:bg-gray-100 text-gray-900 font-semibold text-base rounded-full shadow-lg"
          >
            {isLoading ? 'Logging in...' : 'Log In'}
          </Button>
        </form>

        {/* Sign Up Link */}
        <div className="text-center space-y-2">
          <p className="text-white text-sm">
            Not a Member? Sign up now.
          </p>
          <div className="flex justify-center">
            <Button
              asChild
              className="w-2/3 max-w-xs h-11 bg-[#dd1969] hover:bg-[#c01559] text-white font-semibold text-sm rounded-full shadow-lg"
            >
              <Link href="/sign-up">Sign Up</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <SignInContent />
    </Suspense>
  )
}
