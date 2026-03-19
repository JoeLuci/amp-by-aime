'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface CancelPlanModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  planName: string
  cancelDate: string
  onSuccess?: () => void
}

export function CancelPlanModal({ open, onOpenChange, planName, cancelDate, onSuccess }: CancelPlanModalProps) {
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [actualCancelDate, setActualCancelDate] = useState(cancelDate)

  const handleCancel = async () => {
    setIsProcessing(true)

    try {
      const response = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel subscription')
      }

      // Update the cancel date with the actual date from the API
      if (data.effectiveDate) {
        setActualCancelDate(new Date(data.effectiveDate).toLocaleDateString())
      }

      setIsConfirmed(true)
      toast.success('Subscription cancellation scheduled')
      // Note: onSuccess is called when user clicks Close on the confirmation screen
    } catch (error) {
      console.error('Cancel error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to cancel subscription')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClose = () => {
    // If cancellation was successful, call onSuccess when user closes the confirmation
    if (isConfirmed) {
      onSuccess?.()
    }
    onOpenChange(false)
    // Reset state after modal closes
    setTimeout(() => {
      setIsConfirmed(false)
    }, 300)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        {!isConfirmed ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <DialogTitle className="text-2xl font-bold text-gray-900">
                  Cancel Plan
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              <p className="text-gray-700">
                Are you sure you want to cancel your <span className="font-semibold text-[#dd1969]">{planName}</span> plan?
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-900">
                  <strong>Important:</strong> Your plan will remain active until{' '}
                  <span className="font-semibold">{cancelDate}</span>. After this date, your subscription will end.
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-semibold text-gray-900 mb-2">You will lose access to:</p>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• Premium features and benefits</li>
                  <li>• Remaining escalations quota</li>
                  <li>• Priority support</li>
                  <li>• Exclusive vendor deals</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleClose}
                  variant="outline"
                  className="flex-1"
                  disabled={isProcessing}
                >
                  Keep My Plan
                </Button>
                <Button
                  onClick={handleCancel}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  disabled={isProcessing}
                >
                  {isProcessing ? 'Canceling...' : 'Yes, Cancel Plan'}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <DialogTitle className="text-2xl font-bold text-gray-900">
                  Plan Cancellation Scheduled
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              <p className="text-gray-700">
                Your <span className="font-semibold text-[#dd1969]">{planName}</span> plan has been scheduled for cancellation.
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  <strong>Cancellation Date:</strong>{' '}
                  <span className="font-semibold">{actualCancelDate}</span>
                </p>
                <p className="text-sm text-blue-900 mt-2">
                  You will continue to have full access to all {planName} features until this date. After {actualCancelDate}, your subscription will end.
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  Changed your mind? You can reactivate your subscription anytime before {actualCancelDate} by visiting the Billing settings.
                </p>
              </div>

              <Button
                onClick={handleClose}
                className="w-full bg-[#dd1969] hover:bg-[#c01559] text-white"
              >
                Close
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
