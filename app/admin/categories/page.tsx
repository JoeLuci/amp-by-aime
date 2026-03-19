import { createClient } from '@/lib/supabase/server'
import { CategoriesManager } from '@/components/admin/CategoriesManager'

export default async function CategoriesPage() {
  const supabase = await createClient()

  // Fetch all categories
  const { data: categories, error } = await supabase
    .from('categories')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching categories:', error)
  }

  // Try to fetch creator information separately
  let categoriesWithCreators = categories
  if (categories && categories.length > 0) {
    try {
      const { data: categoriesWithCreatorData } = await supabase
        .from('categories')
        .select(`
          *,
          creator:created_by(
            id,
            full_name,
            email
          )
        `)
        .order('name', { ascending: true })

      if (categoriesWithCreatorData) {
        categoriesWithCreators = categoriesWithCreatorData
      }
    } catch (err) {
      // If created_by field doesn't exist yet, just use categories without creator info
      console.log('Creator field not yet available for categories')
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Categories</h1>
        <p className="text-gray-600">Manage content categories for resources and organization</p>
      </div>

      <CategoriesManager categories={categoriesWithCreators || []} />
    </div>
  )
}
