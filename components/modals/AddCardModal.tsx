'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface AddCardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

function AddCardForm({ onOpenChange, onSuccess }: { onOpenChange: (open: boolean) => void, onSuccess?: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Prevent multiple submissions
    if (loading || !stripe || !elements) {
      return
    }

    setLoading(true)

    try {
      // Confirm the Setup Intent
      const { error: submitError } = await elements.submit()
      if (submitError) {
        throw new Error(submitError.message)
      }

      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required'
      })

      if (error) {
        throw new Error(error.message)
      }

      if (setupIntent && setupIntent.status === 'succeeded') {
        // Attach payment method as default
        const response = await fetch('/api/stripe/attach-payment-method', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            paymentMethodId: setupIntent.payment_method
          })
        })

        if (!response.ok) {
          throw new Error('Failed to attach payment method')
        }

        toast.success('Card added successfully!')
        onOpenChange(false)
        if (onSuccess) {
          onSuccess()
        }
      }
    } catch (error) {
      console.error('Error adding card:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to add card')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <PaymentElement />
      </div>

      <DialogFooter>
        <Button
          type="submit"
          disabled={loading || !stripe || !elements}
          className="w-full bg-[#dd1969] hover:bg-[#c01558]"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            'Add Card'
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function AddCardModal({ open, onOpenChange, onSuccess }: AddCardModalProps) {
  const [clientSecret, setClientSecret] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && !clientSecret) {
      fetchSetupIntent()
    }
  }, [open])

  const fetchSetupIntent = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/stripe/setup-intent', {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error('Failed to create setup intent')
      }

      const data = await response.json()
      setClientSecret(data.clientSecret)
    } catch (error) {
      console.error('Error fetching setup intent:', error)
      toast.error('Failed to initialize payment form')
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
    // Reset client secret when modal closes
    if (!newOpen) {
      setTimeout(() => {
        setClientSecret('')
      }, 300)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Payment Method</DialogTitle>
        </DialogHeader>

        {loading || !clientSecret ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-[#dd1969]" />
          </div>
        ) : (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: 'stripe',
                variables: {
                  colorPrimary: '#dd1969',
                }
              }
            }}
          >
            <AddCardForm onOpenChange={handleOpenChange} onSuccess={onSuccess} />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  )
}
