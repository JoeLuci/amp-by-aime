import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Lock } from 'lucide-react'

interface UpgradeRequiredProps {
  resourceTitle: string
  requiredTiers: string[]
  backUrl?: string
}

export default function UpgradeRequired({ resourceTitle, requiredTiers, backUrl = '/dashboard/resources' }: UpgradeRequiredProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-8 md:p-12 text-center">
        {/* Lock Icon */}
        <div className="flex justify-center mb-6">
          <div className="bg-[#dd1969]/10 rounded-full p-6">
            <Lock className="w-12 h-12 text-[#dd1969]" />
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-3xl md:text-4xl font-bold text-[#dd1969] mb-4">
          Upgrade to Access This Resource
        </h1>

        {/* Resource Title */}
        <p className="text-lg text-gray-700 mb-2">
          You're trying to access:
        </p>
        <p className="text-xl font-semibold text-gray-900 mb-6">
          "{resourceTitle}"
        </p>

        {/* Description */}
        <div className="bg-gray-50 rounded-lg p-6 mb-8">
          <p className="text-gray-700 mb-4">
            This resource is available to{' '}
            <span className="font-semibold text-[#dd1969]">
              {requiredTiers.join(', ')}
            </span>{' '}
            members.
          </p>
          <p className="text-gray-600">
            Upgrade your membership to unlock access to exclusive resources, training materials, podcasts, and more!
          </p>
        </div>

        {/* Benefits List */}
        <div className="text-left mb-8 max-w-md mx-auto">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Premium Benefits Include:</h3>
          <ul className="space-y-3 text-gray-700">
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#dd1969] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Access to exclusive resources and training materials</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#dd1969] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Premium podcasts and video content</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#dd1969] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Priority support and networking opportunities</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#dd1969] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Early access to new features and content</span>
            </li>
          </ul>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/dashboard/select-plan">
            <Button className="bg-[#dd1969] hover:bg-[#c01559] text-white font-bold text-lg px-8 py-6 rounded-full">
              See Pricing & Upgrade
            </Button>
          </Link>
          <Link href={backUrl}>
            <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold text-lg px-8 py-6 rounded-full">
              Back to Resources
            </Button>
          </Link>
        </div>

        {/* Additional Info */}
        <p className="text-sm text-gray-500 mt-8">
          Questions about membership? <Link href="/dashboard/support" className="text-[#dd1969] hover:underline">Contact Support</Link>
        </p>
      </div>
    </div>
  )
}
