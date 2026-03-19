import { createClient } from '@/lib/supabase/server'
import { FeaturedManager } from '@/components/admin/FeaturedManager'

export default async function FeaturedPage() {
  const supabase = await createClient()

  // Fetch featured items from all tables
  const [
    { data: featuredResources },
    { data: featuredEvents },
    { data: featuredLenders },
    { data: featuredVendors },
  ] = await Promise.all([
    supabase.from('resources').select('*').eq('is_featured', true).order('created_at', { ascending: false }),
    supabase.from('events').select('*').eq('is_featured', true).order('start_date', { ascending: false }),
    supabase.from('lenders').select('*').eq('is_featured', true).order('display_order', { ascending: true }),
    supabase.from('vendors').select('*').eq('is_featured', true).eq('is_active', true).order('display_order', { ascending: true }),
  ])

  // Fetch all items for selection
  const [
    { data: allResources },
    { data: allEvents },
    { data: allLenders },
    { data: allVendors },
  ] = await Promise.all([
    supabase.from('resources').select('id, title, resource_type, is_featured').order('title', { ascending: true }),
    supabase.from('events').select('id, title, event_type, is_featured, start_date').order('start_date', { ascending: false }),
    supabase.from('lenders').select('id, name, lender_type, is_featured').order('name', { ascending: true }),
    supabase.from('vendors').select('id, name, vendor_category, is_core_partner, is_affiliate').order('name', { ascending: true }),
  ])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Featured Items</h1>
        <p className="text-gray-600">Manage featured resources, events, lenders, and vendors</p>
      </div>

      <FeaturedManager
        featuredResources={featuredResources || []}
        featuredEvents={featuredEvents || []}
        featuredLenders={featuredLenders || []}
        featuredVendors={featuredVendors || []}
        allResources={allResources || []}
        allEvents={allEvents || []}
        allLenders={allLenders || []}
        allVendors={allVendors || []}
      />
    </div>
  )
}
