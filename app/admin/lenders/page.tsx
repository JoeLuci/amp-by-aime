import { createClient } from '@/lib/supabase/server'
import { LendersTable } from '@/components/admin/LendersTable'

export default async function LendersPage() {
  const supabase = await createClient()

  // Fetch all data in parallel for better performance
  const [
    { data: categories, error: categoriesError },
    { data: tags, error: tagsError },
    { data: lenders, error }
  ] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('content_area', 'lenders')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('tags')
      .select('*')
      .order('name', { ascending: true }),
    supabase
      .from('lenders')
      .select(`
        *,
        creator:created_by (
          full_name
        ),
        category:category_id (
          id,
          name,
          slug,
          color
        ),
        type:type_id (
          id,
          name,
          slug,
          color
        )
      `)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })
  ])

  // Transform to include creator_name
  const transformedLenders = lenders?.map(l => ({
    ...l,
    creator_name: l.creator?.full_name || 'Unknown'
  })) || []

  if (error) console.error('Error fetching lenders:', error)
  if (categoriesError) console.error('Error fetching categories:', categoriesError)
  if (tagsError) console.error('Error fetching tags:', tagsError)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Lenders</h1>
        <p className="text-gray-600">Manage lending partners and their information</p>
      </div>

      <LendersTable
        lenders={transformedLenders}
        categories={categories || []}
        tags={tags || []}
      />
    </div>
  )
}
