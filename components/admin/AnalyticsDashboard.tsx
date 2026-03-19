'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Eye, Users, Building2, Briefcase, ArrowUpDown, Search, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, XCircle } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface DashboardMetrics {
  total_views: number
  vendor_connections: number
  lender_connections: number
  unique_users: number
  unique_sessions: number
  top_resources: Array<{ content_title: string; views_count: number; unique_users: number }>
  top_vendors: Array<{ content_title: string; views_count: number; connections_count: number; unique_users: number }>
  top_lenders: Array<{ content_title: string; views_count: number; connections_count: number; unique_users: number }>
  top_events: Array<{ content_title: string; views_count: number; unique_users: number }>
  engagement_by_plan: Array<{
    plan_tier: string
    unique_users: number
    resource_views: number
    vendor_views: number
    lender_views: number
    event_views: number
    vendor_connections: number
    lender_connections: number
  }>
  daily_trends: Array<{ date: string; views: number; connections: number; unique_users: number; unique_sessions: number }>
}

interface ContentItem {
  content_id: string
  content_title: string
  views_count: number
  connections_count: number
  unique_users: number
}

type SortField = 'content_title' | 'views_count' | 'connections_count' | 'unique_users'
type SortDirection = 'asc' | 'desc'

interface EscalationItem {
  id: string
  originator_full_name: string
  partner_name: string | null
  issue_type: string | null
  user_status: string | null
  created_at: string
}

interface ChangeAEItem {
  id: string
  user_full_name: string
  lender_name: string | null
  issue_type: string | null
  user_status: string | null
  created_at: string
}

interface ConversionItem {
  id: string
  conversion_type: 'upgrade' | 'downgrade' | 'cancellation' | 'signup'
  from_tier: string
  to_tier: string
  conversion_date: string
  user_id: string
  email: string
  full_name: string
}

interface ConversionSummary {
  upgrades: number
  downgrades: number
  cancellations: number
  signups: number
}

interface ConversionByTier {
  from_tier: string
  count: number
}

