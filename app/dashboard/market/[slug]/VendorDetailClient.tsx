'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { VendorConnectionModal } from '@/components/modals/VendorConnectionModal'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface VendorDetailClientProps {
  vendorId: string
  vendorName: string
  affiliateUrl?: string
  userRole?: string
  showConnectButton?: boolean
}

export function VendorDetailClient({ vendorId, vendorName, affiliateUrl, userRole, showConnectButton = true }: VendorDetailClientProps) {
  const searchParams = useSearchParams()
  const [connectionOpen, setConnectionOpen] = useState(false)

  // Check if user is a partner (vendor or lender) - they get view-only access
  const isPartner = userRole === 'partner_vendor' || userRole === 'partner_lender'

  // Check for modal query param and auto-open the corresponding modal (not for partners)
  useEffect(() => {
    if (isPartner) return
    const modal = searchParams.get('modal')
    if (modal === 'connect') {
      setConnectionOpen(true)
    }
  }, [searchParams, isPartner])

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {showConnectButton && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    onClick={() => !isPartner && setConnectionOpen(true)}
                    disabled={isPartner}
                    className={`font-semibold rounded-full ${
                      isPartner
                        ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                        : 'bg-[#dd1969] hover:bg-[#c01559] text-white'
                    }`}
                  >
                    Connect
                  </Button>
                </span>
              </TooltipTrigger>
              {isPartner && (
                <TooltipContent>
                  <p>View only - Partner accounts cannot submit requests</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )}
        {affiliateUrl && (
          <Button
            asChild
            className="bg-[#25314e] hover:bg-[#1a233a] text-white font-semibold rounded-full"
          >
            <a href={affiliateUrl} target="_blank" rel="noopener noreferrer">
              Sign Up
            </a>
          </Button>
        )}
      </div>

      {/* Modals - only render if not a partner */}
      {!isPartner && (
        <VendorConnectionModal
          open={connectionOpen}
          onOpenChange={setConnectionOpen}
          preselectedVendorId={vendorId}
          preselectedVendorName={vendorName}
        />
      )}
    </>
  )
}
