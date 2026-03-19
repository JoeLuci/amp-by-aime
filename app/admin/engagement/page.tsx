import { createClient } from '@/lib/supabase/server'
import { EngagementSettings } from '@/components/admin/EngagementSettings'

// Helper to fetch all engagement stats in batches (Supabase limits to 1000 per request)
async function fetchAllEngagementStats(supabase: any) {
  const allStats: { engagement_level?: string; engagement_score?: number }[] = []
  const batchSize = 1000
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from('profiles')
      .select('engagement_level, engagement_score')
      .in('role', ['loan_officer', 'broker_owner', 'loan_officer_assistant', 'processor'])
      .eq('is_admin', false)
      .range(offset, offset + batchSize - 1)

    if (error) {
      console.error('Error fetching engagement stats batch:', error)
      break
    }

    if (data && data.length > 0) {
      allStats.push(...data)
      offset += batchSize
      hasMore = data.length === batchSize
    } else {
      hasMore = false
    }
  }

  return allStats
}

export default async function EngagementSettingsPage() {
  const supabase = await createClient()

  // Fetch scoring config
  const { data: scoringConfig } = await supabase
    .from('engagement_scoring_config')
    .select('*')
    .order('display_order', { ascending: true })

  // Fetch engagement levels
  const { data: levels } = await supabase
    .from('engagement_levels')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  // Fetch thresholds separately
  const { data: thresholds } = await supabase
    .from('engagement_thresholds')
    .select('*')

  // Merge thresholds into levels
  const engagementLevels = (levels || []).map(level => ({
    ...level,
    engagement_thresholds: (thresholds || []).filter(t => t.engagement_level_id === level.id)
  }))

  // Get engagement stats in batches
  const engagementStats = await fetchAllEngagementStats(supabase)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Engagement Settings</h1>
        <p className="text-gray-600">Configure how member engagement is calculated and displayed</p>
      </div>

      <EngagementSettings
        scoringConfig={scoringConfig || []}
        engagementLevels={engagementLevels || []}
        engagementStats={engagementStats || []}
      />
    </div>
  )
}
