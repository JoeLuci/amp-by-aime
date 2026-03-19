import { createClient } from '@/lib/supabase/server'
import { ResourcesManager } from '@/components/admin/ResourcesManager'

export default async function AdminResourcesPage() {
  const supabase = await createClient()

  // Fetch all data in parallel for better performance
  const [
    { data: resources, error: resourcesError },
    { data: categories, error: categoriesError },
    { data: contentTypes, error: typesError },
    { data: tags, error: tagsError }
  ] = await Promise.all([
    supabase
      .from('resources')
      .select(`
        *,
        creator:created_by (
          full_name
        )
      `)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false }),
    supabase
      .from('categories')
      .select('*')
      .eq('content_area', 'resources')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('content_types')
      .select('*')
      .eq('content_area', 'resources')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('tags')
      .select('*')
      .order('name', { ascending: true })
  ])

  // Transform to include creator_name
  const transformedResources = resources?.map(r => ({
    ...r,
    creator_name: r.creator?.full_name || 'Unknown'
  })) || []

  if (resourcesError) console.error('Error fetching resources:', resourcesError)
  if (categoriesError) console.error('Error fetching categories:', categoriesError)
  if (typesError) console.error('Error fetching content types:', typesError)
  if (tagsError) console.error('Error fetching tags:', tagsError)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[#dd1969] mb-2">RESOURCES</h1>
        <p className="text-gray-600">Discover, Learn, and Grow with AIME Resources</p>
      </div>

      <ResourcesManager
        resources={transformedResources}
        categories={categories || []}
        contentTypes={contentTypes || []}
        tags={tags || []}
      />
    </div>
  )
}
