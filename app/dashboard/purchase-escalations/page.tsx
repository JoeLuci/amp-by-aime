'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Check } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

const escalationPackages = [
  { id: 1, quantity: 5, price: 49.99, savings: 0 },
  { id: 2, quantity: 10, price: 89.99, savings: 10 },
  { id: 3, quantity: 25, price: 199.99, savings: 20 },
  { id: 4, quantity: 50, price: 349.99, savings: 30 },
]

export default function PurchaseEscalationsPage() {
  const [selectedPackage, setSelectedPackage] = useState(escalationPackages[0])
  const [customQuantity, setCustomQuantity] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const handlePurchase = async () => {
    setIsProcessing(true)

    // Simulate payment processing
    setTimeout(() => {
      toast.success(`Successfully purchased ${selectedPackage.quantity} escalations!`)
      setIsProcessing(false)
    }, 1500)
  }

  return (
    <div className="min-h-screen">
      {/* Back Button */}
      <div className="px-4 md:px-8 py-4 bg-white border-b">
        <Link
          href="/dashboard/settings?tab=billing"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back to billing</span>
        </Link>
      </div>

      {/* Page Header */}
      <div className="px-4 md:px-8 py-6 md:py-8">
        <h1 className="text-3xl md:text-4xl font-bold text-[#dd1969] mb-2">
          Purchase Escalations
        </h1>
        <p className="text-gray-600 text-sm md:text-base">
          Choose a package to refill your escalation quota
        </p>
      </div>

      {/* Content */}
      <div className="px-4 md:px-8 pb-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Package Selection */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">Select a Package</h2>
              <div className="space-y-3">
                {escalationPackages.map((pkg) => (
                  <button
                    key={pkg.id}
                    onClick={() => setSelectedPackage(pkg)}
                    className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                      selectedPackage.id === pkg.id
                        ? 'border-[#dd1969] bg-pink-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            selectedPackage.id === pkg.id
                              ? 'border-[#dd1969] bg-[#dd1969]'
                              : 'border-gray-300'
                          }`}>
                            {selectedPackage.id === pkg.id && (
                              <Check className="w-3 h-3 text-white" />
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">
                              {pkg.quantity} Escalations
                            </p>
                            <p className="text-sm text-gray-600">
                              ${(pkg.price / pkg.quantity).toFixed(2)} per escalation
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-gray-900">
                          ${pkg.price.toFixed(2)}
                        </p>
                        {pkg.savings > 0 && (
                          <span className="inline-block bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded mt-1">
                            Save {pkg.savings}%
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Custom Quantity */}
              <div className="mt-6 p-4 border-2 border-gray-200 rounded-lg">
                <Label htmlFor="customQuantity" className="text-sm font-semibold text-gray-900 mb-2">
                  Or enter a custom quantity
                </Label>
                <div className="flex gap-3 mt-2">
                  <Input
                    id="customQuantity"
                    type="number"
                    min="1"
                    placeholder="Enter quantity"
                    value={customQuantity}
                    onChange={(e) => setCustomQuantity(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    className="border-[#dd1969] text-[#dd1969] hover:bg-[#dd1969] hover:text-white"
                  >
                    Calculate
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Base price: $10 per escalation
                </p>
              </div>
            </div>

            {/* Order Summary */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">Order Summary</h2>
              <div className="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Package</span>
                    <span className="font-semibold text-gray-900">
                      {selectedPackage.quantity} Escalations
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Price per escalation</span>
                    <span className="font-semibold text-gray-900">
                      ${(selectedPackage.price / selectedPackage.quantity).toFixed(2)}
                    </span>
                  </div>
                  {selectedPackage.savings > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Savings</span>
                      <span className="font-semibold">
                        {selectedPackage.savings}%
                      </span>
                    </div>
                  )}
                  <div className="border-t pt-4">
                    <div className="flex justify-between text-lg">
                      <span className="font-bold text-gray-900">Total</span>
                      <span className="font-bold text-[#dd1969]">
                        ${selectedPackage.price.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handlePurchase}
                  disabled={isProcessing}
                  className="w-full bg-[#dd1969] hover:bg-[#c01559] text-white font-semibold h-12"
                >
                  {isProcessing ? 'Processing...' : 'Purchase Now'}
                </Button>

                <p className="text-xs text-gray-500 text-center mt-4">
                  Your escalations will be added immediately after purchase
                </p>
              </div>

              {/* Info Box */}
              <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">About Escalations</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Escalations allow you to get priority support for urgent loan issues</li>
                  <li>• Each tier includes a set amount that renews annually</li>
                  <li>• Purchase additional escalations anytime to refill your quota</li>
                  <li>• Unused escalations do not roll over to the next year</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
