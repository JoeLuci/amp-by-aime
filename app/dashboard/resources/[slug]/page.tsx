import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import UpgradeRequired from './upgrade-required'
import { getViewAsSettings, applyViewAsOverride } from '@/lib/view-as-server'
import { AudioPlayer } from '@/components/AudioPlayer'
import { ViewTracker } from '@/components/analytics/ViewTracker'

interface ResourceDetailPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

// Helper function to check if URL is a YouTube video
function isYouTubeUrl(url: string): boolean {
  if (!url) return false
  return url.includes('youtube.com') || url.includes('youtu.be')
}

// Helper function to convert YouTube URLs to embed format
function getEmbedUrl(url: string): string {
  if (!url) return url

  // Already an embed URL
  if (url.includes('youtube.com/embed/') || url.includes('youtu.be/embed/')) {
    return url
  }

  // Extract video ID from various YouTube URL formats
  let videoId = ''

  // Format: https://www.youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/[?&]v=([^&]+)/)
  if (watchMatch) {
    videoId = watchMatch[1]
  }

  // Format: https://youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([^?]+)/)
  if (shortMatch) {
    videoId = shortMatch[1]
  }

  // If we found a video ID, return embed URL
  if (videoId) {
    return `https://www.youtube.com/embed/${videoId}`
  }

  // Return original URL if not a YouTube URL (might be Vimeo, etc.)
  return url
}

