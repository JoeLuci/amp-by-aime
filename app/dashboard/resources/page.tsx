import ResourcesClient from './resources-client'
import { createClient } from '@/lib/supabase/server'

export default async function ResourcesPage() {
  const supabase = await createClient()

  // Fetch categories for filter - sorted alphabetically (only resources categories)
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('content_area', 'resources')
    .eq('is_active', true)
    .order('name', { ascending: true })

  // Fetch content types for filter (only resources types)
  const { data: contentTypes } = await supabase
    .from('content_types')
    .select('*')
    .eq('content_area', 'resources')
    .eq('is_active', true)
    .order('name', { ascending: true })

  return <ResourcesClient categories={categories || []} contentTypes={contentTypes || []} />
}
