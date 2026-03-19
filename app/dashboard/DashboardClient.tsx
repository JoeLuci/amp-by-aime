'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ChangeAEModal } from '@/components/modals/ChangeAEModal'
import { LenderConnectionModal } from '@/components/modals/LenderConnectionModal'
import { EscalateLoanModal } from '@/components/modals/EscalateLoanModal'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface DashboardClientProps {
  planTier?: string
  userRole?: string
  escalationsRemaining?: number
}

export function DashboardClient({ planTier, userRole, escalationsRemaining }: DashboardClientProps) {
  const [changeAEOpen, setChangeAEOpen] = useState(false)
  const [lenderConnectionOpen, setLenderConnectionOpen] = useState(false)
  const [escalateLoanOpen, setEscalateLoanOpen] = useState(false)

  // Check if user is a partner (vendor or lender) - they get view-only access
  const isPartner = userRole === 'partner_vendor' || userRole === 'partner_lender'

  // Premium Guest users cannot escalate loans, partners can't escalate either, need remaining escalations
  const hasEscalationsLeft = (escalationsRemaining ?? 0) > 0
  const canEscalate = planTier !== 'Premium Guest' && !isPartner && hasEscalationsLeft

  // For partners, show only 2 columns for the 2 view-only buttons
  const gridCols = isPartner ? 'md:grid-cols-2' : (canEscalate ? 'md:grid-cols-3' : 'md:grid-cols-2')

  return (
    <>
      {/* Quick Links */}
      <div className="px-4 md:px-8 py-6">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">Quick Links</h2>
        <div className={`grid grid-cols-1 ${gridCols} gap-3 md:gap-4`}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="w-full">
                  <Button
                    onClick={() => !isPartner && setChangeAEOpen(true)}
                    disabled={isPartner}
                    className={`w-full h-12 md:h-14 font-semibold text-sm md:text-base rounded-full shadow-lg ${
                      isPartner
                        ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                        : 'bg-[#25314e] hover:bg-[#1a233a] text-white'
                    }`}
                  >
                    Change AE
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="w-full">
                  <Button
                    onClick={() => !isPartner && setLenderConnectionOpen(true)}
                    disabled={isPartner}
                    className={`w-full h-12 md:h-14 font-semibold text-sm md:text-base rounded-full shadow-lg ${
                      isPartner
                        ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                        : 'bg-[#25314e] hover:bg-[#1a233a] text-white'
                    }`}
                  >
                    Lender Connection
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
          {canEscalate && (
            <Button
              onClick={() => setEscalateLoanOpen(true)}
              className="h-12 md:h-14 bg-[#25314e] hover:bg-[#1a233a] text-white font-semibold text-sm md:text-base rounded-full shadow-lg"
            >
              Escalate a Loan
            </Button>
          )}
        </div>
      </div>

      {/* Modals - only render if not a partner */}
      {!isPartner && (
        <>
          <ChangeAEModal open={changeAEOpen} onOpenChange={setChangeAEOpen} />
          <LenderConnectionModal open={lenderConnectionOpen} onOpenChange={setLenderConnectionOpen} />
          <EscalateLoanModal open={escalateLoanOpen} onOpenChange={setEscalateLoanOpen} />
        </>
      )}
    </>
  )
}