export default async function ResourceDetailPage({ params, searchParams }: ResourceDetailPageProps) {
  const { slug } = await params
  const search = await searchParams
  const supabase = await createClient()

  // Build query string for back button
  const queryParams = new URLSearchParams()
  if (search.page) queryParams.set('page', String(search.page))
  if (search.category) queryParams.set('category', String(search.category))
  if (search.type) queryParams.set('type', String(search.type))
  const backUrl = queryParams.toString()
    ? `/dashboard/resources?${queryParams.toString()}`
    : '/dashboard/resources'

  // Get current user for access control
  const { data: { user } } = await supabase.auth.getUser()
  let { data: profile } = await supabase
    .from('profiles')
    .select('role, plan_tier, is_admin')
    .eq('id', user?.id)
    .single()

  // Apply view-as override if active
  const viewAsSettings = await getViewAsSettings()
  profile = applyViewAsOverride(profile, viewAsSettings)

  // Fetch the resource with creator info
  const { data: resource } = await supabase
    .from('resources')
    .select(`
      *,
      creator:created_by (
        full_name
      ),
      category:category_id (
        name,
        color
      )
    `)
    .eq('slug', slug)
    .eq('is_published', true)
    .single()

  if (!resource) {
    notFound()
  }

  // Admins can see everything
  // Partners (vendors/lenders) can see everything
  const isPartner = profile?.role === 'partner_vendor' || profile?.role === 'partner_lender'

  if (!profile?.is_admin && !isPartner) {
    // Check if user has access
    // Map "Premium Guest" to "Premium" for access checks
    const effectiveTier = profile?.plan_tier === 'Premium Guest' ? 'Premium' : profile?.plan_tier

    const hasPlanAccess = !resource.required_plan_tier ||
      resource.required_plan_tier.length === 0 ||
      resource.required_plan_tier.includes(effectiveTier)

    if (!hasPlanAccess) {
      // Show upgrade page instead of 404
      return (
        <UpgradeRequired
          resourceTitle={resource.title}
          requiredTiers={resource.required_plan_tier || []}
          backUrl={backUrl}
        />
      )
    }
  }

  // Convert YouTube URLs to embed format
  const embedUrl = resource.file_url ? getEmbedUrl(resource.file_url) : ''
  const isYouTube = isYouTubeUrl(resource.file_url || '')

  // Fetch current resource's tags
  const { data: currentResourceTags } = await supabase
    .from('resource_tags')
    .select('tag_id')
    .eq('resource_id', resource.id)

  const currentTagIds = currentResourceTags?.map(t => t.tag_id) || []

  // Fetch recommended resources based on shared tags, category, and recency
  let recommendedResources: any[] = []

  if (currentTagIds.length > 0) {
    // Find resources that share tags with the current resource
    const { data: resourcesWithSharedTags } = await supabase
      .from('resource_tags')
      .select(`
        resource_id,
        resource:resource_id (
          id,
          title,
          slug,
          thumbnail_url,
          resource_type,
          created_at,
          is_published,
          category_id
        )
      `)
      .in('tag_id', currentTagIds)
      .neq('resource_id', resource.id)

    // Dedupe and score resources by number of shared tags
    const resourceScores = new Map<string, { resource: any; tagCount: number }>()

    resourcesWithSharedTags?.forEach(item => {
      const res = item.resource as any
      if (res && res.is_published) {
        const existing = resourceScores.get(res.id)
        if (existing) {
          existing.tagCount++
        } else {
          resourceScores.set(res.id, { resource: res, tagCount: 1 })
        }
      }
    })

    // Sort by tag count (most shared tags first), then by recency
    recommendedResources = Array.from(resourceScores.values())
      .sort((a, b) => {
        // First by tag count
        if (b.tagCount !== a.tagCount) return b.tagCount - a.tagCount
        // Then by recency
        return new Date(b.resource.created_at).getTime() - new Date(a.resource.created_at).getTime()
      })
      .slice(0, 3)
      .map(item => item.resource)
  }

  // If we don't have enough recommendations from tags, fill with same category resources
  if (recommendedResources.length < 3) {
    const existingIds = [resource.id, ...recommendedResources.map(r => r.id)]

    let query = supabase
      .from('resources')
      .select('*')
      .eq('is_published', true)
      .eq('category_id', resource.category_id)
      .order('created_at', { ascending: false })
      .limit(3 - recommendedResources.length)

    // Exclude already recommended resources
    for (const id of existingIds) {
      query = query.neq('id', id)
    }

    const { data: categoryResources } = await query

    if (categoryResources) {
      recommendedResources = [...recommendedResources, ...categoryResources]
    }
  }

  // If still not enough, get most recent resources
  if (recommendedResources.length < 3) {
    const existingIds = [resource.id, ...recommendedResources.map(r => r.id)]

    let query = supabase
      .from('resources')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(3 - recommendedResources.length)

    // Exclude already recommended resources
    for (const id of existingIds) {
      query = query.neq('id', id)
    }

    const { data: recentResources } = await query

    if (recentResources) {
      recommendedResources = [...recommendedResources, ...recentResources]
    }
  }

  return (
    <div className="min-h-screen">
      {/* Analytics Tracking */}
      <ViewTracker
        contentType="resource"
        contentId={resource.id}
        contentTitle={resource.title}
      />

      {/* Back Button */}
      <div className="px-4 md:px-8 py-4">
        <Link
          href={backUrl}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back to resources</span>
        </Link>
      </div>

      {/* Resource Content */}
      <div className="px-4 md:px-8 pb-6">
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8 max-w-5xl mx-auto">
          {/* Media Section - Video/Podcast/Webinar Player or Thumbnail */}
          {resource.file_url && resource.resource_type === 'podcast' && !isYouTube ? (
            // Audio Player for non-YouTube podcasts
            <div className="mb-6">
              {resource.thumbnail_url && (
                <div className="relative w-full aspect-video mb-4 rounded-lg overflow-hidden">
                  <Image
                    src={resource.thumbnail_url}
                    alt={resource.title}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
              <AudioPlayer src={resource.file_url} title={resource.title} />
            </div>
          ) : embedUrl && (resource.resource_type === 'video' || resource.resource_type === 'podcast' || resource.resource_type === 'webinar') ? (
            // YouTube or other video embed (for video, podcast, webinar)
            <div className="bg-black rounded-lg overflow-hidden aspect-video mb-6">
              <iframe
                width="100%"
                height="100%"
                src={embedUrl}
                title={resource.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          ) : resource.thumbnail_url ? (
            // Fallback thumbnail
            <div className="relative w-full aspect-video mb-6 rounded-lg overflow-hidden">
              <Image
                src={resource.thumbnail_url}
                alt={resource.title}
                fill
                className="object-cover"
              />
            </div>
          ) : null}

          {/* Content Images Carousel (for articles/PDFs) */}
          {resource.content_images && resource.content_images.length > 0 && (
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {resource.content_images.map((imageUrl: string, index: number) => (
                <div key={index} className="relative w-full aspect-video rounded-lg overflow-hidden">
                  <Image
                    src={imageUrl}
                    alt={`${resource.title} - Image ${index + 1}`}
                    fill
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Title and Badge */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
            <div className="flex-1">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                {resource.title}
              </h1>
              {/* Sub-title (below title) */}
              {resource.sub_title && (
                <p className="text-sm text-gray-500 mb-3">
                  {resource.sub_title}
                </p>
              )}
              <div className="flex gap-2 items-center">
                <Badge className="bg-[#1a2547] text-white hover:bg-[#1a2547] capitalize">
                  {resource.resource_type}
                </Badge>
                {resource.category?.name && (
                  <Badge
                    className="text-white hover:opacity-90"
                    style={{ backgroundColor: resource.category.color || '#6b7280' }}
                  >
                    {resource.category.name}
                  </Badge>
                )}
                {resource.is_featured && (
                  <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                    Featured
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {resource.description && (
            <div
              className="mb-6 prose prose-sm max-w-none text-gray-700"
              dangerouslySetInnerHTML={{ __html: resource.description }}
            />
          )}

          {/* Key Points */}
          {resource.key_points && resource.key_points.length > 0 && (
            <div className="mb-6 bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Points:</h3>
              <div className="space-y-3">
                {resource.key_points.map((point: string, index: number) => {
                  // Check if the point starts with a timestamp (e.g., "1:46 - Text" or "16:04 - Text")
                  const timestampMatch = point.match(/^(\d+:\d+)\s*-\s*(.+)/)

                  if (timestampMatch) {
                    const [, timestamp, text] = timestampMatch
                    return (
                      <div key={index} className="flex gap-3">
                        <span className="text-[#dd1969] font-semibold shrink-0">{timestamp}</span>
                        <span className="text-gray-700">{text}</span>
                      </div>
                    )
                  }

                  // Regular bullet point if no timestamp
                  return (
                    <div key={index} className="flex gap-3">
                      <span className="text-gray-700">• {point}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* File URL Link (for PDFs, Documents, Articles, Blogs, Infographics) */}
          {resource.file_url && ['pdf', 'document', 'article', 'blog', 'infographic'].includes(resource.resource_type) && (
            <div className="mt-6">
              <a
                href={resource.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block"
                download={['document', 'pdf', 'infographic'].includes(resource.resource_type)}
              >
                <Button className="bg-[#dd1969] hover:bg-[#c01559]">
                  {resource.resource_type === 'pdf' && 'Download PDF'}
                  {resource.resource_type === 'document' && 'Download Document'}
                  {resource.resource_type === 'infographic' && 'Download Infographic'}
                  {resource.resource_type === 'article' && 'Read Full Article'}
                  {resource.resource_type === 'blog' && 'Read Blog Post'}
                </Button>
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Recommended Section */}
      {recommendedResources && recommendedResources.length > 0 && (
        <div className="px-4 md:px-8 pb-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-6">Recommended</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {recommendedResources.map((rec) => (
                <div
                  key={rec.id}
                  className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow"
                >
                  <Link href={`/dashboard/resources/${rec.slug}`}>
                    <div className="relative aspect-video bg-gray-200">
                      {rec.thumbnail_url && (
                        <Image
                          src={rec.thumbnail_url}
                          alt={rec.title}
                          fill
                          className="object-cover"
                        />
                      )}
                    </div>
                  </Link>
                  <div className="p-4">
                    <div className="flex justify-center mb-3">
                      <Badge className="bg-[#1a2547] text-white capitalize px-3 py-1 text-xs font-semibold">
                        {rec.resource_type}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-3 line-clamp-2 min-h-[48px] text-center">
                      {rec.title}
                    </h3>
                    <Link href={`/dashboard/resources/${rec.slug}`}>
                      <Button className="w-full bg-[#dd1969] hover:bg-[#c01559] text-white font-semibold rounded-full">
                        {rec.resource_type === 'podcast' && 'Listen Now'}
                        {rec.resource_type === 'video' && 'Watch Now'}
                        {rec.resource_type === 'webinar' && 'Watch Webinar'}
                        {rec.resource_type === 'document' && 'View Document'}
                        {rec.resource_type === 'blog' && 'Read Blog'}
                        {rec.resource_type === 'infographic' && 'View Infographic'}
                        {(rec.resource_type === 'pdf' || rec.resource_type === 'article') && 'Learn More'}
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
