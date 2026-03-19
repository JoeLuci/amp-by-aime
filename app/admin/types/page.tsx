import { createClient } from '@/lib/supabase/server'
import { TypesManager } from '@/components/admin/TypesManager'

export default async function TypesPage() {
  const supabase = await createClient()

  // Fetch all content types
  const { data: types } = await supabase
    .from('content_types')
    .select('*')
    .order('name', { ascending: true })

  // Try to fetch creator information separately
  let typesWithCreators = types
  if (types && types.length > 0) {
    try {
      const { data: typesWithCreatorData } = await supabase
        .from('content_types')
        .select(`
          *,
          creator:created_by(
            id,
            full_name,
            email
          )
        `)
        .order('name', { ascending: true })

      if (typesWithCreatorData) {
        typesWithCreators = typesWithCreatorData
      }
    } catch (err) {
      // If created_by field doesn't exist yet, just use types without creator info
      console.log('Creator field not yet available for content_types')
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Content Types</h1>
        <p className="text-gray-600">Manage dynamic content types for Resources and Events</p>
      </div>

      <TypesManager types={typesWithCreators || []} />
    </div>
  )
}
