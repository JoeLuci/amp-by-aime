'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Image from 'next/image'

export default function AdminLoginPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()

      // Sign in with email and password
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      })

      if (signInError) {
        setError(signInError.message)
        setLoading(false)
        return
      }

      if (!authData.user) {
        setError('No user data returned')
        setLoading(false)
        return
      }

      // Fetch user profile to check if admin
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', authData.user.id)
        .single()

      if (profileError) {
        setError('Failed to fetch user profile')
        setLoading(false)
        return
      }

      // Check if user is admin (AIME team member)
      if (!profile.is_admin) {
        // Sign out the user
        await supabase.auth.signOut()
        setError('Access denied. Admin credentials required.')
        setLoading(false)
        return
      }

      // Update last login timestamp for admin
      await supabase
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', authData.user.id)

      // Redirect to admin dashboard
      router.push('/admin')
      router.refresh()
    } catch (err) {
      console.error('Login error:', err)
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <svg width="200" height="60" viewBox="0 0 200 60" className="text-[#dd1969]">
              <text x="100" y="35" textAnchor="middle" fill="currentColor" fontSize="32" fontWeight="bold" fontFamily="Arial, sans-serif">
                AMP
              </text>
              <text x="100" y="52" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="normal" fontFamily="Arial, sans-serif" letterSpacing="2">
                AIME MEMBER PORTAL
              </text>
            </svg>
          </div>
          <div className="space-y-2 text-center">
            <CardTitle className="text-2xl font-bold">Admin Login</CardTitle>
            <CardDescription>
              Sign in with your administrator credentials
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@aimegroup.com"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                required
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In as Admin'}
            </Button>

            <div className="text-center text-sm text-muted-foreground">
              <a href="/sign-in" className="hover:underline">
                Sign in as regular user
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
