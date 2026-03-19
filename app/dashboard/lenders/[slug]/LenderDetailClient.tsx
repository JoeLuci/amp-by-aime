'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LenderConnectionModal } from '@/components/modals/LenderConnectionModal'
import { EscalateLoanModal } from '@/components/modals/EscalateLoanModal'
import { ChangeAEModal } from '@/components/modals/ChangeAEModal'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface LenderDetailClientProps {
  lenderId: string
  planTier?: string
  userRole?: string
  escalationsRemaining?: number
}

export function LenderDetailClient({ lenderId, planTier, userRole, escalationsRemaining }: LenderDetailClientProps) {
  const searchParams = useSearchParams()
  const [lenderConnectionOpen, setLenderConnectionOpen] = useState(false)
  const [escalateLoanOpen, setEscalateLoanOpen] = useState(false)
  const [changeAEOpen, setChangeAEOpen] = useState(false)

  // Check if user is a partner (vendor or lender) - they get view-only access
  const isPartner = userRole === 'partner_vendor' || userRole === 'partner_lender'

  // Premium Guest users cannot escalate loans, also need remaining escalations
  const hasEscalationsLeft = (escalationsRemaining ?? 0) > 0
  const canEscalate = planTier !== 'Premium Guest' && hasEscalationsLeft
  // Partners can see the button but can't use it
  const isEscalateDisabled = !canEscalate || isPartner

  // Check for modal query param and auto-open the corresponding modal (not for partners)
  useEffect(() => {
    if (isPartner) return
    const modal = searchParams.get('modal')
    if (modal === 'connect') {
      setLenderConnectionOpen(true)
    } else if (modal === 'escalate' && canEscalate) {
      setEscalateLoanOpen(true)
    } else if (modal === 'change-ae') {
      setChangeAEOpen(true)
    }
  }, [searchParams, canEscalate, isPartner])

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  onClick={() => !isEscalateDisabled && setEscalateLoanOpen(true)}
                  disabled={isEscalateDisabled}
                  className={`font-semibold rounded-full ${
                    isEscalateDisabled
                      ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                      : 'bg-[#dd1969] hover:bg-[#c01559] text-white'
                  }`}
                >
                  Escalate a Loan
                </Button>
              </span>
            </TooltipTrigger>
            {isEscalateDisabled && (
              <TooltipContent>
                <p>{isPartner ? 'View only - Partner accounts cannot submit requests' : !hasEscalationsLeft ? 'No escalations remaining' : 'Premium Guest accounts cannot escalate loans'}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  onClick={() => !isPartner && setLenderConnectionOpen(true)}
                  disabled={isPartner}
                  className={`font-semibold rounded-full ${
                    isPartner
                      ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                      : 'bg-[#25314e] hover:bg-[#1a233a] text-white'
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
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  onClick={() => !isPartner && setChangeAEOpen(true)}
                  disabled={isPartner}
                  className={`font-semibold rounded-full ${
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
      </div>

      {/* Modals - only render if not a partner */}
      {!isPartner && (
        <>
          <LenderConnectionModal
            open={lenderConnectionOpen}
            onOpenChange={setLenderConnectionOpen}
            preselectedLenderId={lenderId}
          />
          <EscalateLoanModal
            open={escalateLoanOpen}
            onOpenChange={setEscalateLoanOpen}
            preselectedLenderId={lenderId}
          />
          <ChangeAEModal
            open={changeAEOpen}
            onOpenChange={setChangeAEOpen}
            preselectedLenderId={lenderId}
          />
        </>
      )}
    </>
  )
}
