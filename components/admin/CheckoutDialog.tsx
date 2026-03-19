'use client'

import { useState } from 'react'
import { SubscriptionPlan } from '@/types/database.types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Copy, Mail, ExternalLink, Check } from 'lucide-react'

interface CheckoutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  plans: SubscriptionPlan[]
  onCheckoutCreated?: () => void
}

export function CheckoutDialog({
  open,
  onOpenChange,
  plans,
  onCheckoutCreated,
}: CheckoutDialogProps) {
  const [step, setStep] = useState<'form' | 'link'>('form')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const [formData, setFormData] = useState({
    userEmail: '',
    firstName: '',
    lastName: '',
    planId: '',
    createAccount: true,
    applyTrial: false,
    notes: '',
    deliveryMethod: 'send_link' as 'send_link' | 'admin_checkout',
  })

  const [checkoutData, setCheckoutData] = useState({
    checkoutUrl: '',
    sessionId: '',
    expiresAt: '',
  })

  const handleCreateCheckout = async () => {
    if (!formData.userEmail || !formData.planId) {
      toast.error('Please fill in all required fields')
      return
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.userEmail)) {
      toast.error('Please enter a valid email address')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/admin/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create checkout')
      }

      const data = await response.json()

      // If admin checkout, open the URL immediately
      if (formData.deliveryMethod === 'admin_checkout') {
        window.open(data.checkoutUrl, '_blank')
        toast.success('Checkout opened in new tab. Complete payment to activate subscription.')
        handleClose()
      } else {
        // Show link for sending to customer
        setCheckoutData({
          checkoutUrl: data.checkoutUrl,
          sessionId: data.sessionId,
          expiresAt: data.expiresAt,
        })
        toast.success('Checkout link created successfully')
        setStep('link')
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to create checkout')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(checkoutData.checkoutUrl)
      setCopied(true)

      // Mark as sent (copied method)
      await fetch(`/api/admin/subscriptions/checkout/${checkoutData.sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'sent',
          sentMethod: 'copied',
        }),
      })

      toast.success('Checkout link copied to clipboard')

      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast.error('Failed to copy link')
    }
  }

  const handleSendEmail = async () => {
    // This would integrate with your email service
    // For now, just mark as sent
    try {
      await fetch(`/api/admin/subscriptions/checkout/${checkoutData.sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'sent',
          sentMethod: 'email',
        }),
      })

      toast.success('Marked as sent via email')
    } catch (error) {
      toast.error('Failed to update status')
    }
  }

  const handleOpenLink = () => {
    window.open(checkoutData.checkoutUrl, '_blank')
  }

  const handleClose = () => {
    setStep('form')
    setFormData({
      userEmail: '',
      firstName: '',
      lastName: '',
      planId: '',
      createAccount: true,
      applyTrial: false,
      notes: '',
      deliveryMethod: 'send_link',
    })
    setCheckoutData({
      checkoutUrl: '',
      sessionId: '',
      expiresAt: '',
    })
    setCopied(false)
    onOpenChange(false)
    if (onCheckoutCreated) {
      onCheckoutCreated()
    }
  }

  const selectedPlan = plans.find((p) => p.id === formData.planId)

  // Only allow 90-day trial for Premium plans (Premium or Premium Processor)
  const canApplyTrial = selectedPlan?.plan_tier === 'Premium' || selectedPlan?.plan_tier === 'Premium Processor'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        {step === 'form' ? (
          <>
            <DialogHeader>
              <DialogTitle>Create Subscription</DialogTitle>
              <DialogDescription>
                Create a subscription for a customer
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="userEmail">Customer Email *</Label>
                <Input
                  id="userEmail"
                  type="email"
                  placeholder="customer@example.com"
                  value={formData.userEmail}
                  onChange={(e) =>
                    setFormData({ ...formData, userEmail: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  If the email doesn't exist in the system, a new account will be
                  created when they complete checkout
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    value={formData.firstName}
                    onChange={(e) =>
                      setFormData({ ...formData, firstName: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Doe"
                    value={formData.lastName}
                    onChange={(e) =>
                      setFormData({ ...formData, lastName: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="planId">Subscription Plan *</Label>
                <Select
                  value={formData.planId}
                  onValueChange={(value) => {
                    // Reset trial checkbox when plan changes
                    const newPlan = plans.find((p) => p.id === value)
                    const isPremium = newPlan?.plan_tier === 'Premium' || newPlan?.plan_tier === 'Premium Processor'
                    setFormData({
                      ...formData,
                      planId: value,
                      applyTrial: isPremium ? formData.applyTrial : false
                    })
                  }}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans
                      .filter((plan) =>
                        plan.is_active &&
                        // Exclude deprecated Premium Guest plans - they exist for legacy users only
                        (plan.plan_tier as string) !== 'Premium Guest' &&
                        (plan.plan_tier as string) !== 'Premium Processor Guest'
                      )
                      .map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name} - ${plan.price}/{plan.billing_period}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {!formData.planId && (
                  <p className="text-xs text-red-600 mt-1">
                    Please select a subscription plan
                  </p>
                )}
              </div>

              {selectedPlan && (
                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">{selectedPlan.name}</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    {selectedPlan.description}
                  </p>
                  <div className="text-2xl font-bold mb-2">
                    ${selectedPlan.price}
                    <span className="text-sm font-normal text-muted-foreground">
                      /{selectedPlan.billing_period}
                    </span>
                  </div>
                  {selectedPlan.features.length > 0 && (
                    <ul className="text-sm space-y-1">
                      {selectedPlan.features.slice(0, 3).map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                      {selectedPlan.features.length > 3 && (
                        <li className="text-muted-foreground">
                          +{selectedPlan.features.length - 3} more features
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )}

              <div>
                <Label>Checkout Method</Label>
                <div className="flex flex-col gap-3 mt-2">
                  <div className="flex items-start space-x-3">
                    <input
                      type="radio"
                      id="send_link"
                      name="deliveryMethod"
                      checked={formData.deliveryMethod === 'send_link'}
                      onChange={() =>
                        setFormData({ ...formData, deliveryMethod: 'send_link' })
                      }
                      className="mt-0.5"
                    />
                    <div>
                      <Label htmlFor="send_link" className="cursor-pointer font-semibold">
                        Send checkout link to customer
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Generate a link to send to the customer via email or copy
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <input
                      type="radio"
                      id="admin_checkout"
                      name="deliveryMethod"
                      checked={formData.deliveryMethod === 'admin_checkout'}
                      onChange={() =>
                        setFormData({ ...formData, deliveryMethod: 'admin_checkout' })
                      }
                      className="mt-0.5"
                    />
                    <div>
                      <Label htmlFor="admin_checkout" className="cursor-pointer font-semibold">
                        Complete checkout as admin
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Opens checkout in new tab for you to complete payment on behalf of customer
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {canApplyTrial && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="applyTrial"
                    checked={formData.applyTrial}
                    onChange={(e) =>
                      setFormData({ ...formData, applyTrial: e.target.checked })
                    }
                    className="rounded"
                  />
                  <Label htmlFor="applyTrial" className="cursor-pointer">
                    Apply 90-day trial period
                  </Label>
                </div>
              )}

              <div>
                <Label htmlFor="notes">Internal Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Add notes for tracking purposes..."
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  These notes are only visible to admins
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateCheckout}
                disabled={loading || !formData.planId || !formData.userEmail}
              >
                {loading
                  ? 'Creating...'
                  : formData.deliveryMethod === 'admin_checkout'
                  ? 'Open Checkout'
                  : 'Create Checkout Link'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Checkout Link Created</DialogTitle>
              <DialogDescription>
                Share this link with your customer. It expires in 24 hours.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Checkout URL</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={checkoutData.checkoutUrl}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyLink}
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  <strong>Expires:</strong>{' '}
                  {new Date(checkoutData.expiresAt).toLocaleString()}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleCopyLink}
                  variant="outline"
                  className="w-full"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Link
                </Button>
                <Button
                  onClick={handleOpenLink}
                  variant="outline"
                  className="w-full"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Link in New Tab
                </Button>
                <Button
                  onClick={handleSendEmail}
                  variant="outline"
                  className="w-full"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Mark as Sent via Email
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
