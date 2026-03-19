'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { UserRole } from '@/types/database.types'
import { getRoleDisplayName } from '@/lib/constants/roles'

const USER_ROLES: UserRole[] = [
  'loan_officer',
  'broker_owner',
  'loan_officer_assistant',
  'processor',
]

export default function SignUpPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    role: '' as UserRole,
    company: '',
    phone: '',
    hasNMLS: 'no',
    nmlsNumber: '',
  })
  const [isLoading, setIsLoading] = useState(false)

  // Roles that require NMLS
  const requiresNMLS = formData.role === 'loan_officer' || formData.role === 'broker_owner'

  // Show NMLS question for other roles
  const showNMLSQuestion = formData.role && !requiresNMLS

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (!formData.role) {
      toast.error('Please select your role')
      return
    }

    // Validate NMLS for roles that require it
    if (requiresNMLS && !formData.nmlsNumber) {
      toast.error('NMLS Number is required for Loan Officers and Broker Owners')
      return
    }

    // Validate NMLS if user said they have one
    if (formData.hasNMLS === 'yes' && !formData.nmlsNumber) {
      toast.error('Please enter your NMLS Number')
      return
    }

    setIsLoading(true)

    try {
      const supabase = createClient()

      // Sign up with metadata
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            role: formData.role,
            company: formData.company,
            phone: formData.phone,
            nmls_number: formData.nmlsNumber || null,
          },
        },
      })

      if (error) throw error

      // Profile is created automatically by the database trigger
      // The trigger handles all the metadata we pass in options.data
      console.log('User created, profile will be created by trigger with data:', {
        full_name: formData.fullName,
        role: formData.role,
        company: formData.company,
        phone: formData.phone,
        nmls_number: formData.nmlsNumber || null,
      })

      // Send contact to GoHighLevel CRM (non-blocking)
      if (data.user?.id) {
        fetch('/api/ghl/create-contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: data.user.id,
            email: formData.email,
            fullName: formData.fullName,
            phone: formData.phone,
            role: formData.role,
            nmlsNumber: formData.nmlsNumber || null,
            companyName: formData.company,
          }),
        }).catch((ghlError) => {
          // Log but don't block signup flow
          console.error('GHL contact creation failed:', ghlError)
        })
      }

      toast.success('Account created successfully! Redirecting to plan selection...')
      // Redirect to plan selection page
      router.push('/onboarding/select-plan')
    } catch (error: any) {
      toast.error(error.message || 'Failed to create account')
    } finally {
      setIsLoading(false)
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

      <div className="relative z-10 w-full max-w-2xl space-y-4">
        {/* Logo */}
        <div className="text-center mb-6">
          <Image
            src="/assets/AMP_MemberPortalLogo_White.svg"
            alt="AMP AIME Member Portal"
            width={300}
            height={80}
            className="w-auto h-20 mx-auto"
            priority
          />
        </div>

        {/* Sign Up Form */}
        <form onSubmit={handleSignUp} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="text"
              placeholder="Full Name"
              value={formData.fullName}
              onChange={(e) =>
                setFormData({ ...formData, fullName: e.target.value })
              }
              required
              className="h-12 bg-white text-gray-900 placeholder:text-gray-500 border-0 rounded-lg text-sm"
            />

            <Input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
              className="h-12 bg-white text-gray-900 placeholder:text-gray-500 border-0 rounded-lg text-sm"
            />
          </div>

          <div className="relative">
            <select
              value={formData.role}
              onChange={(e) =>
                setFormData({ ...formData, role: e.target.value as UserRole, hasNMLS: 'no', nmlsNumber: '' })
              }
              required
              className="h-12 w-full bg-white text-gray-900 border-0 rounded-lg text-sm px-4 appearance-none cursor-pointer"
            >
              <option value="" disabled>What is Your Role?</option>
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {getRoleDisplayName(role)}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                <path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
          </div>

          {/* Show NMLS question for non-required roles */}
          {showNMLSQuestion && (
            <div className="relative">
              <select
                value={formData.hasNMLS}
                onChange={(e) =>
                  setFormData({ ...formData, hasNMLS: e.target.value, nmlsNumber: e.target.value === 'no' ? '' : formData.nmlsNumber })
                }
                className="h-12 w-full bg-white text-gray-900 border-0 rounded-lg text-sm px-4 appearance-none cursor-pointer"
              >
                <option value="no">Do you have an NMLS Number?</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                  <path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
          )}

          {/* Show NMLS input if required or if user selected yes */}
          {(requiresNMLS || formData.hasNMLS === 'yes') && (
            <Input
              type="text"
              placeholder="Enter NMLS Number"
              value={formData.nmlsNumber}
              onChange={(e) =>
                setFormData({ ...formData, nmlsNumber: e.target.value })
              }
              required={requiresNMLS}
              className="h-12 bg-white text-gray-900 placeholder:text-gray-500 border-0 rounded-lg text-sm"
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              type="tel"
              placeholder="Phone Number"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              className="h-12 bg-white text-gray-900 placeholder:text-gray-500 border-0 rounded-lg text-sm col-span-2"
            />

            <Input
              type="password"
              placeholder="Password"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              required
              minLength={6}
              className="h-12 bg-white text-gray-900 placeholder:text-gray-500 border-0 rounded-lg text-sm"
            />

            <Input
              type="password"
              placeholder="Confirm Password"
              value={formData.confirmPassword}
              onChange={(e) =>
                setFormData({ ...formData, confirmPassword: e.target.value })
              }
              required
              minLength={6}
              className="h-12 bg-white text-gray-900 placeholder:text-gray-500 border-0 rounded-lg text-sm"
            />
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-14 bg-[#dd1969] hover:bg-[#c01559] text-white font-semibold text-base rounded-full shadow-lg mt-2"
          >
            {isLoading ? 'Creating account...' : 'Sign Up'}
          </Button>
        </form>

        {/* Sign In Link */}
        <div className="text-center space-y-2">
          <p className="text-white text-sm">
            Already have an account?
          </p>
          <div className="flex justify-center">
            <Button
              asChild
              className="w-2/3 max-w-xs h-11 bg-white hover:bg-gray-100 text-gray-900 font-semibold text-sm rounded-full shadow-lg"
            >
              <Link href="/sign-in">Log In</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
