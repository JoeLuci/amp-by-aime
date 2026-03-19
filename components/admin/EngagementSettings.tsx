'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { RefreshCw, Save, Settings2, BarChart3, Target } from 'lucide-react'

interface ScoringConfig {
  id: string
  metric_key: string
  metric_name: string
  metric_description?: string
  points_per_action: number
  max_points_per_period?: number
  period_days: number
  is_active: boolean
  display_order: number
}

interface EngagementThreshold {
  id: string
  min_score: number
  max_score?: number
}

interface EngagementLevel {
  id: string
  name: string
  description?: string
  color: string
  sort_order: number
  engagement_thresholds?: EngagementThreshold[]
}

interface EngagementStat {
  engagement_level?: string
  engagement_score?: number
}

interface Props {
  scoringConfig: ScoringConfig[]
  engagementLevels: EngagementLevel[]
  engagementStats: EngagementStat[]
}

export function EngagementSettings({ scoringConfig: initialConfig, engagementLevels: initialLevels, engagementStats }: Props) {
  const supabase = createClient()
  const [scoringConfig, setScoringConfig] = useState(initialConfig)
  const [engagementLevels, setEngagementLevels] = useState(initialLevels)
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)

  // Calculate stats
  const levelCounts = engagementStats.reduce((acc, stat) => {
    const level = stat.engagement_level || 'Not Set'
    acc[level] = (acc[level] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const totalMembers = engagementStats.length
  const avgScore = totalMembers > 0
    ? Math.round(engagementStats.reduce((sum, s) => sum + (s.engagement_score || 0), 0) / totalMembers)
    : 0

  const handleConfigChange = (id: string, field: keyof ScoringConfig, value: number | boolean) => {
    setScoringConfig(prev =>
      prev.map(config =>
        config.id === id ? { ...config, [field]: value } : config
      )
    )
  }

  const handleThresholdChange = (levelId: string, field: 'min_score' | 'max_score', value: number | null) => {
    setEngagementLevels(prev =>
      prev.map(level => {
        if (level.id !== levelId) return level
        const threshold = level.engagement_thresholds?.[0]
        if (!threshold) return level
        return {
          ...level,
          engagement_thresholds: [{
            ...threshold,
            [field]: value
          }]
        }
      })
    )
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      // Update scoring config
      for (const config of scoringConfig) {
        const { error } = await supabase
          .from('engagement_scoring_config')
          .update({
            points_per_action: config.points_per_action,
            max_points_per_period: config.max_points_per_period,
            period_days: config.period_days,
            is_active: config.is_active
          })
          .eq('id', config.id)

        if (error) throw error
      }

      // Update thresholds
      for (const level of engagementLevels) {
        const threshold = level.engagement_thresholds?.[0]
        if (threshold) {
          const { error } = await supabase
            .from('engagement_thresholds')
            .update({
              min_score: threshold.min_score,
              max_score: threshold.max_score
            })
            .eq('id', threshold.id)

          if (error) throw error
        }
      }

      toast.success('Settings saved successfully')
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const recalculateAllScores = async () => {
    setRecalculating(true)
    try {
      const { data, error } = await supabase.rpc('update_all_engagement_scores')

      if (error) throw error

      toast.success(`Recalculated engagement for ${data} members`)

      // Refresh page to show updated stats
      window.location.reload()
    } catch (error) {
      console.error('Error recalculating scores:', error)
      toast.error('Failed to recalculate scores')
    } finally {
      setRecalculating(false)
    }
  }

  const getLevelColor = (level: string) => {
    const found = engagementLevels.find(l => l.name === level)
    return found?.color || '#6b7280'
  }

  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList>
        <TabsTrigger value="overview" className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Overview
        </TabsTrigger>
        <TabsTrigger value="scoring" className="flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Scoring Rules
        </TabsTrigger>
        <TabsTrigger value="thresholds" className="flex items-center gap-2">
          <Target className="h-4 w-4" />
          Level Thresholds
        </TabsTrigger>
      </TabsList>

      {/* Overview Tab */}
      <TabsContent value="overview" className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">Total Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalMembers}</div>
            </CardContent>
          </Card>

          {engagementLevels.map(level => (
            <Card key={level.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-500">{level.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div
                    className="text-3xl font-bold"
                    style={{ color: level.color }}
                  >
                    {levelCounts[level.name] || 0}
                  </div>
                  <div className="text-sm text-gray-500">
                    ({totalMembers > 0 ? Math.round(((levelCounts[level.name] || 0) / totalMembers) * 100) : 0}%)
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Engagement Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Engagement Distribution</CardTitle>
            <CardDescription>Visual breakdown of member engagement levels</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-8 rounded-lg overflow-hidden">
              {engagementLevels.map(level => {
                const count = levelCounts[level.name] || 0
                const percentage = totalMembers > 0 ? (count / totalMembers) * 100 : 0
                return (
                  <div
                    key={level.id}
                    className="flex items-center justify-center text-white text-xs font-medium transition-all"
                    style={{
                      backgroundColor: level.color,
                      width: `${Math.max(percentage, percentage > 0 ? 5 : 0)}%`
                    }}
                    title={`${level.name}: ${count} (${Math.round(percentage)}%)`}
                  >
                    {percentage >= 15 && `${Math.round(percentage)}%`}
                  </div>
                )
              })}
              {(levelCounts['Not Set'] || 0) > 0 && (
                <div
                  className="flex items-center justify-center text-white text-xs font-medium bg-gray-400"
                  style={{
                    width: `${Math.max(((levelCounts['Not Set'] || 0) / totalMembers) * 100, 5)}%`
                  }}
                  title={`Not Set: ${levelCounts['Not Set']}`}
                >
                  {((levelCounts['Not Set'] || 0) / totalMembers) * 100 >= 15 && 'Not Set'}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-4 mt-4">
              {engagementLevels.map(level => (
                <div key={level.id} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: level.color }}
                  />
                  <span className="text-sm text-gray-600">{level.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            onClick={recalculateAllScores}
            disabled={recalculating}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${recalculating ? 'animate-spin' : ''}`} />
            {recalculating ? 'Recalculating...' : 'Recalculate All Scores'}
          </Button>
        </div>
      </TabsContent>

      {/* Scoring Rules Tab */}
      <TabsContent value="scoring" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Point Values</CardTitle>
            <CardDescription>
              Configure how many points each activity earns. Points are calculated over a rolling period.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {scoringConfig.map(config => (
              <div
                key={config.id}
                className={`p-4 border rounded-lg ${!config.is_active ? 'opacity-50 bg-gray-50' : ''}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{config.metric_name}</h3>
                      <Badge variant={config.is_active ? 'default' : 'secondary'}>
                        {config.is_active ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                    {config.metric_description && (
                      <p className="text-sm text-gray-500 mt-1">{config.metric_description}</p>
                    )}
                  </div>
                  <Switch
                    checked={config.is_active}
                    onCheckedChange={(checked) => handleConfigChange(config.id, 'is_active', checked)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor={`points-${config.id}`}>Points per Action</Label>
                    <Input
                      id={`points-${config.id}`}
                      type="number"
                      min={0}
                      value={config.points_per_action}
                      onChange={(e) => handleConfigChange(config.id, 'points_per_action', parseInt(e.target.value) || 0)}
                      disabled={!config.is_active}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`max-${config.id}`}>Max Points (per period)</Label>
                    <Input
                      id={`max-${config.id}`}
                      type="number"
                      min={0}
                      value={config.max_points_per_period || ''}
                      placeholder="No limit"
                      onChange={(e) => handleConfigChange(config.id, 'max_points_per_period', e.target.value ? parseInt(e.target.value) : 0)}
                      disabled={!config.is_active}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`period-${config.id}`}>Period (days)</Label>
                    <Input
                      id={`period-${config.id}`}
                      type="number"
                      min={1}
                      value={config.period_days}
                      onChange={(e) => handleConfigChange(config.id, 'period_days', parseInt(e.target.value) || 30)}
                      disabled={!config.is_active}
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button onClick={saveConfig} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </TabsContent>

      {/* Level Thresholds Tab */}
      <TabsContent value="thresholds" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Engagement Level Thresholds</CardTitle>
            <CardDescription>
              Define the score ranges that determine each engagement level
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {engagementLevels.map(level => {
              const threshold = level.engagement_thresholds?.[0]
              return (
                <div
                  key={level.id}
                  className="p-4 border rounded-lg"
                  style={{ borderLeftColor: level.color, borderLeftWidth: '4px' }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: level.color }}
                    />
                    <div>
                      <h3 className="font-semibold">{level.name}</h3>
                      {level.description && (
                        <p className="text-sm text-gray-500">{level.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`min-${level.id}`}>Minimum Score</Label>
                      <Input
                        id={`min-${level.id}`}
                        type="number"
                        min={0}
                        value={threshold?.min_score ?? 0}
                        onChange={(e) => handleThresholdChange(level.id, 'min_score', parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`max-${level.id}`}>Maximum Score</Label>
                      <Input
                        id={`max-${level.id}`}
                        type="number"
                        min={0}
                        value={threshold?.max_score ?? ''}
                        placeholder="No limit (top tier)"
                        onChange={(e) => handleThresholdChange(level.id, 'max_score', e.target.value ? parseInt(e.target.value) : null)}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Score Scale Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative h-12 bg-gray-100 rounded-lg overflow-hidden">
              {engagementLevels.map((level, index) => {
                const threshold = level.engagement_thresholds?.[0]
                if (!threshold) return null
                const minScore = threshold.min_score
                const maxScore = threshold.max_score ?? 300 // Default max for display
                const totalRange = 300 // Display range
                const startPercent = (minScore / totalRange) * 100
                const widthPercent = ((maxScore - minScore) / totalRange) * 100

                return (
                  <div
                    key={level.id}
                    className="absolute h-full flex items-center justify-center text-white text-xs font-medium"
                    style={{
                      backgroundColor: level.color,
                      left: `${startPercent}%`,
                      width: `${widthPercent}%`
                    }}
                  >
                    {threshold.max_score
                      ? `${minScore}-${threshold.max_score}`
                      : `${minScore}+`
                    }
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>0</span>
              <span>50</span>
              <span>100</span>
              <span>150</span>
              <span>200</span>
              <span>250</span>
              <span>300+</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button onClick={saveConfig} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  )
}
