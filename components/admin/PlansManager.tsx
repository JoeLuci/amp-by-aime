'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SubscriptionPlan } from '@/types/database.types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Star } from 'lucide-react'
import { toast } from 'sonner'

interface PlansManagerProps {
  initialPlans: SubscriptionPlan[]
  isSuperAdmin: boolean
}

export function PlansManager({ initialPlans, isSuperAdmin }: PlansManagerProps) {
  const router = useRouter()
  const [plans, setPlans] = useState(initialPlans)
  const [syncing, setSyncing] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    try {
      const response = await fetch('/api/admin/subscriptions/plans', {
        method: 'PATCH',
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('Sync error:', error)
        throw new Error(error.error || 'Failed to sync plans')
      }

      const result = await response.json()
      console.log('Sync result:', result)

      if (result.errors && result.errors.length > 0) {
        console.error('Sync errors:', result.errors)
        toast.error(`Synced ${result.synced} plans, but ${result.errors.length} failed. Check console for details.`)
      } else {
        toast.success(`Successfully synced ${result.synced} plans from Stripe`)
      }

      router.refresh()
    } catch (error: any) {
      console.error('Sync failed:', error)
      toast.error(error.message || 'Failed to sync plans')
    } finally {
      setSyncing(false)
    }
  }

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(price)
  }

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Subscription Plans</h2>
          <p className="text-sm text-muted-foreground">
            {isSuperAdmin
              ? 'View subscription plans synced from Stripe. To modify plans, update them in Stripe and sync.'
              : 'View subscription plans. Only Super Admins can sync plans from Stripe.'}
          </p>
        </div>
        {isSuperAdmin && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync with Stripe'}
            </Button>
          </div>
        )}
      </div>

      {/* Plans Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Billing</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stripe Price ID</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No plans found. Click "Sync with Stripe" to import plans.
                </TableCell>
              </TableRow>
            ) : (
              plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {plan.name}
                      {plan.is_featured && (
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{plan.plan_tier}</Badge>
                  </TableCell>
                  <TableCell className="capitalize">{plan.billing_period}</TableCell>
                  <TableCell>{formatPrice(plan.price, plan.currency)}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {plan.stripe_price_id || 'N/A'}
                    </code>
                  </TableCell>
                  <TableCell>
                    {plan.is_active ? (
                      <Badge>Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
