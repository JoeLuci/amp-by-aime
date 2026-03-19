import { createClient } from '@/lib/supabase/server'
import { VendorLenderTable } from '@/components/admin/VendorLenderTable'

export default async function VendorLenderPage() {
  const supabase = await createClient()

  // Fetch all vendor and lender users
  const { data: vendorLenders, error } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['partner_lender', 'partner_vendor'])
    .order('created_at', { ascending: false })
    .range(0, 9999)

  if (error) {
    console.error('Error fetching vendor/lenders:', JSON.stringify(error, null, 2))
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Vendors & Lenders</h1>
        <p className="text-gray-600">Manage platform vendors and lenders</p>
      </div>

      <VendorLenderTable vendorLenders={vendorLenders || []} />
    </div>
  )
}
