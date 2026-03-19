'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'

interface PurchaseEscalationsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const ESCALATION_PRICE = 199

export function PurchaseEscalationsModal({ open, onOpenChange, onSuccess }: PurchaseEscalationsModalProps) {
  const [quantity, setQuantity] = useState(1)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleIncrement = () => {
    setQuantity(prev => prev + 1)
  }

  const handleDecrement = () => {
    if (quantity > 1) {
      setQuantity(prev => prev - 1)
    }
  }

  const handleQuantityChange = (value: string) => {
    const num = parseInt(value)
    if (!isNaN(num) && num > 0) {
      setQuantity(num)
    } else if (value === '') {
      setQuantity(1)
    }
  }

  const totalPrice = quantity * ESCALATION_PRICE

  const handlePurchase = async () => {
    // Prevent multiple clicks
    if (isProcessing) return

    setIsProcessing(true)

    try {
      const response = await fetch('/api/stripe/purchase-escalations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ quantity })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to purchase escalations')
      }

      toast.success(`Successfully purchased ${quantity} escalation${quantity > 1 ? 's' : ''}!`)
      onOpenChange(false)
      setQuantity(1) // Reset quantity

      // Trigger a refresh if callback provided
      if (onSuccess) {
        onSuccess()
      }
    } catch (error) {
      console.error('Error purchasing escalations:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to purchase escalations')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-[#dd1969]">
            Purchase Escalations
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Quantity Selector */}
          <div>
            <Label htmlFor="quantity" className="text-sm font-semibold text-gray-900 mb-2">
              Quantity
            </Label>
            <div className="flex items-center gap-3 mt-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleDecrement}
                disabled={quantity <= 1}
                className="h-12 w-12 rounded-full border-2"
              >
                <Minus className="h-4 w-4" />
              </Button>

              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                className="text-center text-xl font-bold h-12 flex-1"
              />

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleIncrement}
                className="h-12 w-12 rounded-full border-2"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-gray-500 mt-2 text-center">
              ${ESCALATION_PRICE} per escalation
            </p>
          </div>

          {/* Price Summary */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                {quantity} Escalation{quantity > 1 ? 's' : ''}
              </span>
              <span className="font-semibold text-gray-900">
                ${ESCALATION_PRICE} × {quantity}
              </span>
            </div>
            <div className="border-t pt-2 flex justify-between">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-bold text-[#dd1969] text-xl">
                ${totalPrice.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Purchase Button */}
          <Button
            onClick={handlePurchase}
            disabled={isProcessing || quantity < 1}
            className="w-full bg-[#dd1969] hover:bg-[#c01559] text-white font-semibold h-12"
          >
            {isProcessing ? 'Processing...' : `Purchase ${quantity} Escalation${quantity > 1 ? 's' : ''}`}
          </Button>

          <p className="text-xs text-gray-500 text-center">
            Your escalations will be added immediately after purchase
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
