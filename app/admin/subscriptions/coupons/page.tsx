import { createClient } from '@/lib/supabase/server'
import { CouponsManager } from '@/components/admin/CouponsManager'

export default async function CouponsPage() {
  const supabase = await createClient()

  // Fetch all coupons
  const { data: coupons, error } = await supabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching coupons:', error)
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Coupons</h1>
        <p className="text-gray-600">Manage discount codes and promotional offers</p>
      </div>

      <CouponsManager coupons={coupons || []} />
    </div>
  )
}
