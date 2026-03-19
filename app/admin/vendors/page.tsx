import { createClient } from '@/lib/supabase/server'
import { VendorsTable } from '@/components/admin/VendorsTable'

export default async function VendorsPage() {
  const supabase = await createClient()

  // Fetch all data in parallel for better performance
  const [
    { data: vendors, error },
    { data: categories, error: categoriesError },
    { data: contentTypes, error: typesError },
    { data: tags, error: tagsError }
  ] = await Promise.all([
    supabase
      .from('vendors')
      .select(`
        *,
        category:category_id (
          id,
          name,
          slug,
          color
        )
      `)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('categories')
      .select('*')
      .eq('content_area', 'market')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('content_types')
      .select('*')
      .eq('content_area', 'market')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('tags')
      .select('*')
      .order('name', { ascending: true })
  ])

  if (error) console.error('Error fetching vendors:', error)
  if (categoriesError) console.error('Error fetching categories:', categoriesError)
  if (typesError) console.error('Error fetching content types:', typesError)
  if (tagsError) console.error('Error fetching tags:', tagsError)

  // Transform vendors for the table
  const transformedVendors = vendors?.map(v => ({
    ...v,
    creator_name: 'System'
  })) || []

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Vendors</h1>
        <p className="text-gray-600">Manage vendor partners and marketplace listings</p>
      </div>

      <VendorsTable
        vendors={transformedVendors}
        categories={categories || []}
        contentTypes={contentTypes || []}
        tags={tags || []}
      />
    </div>
  )
}