export function AnalyticsDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('30')

  // Content drill-down state
  const [contentTab, setContentTab] = useState<'resources' | 'vendors' | 'lenders' | 'events'>('resources')
  const [contentItems, setContentItems] = useState<ContentItem[]>([])
  const [contentLoading, setContentLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('views_count')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  // Content-specific date range
  const [contentDateRange, setContentDateRange] = useState('30')

  // Escalations & Change AE state
  const [escalations, setEscalations] = useState<EscalationItem[]>([])
  const [changeAERequests, setChangeAERequests] = useState<ChangeAEItem[]>([])
  const [escalationsLoading, setEscalationsLoading] = useState(false)
  const [escalationsDateRange, setEscalationsDateRange] = useState('30')

  // Subscriptions/Conversions state
  const [conversions, setConversions] = useState<ConversionItem[]>([])
  const [conversionSummary, setConversionSummary] = useState<ConversionSummary>({ upgrades: 0, downgrades: 0, cancellations: 0, signups: 0 })
  const [conversionsByTier, setConversionsByTier] = useState<ConversionByTier[]>([])
  const [conversionsLoading, setConversionsLoading] = useState(false)
  const [conversionsDateRange, setConversionsDateRange] = useState('30')
  const [conversionsPage, setConversionsPage] = useState(1)
  const [conversionsPerPage, setConversionsPerPage] = useState(25)

  useEffect(() => {
    fetchAnalytics()
  }, [dateRange])

  useEffect(() => {
    fetchContentList()
    setCurrentPage(1) // Reset to first page when filters change
  }, [contentTab, contentDateRange])

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  // Fetch escalations data
  useEffect(() => {
    fetchEscalationsData()
  }, [escalationsDateRange])

  // Fetch conversions data
  useEffect(() => {
    fetchConversionsData()
    setConversionsPage(1) // Reset to first page when date range changes
  }, [conversionsDateRange])

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const days = parseInt(dateRange)
      const endDate = new Date()
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

      const response = await fetch(
        `/api/analytics/dashboard?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      )

      if (!response.ok) throw new Error('Failed to fetch analytics')

      const data = await response.json()
      setMetrics(data.metrics)
    } catch (error) {
      console.error('Error fetching analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchContentList = async () => {
    setContentLoading(true)
    try {
      const days = parseInt(contentDateRange)
      const endDate = new Date()
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      const contentTypeMap = {
        resources: 'resource',
        vendors: 'vendor',
        lenders: 'lender',
        events: 'event'
      }

      const response = await fetch(
        `/api/analytics/content-list?contentType=${contentTypeMap[contentTab]}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      )

      if (!response.ok) throw new Error('Failed to fetch content list')

      const data = await response.json()
      setContentItems(data.items || [])
    } catch (error) {
      console.error('Error fetching content list:', error)
      setContentItems([])
    } finally {
      setContentLoading(false)
    }
  }

  const fetchEscalationsData = async () => {
    setEscalationsLoading(true)
    try {
      const days = parseInt(escalationsDateRange)
      const endDate = new Date()
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

      const response = await fetch(
        `/api/analytics/escalations?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      )

      if (!response.ok) throw new Error('Failed to fetch escalations data')

      const data = await response.json()
      setEscalations(data.escalations || [])
      setChangeAERequests(data.changeAERequests || [])
    } catch (error) {
      console.error('Error fetching escalations data:', error)
      setEscalations([])
      setChangeAERequests([])
    } finally {
      setEscalationsLoading(false)
    }
  }

  const fetchConversionsData = async () => {
    setConversionsLoading(true)
    try {
      const days = parseInt(conversionsDateRange)
      const endDate = new Date()
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

      const response = await fetch(
        `/api/analytics/conversions?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      )

      if (!response.ok) throw new Error('Failed to fetch conversions data')

      const data = await response.json()
      setConversionSummary(data.summary || { upgrades: 0, downgrades: 0, cancellations: 0, signups: 0 })
      setConversions(data.conversions || [])
      setConversionsByTier(data.byFromTier || [])
    } catch (error) {
      console.error('Error fetching conversions data:', error)
      setConversionSummary({ upgrades: 0, downgrades: 0, cancellations: 0, signups: 0 })
      setConversions([])
      setConversionsByTier([])
    } finally {
      setConversionsLoading(false)
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const getSortedAndFilteredItems = () => {
    let filtered = contentItems

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(item =>
        item.content_title?.toLowerCase().includes(query)
      )
    }

    // Sort with secondary sort by connections when sorting by views
    return [...filtered].sort((a, b) => {
      let aVal: string | number = a[sortField] ?? 0
      let bVal: string | number = b[sortField] ?? 0

      if (sortField === 'content_title') {
        aVal = (aVal as string).toLowerCase()
        bVal = (bVal as string).toLowerCase()
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal)
      }

      const primaryResult = sortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number)

      // Secondary sort by connections when primary values are equal
      if (primaryResult === 0 && sortField === 'views_count') {
        const aConn = a.connections_count ?? 0
        const bConn = b.connections_count ?? 0
        return bConn - aConn // Always descending for secondary sort
      }

      return primaryResult
    })
  }

  // Pagination helpers
  const allFilteredItems = getSortedAndFilteredItems()
  const totalItems = allFilteredItems.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const paginatedItems = allFilteredItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const showConnections = contentTab === 'vendors' || contentTab === 'lenders'

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="text-center p-12">
        <p className="text-muted-foreground">No analytics data available</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex justify-between items-center">
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 6 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Views</p>
              <p className="text-2xl font-bold">{(metrics.total_views || 0).toLocaleString()}</p>
            </div>
            <Eye className="w-8 h-8 text-blue-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Unique Users</p>
              <p className="text-2xl font-bold">{(metrics.unique_users || 0).toLocaleString()}</p>
            </div>
            <Users className="w-8 h-8 text-green-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Lender Connections</p>
              <p className="text-2xl font-bold">{(metrics.lender_connections || 0).toLocaleString()}</p>
            </div>
            <Building2 className="w-8 h-8 text-purple-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Vendor Connections</p>
              <p className="text-2xl font-bold">{(metrics.vendor_connections || 0).toLocaleString()}</p>
            </div>
            <Briefcase className="w-8 h-8 text-amber-600" />
          </div>
        </Card>
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="content">Content Performance</TabsTrigger>
          <TabsTrigger value="escalations">Escalations & Change AE</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="users">User Engagement</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Top Content by Category */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Top Resources */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Top Resources</h3>
              <div className="space-y-3">
                {(metrics.top_resources || []).slice(0, 5).map((item, index) => (
                  <div key={index} className="flex items-center justify-between border-b pb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.content_title || 'Untitled'}</p>
                      <p className="text-sm text-muted-foreground">{item.unique_users} unique users</p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-semibold text-blue-600">{item.views_count || 0}</p>
                      <p className="text-xs text-muted-foreground">views</p>
                    </div>
                  </div>
                ))}
                {(!metrics.top_resources || metrics.top_resources.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
                )}
              </div>
            </Card>

            {/* Top Vendors */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Top Vendors</h3>
              <div className="space-y-3">
                {(metrics.top_vendors || []).slice(0, 5).map((item, index) => (
                  <div key={index} className="flex items-center justify-between border-b pb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.content_title || 'Untitled'}</p>
                      <p className="text-sm text-muted-foreground">{item.unique_users} unique users</p>
                    </div>
                    <div className="flex gap-4 ml-4">
                      <div className="text-right">
                        <p className="font-semibold text-blue-600">{item.views_count || 0}</p>
                        <p className="text-xs text-muted-foreground">views</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-amber-600">{item.connections_count || 0}</p>
                        <p className="text-xs text-muted-foreground">connections</p>
                      </div>
                    </div>
                  </div>
                ))}
                {(!metrics.top_vendors || metrics.top_vendors.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
                )}
              </div>
            </Card>

            {/* Top Lenders */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Top Lenders</h3>
              <div className="space-y-3">
                {(metrics.top_lenders || []).slice(0, 5).map((item, index) => (
                  <div key={index} className="flex items-center justify-between border-b pb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.content_title || 'Untitled'}</p>
                      <p className="text-sm text-muted-foreground">{item.unique_users} unique users</p>
                    </div>
                    <div className="flex gap-4 ml-4">
                      <div className="text-right">
                        <p className="font-semibold text-blue-600">{item.views_count || 0}</p>
                        <p className="text-xs text-muted-foreground">views</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-amber-600">{item.connections_count || 0}</p>
                        <p className="text-xs text-muted-foreground">connections</p>
                      </div>
                    </div>
                  </div>
                ))}
                {(!metrics.top_lenders || metrics.top_lenders.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
                )}
              </div>
            </Card>

            {/* Top Events */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Top Events</h3>
              <div className="space-y-3">
                {(metrics.top_events || []).slice(0, 5).map((item, index) => (
                  <div key={index} className="flex items-center justify-between border-b pb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.content_title || 'Untitled'}</p>
                      <p className="text-sm text-muted-foreground">{item.unique_users} unique users</p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-semibold text-blue-600">{item.views_count || 0}</p>
                      <p className="text-xs text-muted-foreground">views</p>
                    </div>
                  </div>
                ))}
                {(!metrics.top_events || metrics.top_events.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Content Performance</h3>

            {/* Content Type Tabs and Date Range */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div className="flex flex-wrap gap-2">
                {(['resources', 'vendors', 'lenders', 'events'] as const).map((tab) => (
                  <Button
                    key={tab}
                    variant={contentTab === tab ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setContentTab(tab)}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Button>
                ))}
              </div>
              <Select value={contentDateRange} onValueChange={setContentDateRange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="180">Last 6 months</SelectItem>
                  <SelectItem value="365">Last year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search and Items per page */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Show:</span>
                <Select value={itemsPerPage.toString()} onValueChange={(v) => { setItemsPerPage(parseInt(v)); setCurrentPage(1) }}>
                  <SelectTrigger className="w-[80px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Table */}
            {contentLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2">
                        <button
                          onClick={() => handleSort('content_title')}
                          className="flex items-center gap-1 font-semibold hover:text-primary"
                        >
                          Title
                          <ArrowUpDown className="h-4 w-4" />
                        </button>
                      </th>
                      <th className="text-right py-3 px-2">
                        <button
                          onClick={() => handleSort('views_count')}
                          className="flex items-center gap-1 font-semibold hover:text-primary ml-auto"
                        >
                          Views
                          <ArrowUpDown className="h-4 w-4" />
                        </button>
                      </th>
                      {showConnections && (
                        <th className="text-right py-3 px-2">
                          <button
                            onClick={() => handleSort('connections_count')}
                            className="flex items-center gap-1 font-semibold hover:text-primary ml-auto"
                          >
                            Connections
                            <ArrowUpDown className="h-4 w-4" />
                          </button>
                        </th>
                      )}
                      <th className="text-right py-3 px-2">
                        <button
                          onClick={() => handleSort('unique_users')}
                          className="flex items-center gap-1 font-semibold hover:text-primary ml-auto"
                        >
                          Unique Users
                          <ArrowUpDown className="h-4 w-4" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedItems.map((item, index) => (
                      <tr key={item.content_id || index} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-2">
                          <span className="font-medium">{item.content_title || 'Untitled'}</span>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <span className="text-blue-600 font-semibold">{item.views_count || 0}</span>
                        </td>
                        {showConnections && (
                          <td className="py-3 px-2 text-right">
                            <span className="text-amber-600 font-semibold">{item.connections_count || 0}</span>
                          </td>
                        )}
                        <td className="py-3 px-2 text-right">
                          <span className="text-muted-foreground">{item.unique_users || 0}</span>
                        </td>
                      </tr>
                    ))}
                    {paginatedItems.length === 0 && (
                      <tr>
                        <td colSpan={showConnections ? 4 : 3} className="py-8 text-center text-muted-foreground">
                          No data available for this content type
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} {contentTab}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    First
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm px-2">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    Last
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="escalations" className="space-y-4">
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h3 className="text-lg font-semibold">Escalations & Change AE Requests</h3>
              <Select value={escalationsDateRange} onValueChange={setEscalationsDateRange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="180">Last 6 months</SelectItem>
                  <SelectItem value="365">Last year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {escalationsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="p-4 bg-muted/50">
                    <p className="text-sm text-muted-foreground">Total Escalations</p>
                    <p className="text-2xl font-bold text-red-600">{escalations.length}</p>
                  </Card>
                  <Card className="p-4 bg-muted/50">
                    <p className="text-sm text-muted-foreground">Change AE Requests</p>
                    <p className="text-2xl font-bold text-orange-600">{changeAERequests.length}</p>
                  </Card>
                </div>

                {/* Escalations Table */}
                <div>
                  <h4 className="font-semibold mb-3">Loan Escalations</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-2 font-semibold">User</th>
                          <th className="text-left py-3 px-2 font-semibold">Lender/Partner</th>
                          <th className="text-left py-3 px-2 font-semibold">Issue Type</th>
                          <th className="text-left py-3 px-2 font-semibold">Status</th>
                          <th className="text-left py-3 px-2 font-semibold">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {escalations.slice(0, 10).map((item) => (
                          <tr key={item.id} className="border-b hover:bg-muted/50">
                            <td className="py-3 px-2">{item.originator_full_name}</td>
                            <td className="py-3 px-2">{item.partner_name || '-'}</td>
                            <td className="py-3 px-2">{item.issue_type || '-'}</td>
                            <td className="py-3 px-2">
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                item.user_status === 'closed' ? 'bg-green-100 text-green-800' :
                                item.user_status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {item.user_status || 'pending'}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-muted-foreground">
                              {new Date(item.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                        {escalations.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-muted-foreground">
                              No escalations in this period
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {escalations.length > 10 && (
                    <p className="text-sm text-muted-foreground mt-2">Showing 10 of {escalations.length} escalations</p>
                  )}
                </div>

                {/* Change AE Requests Table */}
                <div>
                  <h4 className="font-semibold mb-3">Change AE Requests</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-2 font-semibold">User</th>
                          <th className="text-left py-3 px-2 font-semibold">Lender</th>
                          <th className="text-left py-3 px-2 font-semibold">Issue Type</th>
                          <th className="text-left py-3 px-2 font-semibold">Status</th>
                          <th className="text-left py-3 px-2 font-semibold">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changeAERequests.slice(0, 10).map((item) => (
                          <tr key={item.id} className="border-b hover:bg-muted/50">
                            <td className="py-3 px-2">{item.user_full_name}</td>
                            <td className="py-3 px-2">{item.lender_name || '-'}</td>
                            <td className="py-3 px-2">{item.issue_type || '-'}</td>
                            <td className="py-3 px-2">
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                item.user_status === 'closed' ? 'bg-green-100 text-green-800' :
                                item.user_status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {item.user_status || 'pending'}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-muted-foreground">
                              {new Date(item.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                        {changeAERequests.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-muted-foreground">
                              No change AE requests in this period
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {changeAERequests.length > 10 && (
                    <p className="text-sm text-muted-foreground mt-2">Showing 10 of {changeAERequests.length} requests</p>
                  )}
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="subscriptions" className="space-y-4">
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h3 className="text-lg font-semibold">Subscription Conversions</h3>
              <Select value={conversionsDateRange} onValueChange={setConversionsDateRange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="180">Last 6 months</SelectItem>
                  <SelectItem value="365">Last year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {conversionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="p-4 bg-green-50 border-green-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-green-700">Upgrades</p>
                        <p className="text-2xl font-bold text-green-600">{conversionSummary.upgrades}</p>
                      </div>
                      <TrendingUp className="w-8 h-8 text-green-500" />
                    </div>
                  </Card>
                  <Card className="p-4 bg-orange-50 border-orange-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-orange-700">Downgrades</p>
                        <p className="text-2xl font-bold text-orange-600">{conversionSummary.downgrades}</p>
                      </div>
                      <TrendingDown className="w-8 h-8 text-orange-500" />
                    </div>
                  </Card>
                  <Card className="p-4 bg-red-50 border-red-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-red-700">Cancellations</p>
                        <p className="text-2xl font-bold text-red-600">{conversionSummary.cancellations}</p>
                      </div>
                      <XCircle className="w-8 h-8 text-red-500" />
                    </div>
                  </Card>
                </div>

                {/* Conversions Table */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
                    <h4 className="font-semibold">Recent Conversions</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Show:</span>
                      <Select value={conversionsPerPage.toString()} onValueChange={(v) => { setConversionsPerPage(parseInt(v)); setConversionsPage(1) }}>
                        <SelectTrigger className="w-[80px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-2 font-semibold">User</th>
                          <th className="text-left py-3 px-2 font-semibold">Type</th>
                          <th className="text-left py-3 px-2 font-semibold">From Tier</th>
                          <th className="text-left py-3 px-2 font-semibold">To Tier</th>
                          <th className="text-left py-3 px-2 font-semibold">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {conversions.slice((conversionsPage - 1) * conversionsPerPage, conversionsPage * conversionsPerPage).map((item) => (
                          <tr key={item.id} className="border-b hover:bg-muted/50">
                            <td className="py-3 px-2">
                              <div>
                                <p className="font-medium">{item.full_name || 'Unknown'}</p>
                                <p className="text-xs text-muted-foreground">{item.email}</p>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                item.conversion_type === 'upgrade' ? 'bg-green-100 text-green-800' :
                                item.conversion_type === 'downgrade' ? 'bg-orange-100 text-orange-800' :
                                item.conversion_type === 'cancellation' ? 'bg-red-100 text-red-800' :
                                'bg-blue-100 text-blue-800'
                              }`}>
                                {item.conversion_type}
                              </span>
                            </td>
                            <td className="py-3 px-2">{item.from_tier || '-'}</td>
                            <td className="py-3 px-2">{item.to_tier || '-'}</td>
                            <td className="py-3 px-2 text-muted-foreground">
                              {new Date(item.conversion_date).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                        {conversions.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-muted-foreground">
                              No conversions in this period
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination Controls */}
                  {(() => {
                    const totalConversions = conversions.length
                    const totalConversionPages = Math.ceil(totalConversions / conversionsPerPage)
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
                        <div className="text-sm text-muted-foreground">
                          Showing {totalConversions === 0 ? 0 : (conversionsPage - 1) * conversionsPerPage + 1}-{Math.min(conversionsPage * conversionsPerPage, totalConversions)} of {totalConversions} conversions
                        </div>
                        {totalConversionPages > 1 && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConversionsPage(1)}
                              disabled={conversionsPage === 1}
                            >
                              First
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConversionsPage(p => Math.max(1, p - 1))}
                              disabled={conversionsPage === 1}
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm px-2">
                              Page {conversionsPage} of {totalConversionPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConversionsPage(p => Math.min(totalConversionPages, p + 1))}
                              disabled={conversionsPage === totalConversionPages}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConversionsPage(totalConversionPages)}
                              disabled={conversionsPage === totalConversionPages}
                            >
                              Last
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Engagement by Plan Tier</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-semibold">Plan Tier</th>
                    <th className="text-right py-3 px-2 font-semibold">Users</th>
                    <th className="text-right py-3 px-2 font-semibold text-blue-600">Resource Views</th>
                    <th className="text-right py-3 px-2 font-semibold text-blue-600">Vendor Views</th>
                    <th className="text-right py-3 px-2 font-semibold text-blue-600">Lender Views</th>
                    <th className="text-right py-3 px-2 font-semibold text-blue-600">Event Views</th>
                    <th className="text-right py-3 px-2 font-semibold text-amber-600">Vendor Connects</th>
                    <th className="text-right py-3 px-2 font-semibold text-amber-600">Lender Connects</th>
                  </tr>
                </thead>
                <tbody>
                  {(metrics.engagement_by_plan || []).map((tier, index) => (
                    <tr key={tier.plan_tier || index} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2">
                        <span className="font-medium capitalize">{tier.plan_tier || 'Unknown'}</span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span className="text-green-600 font-semibold">{(tier.unique_users || 0).toLocaleString()}</span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span className="text-blue-600">{(tier.resource_views || 0).toLocaleString()}</span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span className="text-blue-600">{(tier.vendor_views || 0).toLocaleString()}</span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span className="text-blue-600">{(tier.lender_views || 0).toLocaleString()}</span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span className="text-blue-600">{(tier.event_views || 0).toLocaleString()}</span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span className="text-amber-600">{(tier.vendor_connections || 0).toLocaleString()}</span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span className="text-amber-600">{(tier.lender_connections || 0).toLocaleString()}</span>
                      </td>
                    </tr>
                  ))}
                  {(!metrics.engagement_by_plan || metrics.engagement_by_plan.length === 0) && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        No engagement data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
