'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SelectPlanModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onContinue: (frequency: 'monthly' | 'annual') => void
  planName: string
  monthlyPrice: number
  annualPrice: number
}

export function SelectPlanModal({
  open,
  onOpenChange,
  onContinue,
  planName,
  monthlyPrice,
  annualPrice
}: SelectPlanModalProps) {
  const [frequency, setFrequency] = useState<'monthly' | 'annual'>('monthly')

  const currentPrice = frequency === 'monthly' ? monthlyPrice : annualPrice
  const displayPrice = frequency === 'monthly'
    ? `$${monthlyPrice.toFixed(2)}/mo`
    : `$${annualPrice.toFixed(2)}/yr`

  const handleContinue = () => {
    onContinue(frequency)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select Plan Frequency</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="select-plan">Select plan</Label>
              <Select disabled value={planName}>
                <SelectTrigger>
                  <SelectValue>{planName}</SelectValue>
                </SelectTrigger>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan-frequency">Plan frequency</Label>
              <Select value={frequency} onValueChange={(value) => setFrequency(value as 'monthly' | 'annual')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <div className="flex items-center h-10 px-3 rounded-md border border-gray-300 bg-gray-50">
                <span className="text-sm font-medium">{displayPrice}</span>
              </div>
            </div>
          </div>

          {frequency === 'annual' && annualPrice < monthlyPrice * 12 && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <p className="text-sm text-green-800">
                You'll save ${((monthlyPrice * 12) - annualPrice).toFixed(2)} per year with annual billing!
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={handleContinue}
            className="w-full bg-[#dd1969] hover:bg-[#c01558]"
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
