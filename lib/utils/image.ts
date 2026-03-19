/**
 * Supabase Image Transformation Utility
 *
 * Automatically optimizes Supabase storage images by converting URLs
 * to use the render endpoint with size/quality transformations.
 */

interface ImageTransformOptions {
  width?: number
  height?: number
  quality?: number
  resize?: 'cover' | 'contain' | 'fill'
}

const DEFAULT_QUALITY = 80

/**
 * Transform a Supabase storage URL to use image transformation
 * Returns original URL if not a Supabase storage URL
 */
export function getOptimizedImageUrl(
  url: string | null | undefined,
  options: ImageTransformOptions = {}
): string {
  if (!url) return ''

  // Only transform Supabase storage URLs
  if (!url.includes('supabase.co/storage/v1/object/public/')) {
    return url
  }

  // Convert object URL to render URL
  const renderUrl = url.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/'
  )

  // Build transformation params
  const params = new URLSearchParams()

  if (options.width) {
    params.append('width', options.width.toString())
  }
  if (options.height) {
    params.append('height', options.height.toString())
  }
  if (options.resize) {
    params.append('resize', options.resize)
  }
  params.append('quality', (options.quality || DEFAULT_QUALITY).toString())

  return `${renderUrl}?${params.toString()}`
}

/**
 * Preset sizes for common use cases
 */
export const ImageSizes = {
  // Thumbnails in grids/lists
  thumbnail: { width: 200, height: 200, resize: 'contain' as const },

  // Card images (lenders/vendors grid)
  card: { width: 400, height: 300, resize: 'contain' as const },

  // Featured carousel
  featured: { width: 300, height: 300, resize: 'contain' as const },

  // Detail page hero/logo
  detail: { width: 600, height: 400, resize: 'contain' as const },

  // Full-size preview in modals
  preview: { width: 800, height: 600, resize: 'contain' as const },
}

/**
 * Helper to get optimized URL with preset size
 */
export function getImageUrl(
  url: string | null | undefined,
  preset: keyof typeof ImageSizes
): string {
  return getOptimizedImageUrl(url, ImageSizes[preset])
}
