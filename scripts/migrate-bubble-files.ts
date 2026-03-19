/**
 * Migrate files from Bubble.io CDN to Supabase Storage
 *
 * Run with: npx ts-node --esm scripts/migrate-bubble-files.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local manually
const envPath = resolve(process.cwd(), '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=')
  if (key && valueParts.length > 0) {
    let value = valueParts.join('=').trim()
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key.trim()] = value
  }
})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

interface MigrationRecord {
  table: string
  id_column: string
  url_column: string
  storage_bucket: string
  storage_folder: string
}

const MIGRATIONS: MigrationRecord[] = [
  // Vendor resources already migrated - commenting out
  // {
  //   table: 'vendor_resources',
  //   id_column: 'id',
  //   url_column: 'file_url',
  //   storage_bucket: 'videos',
  //   storage_folder: 'vendor-resources'
  // },
  // {
  //   table: 'vendor_resources',
  //   id_column: 'id',
  //   url_column: 'thumbnail_url',
  //   storage_bucket: 'thumbnails',
  //   storage_folder: 'vendor-resources'
  // },
  {
    table: 'profiles',
    id_column: 'id',
    url_column: 'avatar_url',
    storage_bucket: 'avatars',
    storage_folder: ''
  }
]

async function downloadFile(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    // Fix protocol-relative URLs
    let fixedUrl = url
    if (url.startsWith('//')) {
      fixedUrl = 'https:' + url
    }
    const response = await fetch(fixedUrl)
    if (!response.ok) {
      console.error(`Failed to download: ${url} - ${response.status}`)
      return null
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    return { buffer, contentType }
  } catch (error) {
    console.error(`Error downloading ${url}:`, error)
    return null
  }
}

function getFileExtension(url: string, contentType: string): string {
  // Fix protocol-relative URLs
  let fixedUrl = url
  if (url.startsWith('//')) {
    fixedUrl = 'https:' + url
  }
  // Try to get extension from URL
  const urlPath = new URL(fixedUrl).pathname
  const urlExt = urlPath.split('.').pop()?.toLowerCase()
  if (urlExt && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'pdf', 'doc', 'docx'].includes(urlExt)) {
    return urlExt
  }

  // Fall back to content type
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'application/pdf': 'pdf',
  }
  return mimeToExt[contentType] || 'bin'
}

function getBucketForContentType(contentType: string, defaultBucket: string): string {
  if (contentType.startsWith('video/')) return 'videos'
  if (contentType === 'application/pdf') return 'pdfs'
  if (contentType.startsWith('image/')) return defaultBucket // thumbnails or avatars
  return defaultBucket
}

async function uploadToSupabase(
  bucket: string,
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string | null> {
  // Route to correct bucket based on content type
  const actualBucket = getBucketForContentType(contentType, bucket)

  const { data, error } = await supabase.storage
    .from(actualBucket)
    .upload(path, buffer, {
      contentType,
      upsert: true
    })

  if (error) {
    console.error(`Upload error for ${actualBucket}/${path}:`, error)
    return null
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from(actualBucket)
    .getPublicUrl(path)

  return publicUrl
}

async function ensureBucketExists(bucket: string) {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some(b => b.name === bucket)

  if (!exists) {
    const { error } = await supabase.storage.createBucket(bucket, {
      public: true
    })
    if (error && !error.message.includes('already exists')) {
      console.error(`Failed to create bucket ${bucket}:`, error)
    } else {
      console.log(`Created bucket: ${bucket}`)
    }
  }
}

async function migrateTable(config: MigrationRecord) {
  console.log(`\n--- Migrating ${config.table}.${config.url_column} ---`)

  // Ensure bucket exists
  await ensureBucketExists(config.storage_bucket)

  // Fetch records with bubble.io URLs
  const { data: records, error } = await supabase
    .from(config.table)
    .select(`${config.id_column}, ${config.url_column}`)
    .like(config.url_column, '%bubble.io%')

  if (error) {
    console.error(`Error fetching ${config.table}:`, error)
    return
  }

  console.log(`Found ${records?.length || 0} records to migrate`)

  let success = 0
  let failed = 0

  for (const record of (records || []) as unknown as Record<string, string>[]) {
    const oldUrl = record[config.url_column]
    if (!oldUrl) continue

    // Download file
    const file = await downloadFile(oldUrl)
    if (!file) {
      failed++
      continue
    }

    // Generate new path
    const ext = getFileExtension(oldUrl, file.contentType)
    const folder = config.storage_folder ? `${config.storage_folder}/` : ''
    const newPath = `${folder}${record[config.id_column]}.${ext}`

    // Upload to Supabase
    const newUrl = await uploadToSupabase(
      config.storage_bucket,
      newPath,
      file.buffer,
      file.contentType
    )

    if (!newUrl) {
      failed++
      continue
    }

    // Update database record
    const { error: updateError } = await supabase
      .from(config.table)
      .update({ [config.url_column]: newUrl })
      .eq(config.id_column, record[config.id_column])

    if (updateError) {
      console.error(`Failed to update ${config.table} ${record[config.id_column]}:`, updateError)
      failed++
    } else {
      success++
      console.log(`Migrated: ${record[config.id_column]}`)
    }
  }

  console.log(`Completed ${config.table}.${config.url_column}: ${success} success, ${failed} failed`)
}

async function main() {
  console.log('Starting Bubble.io to Supabase migration...')
  console.log(`Supabase URL: ${SUPABASE_URL}`)

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  for (const config of MIGRATIONS) {
    await migrateTable(config)
  }

  console.log('\n=== Migration Complete ===')
}

main().catch(console.error)
