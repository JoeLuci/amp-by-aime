import { createClient } from '@/lib/supabase/server'
import { TagsManager } from '@/components/admin/TagsManager'

export default async function TagsPage() {
  const supabase = await createClient()

  // Fetch all tags with creator information (if field exists)
  const { data: tags, error } = await supabase
    .from('tags')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching tags:', error)
  }

  // Try to fetch creator information separately
  let tagsWithCreators = tags
  if (tags && tags.length > 0) {
    try {
      const { data: tagsWithCreatorData } = await supabase
        .from('tags')
        .select(`
          *,
          creator:created_by(
            id,
            full_name,
            email
          )
        `)
        .order('name', { ascending: true })

      if (tagsWithCreatorData) {
        tagsWithCreators = tagsWithCreatorData
      }
    } catch (err) {
      // If created_by field doesn't exist yet, just use tags without creator info
      console.log('Creator field not yet available, using basic tags')
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Tags</h1>
        <p className="text-gray-600">Manage tags for filtering and organizing content</p>
      </div>

      <TagsManager tags={tagsWithCreators || []} />
    </div>
  )
}
