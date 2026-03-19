import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface UpgradeBannerProps {
  title?: string
  description?: string
  requiredTiers?: string[]
}

export function UpgradeBanner({
  title = "Upgrade To Paid Membership for Access to AIME's AI Assistant",
  description = "For as low as $19.99/mo you gain access to The Architect, an AI Bot for Lender Scenarios",
  requiredTiers = []
}: UpgradeBannerProps) {
  return (
    <div className="bg-gradient-to-r from-gray-100 to-gray-200 rounded-lg shadow-lg p-8 text-center max-w-4xl mx-auto my-8">
      <h2 className="text-2xl md:text-3xl font-bold text-[#0ea5e9] mb-4">
        {title}
      </h2>
      <p className="text-gray-700 text-lg mb-6">
        {description}
      </p>
      {requiredTiers.length > 0 && (
        <p className="text-sm text-gray-600 mb-6">
          Required plan: <span className="font-semibold">{requiredTiers.join(', ')}</span>
        </p>
      )}
      <Link href="/dashboard/select-plan">
        <Button className="bg-[#dd1969] hover:bg-[#c01559] text-white font-semibold px-8 py-6 text-lg rounded-full">
          See Pricing
        </Button>
      </Link>
    </div>
  )
}
