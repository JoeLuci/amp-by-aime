#!/usr/bin/env node

/**
 * Bubble to Supabase Migration Script
 *
 * This script pulls all data from Bubble.io API and migrates it to Supabase.
 * It handles pagination, data transformation, and relationships.
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');

// Configuration
const BUBBLE_API_URL = 'https://app.brokersarebest.com/api/1.1/obj';
const BUBBLE_API_TOKEN = '9fc78905aa3695360c3afcbaf1f7a4db';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrinrobepqsofuhjnxcp.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DOWNLOAD_IMAGES = process.env.DOWNLOAD_IMAGES !== 'false'; // Set to false to skip image download

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.log('\nGet your service role key from:');
  console.log('https://supabase.com/dashboard/project/jrinrobepqsofuhjnxcp/settings/api');
  console.log('\nThen run:');
  console.log('SUPABASE_SERVICE_ROLE_KEY=your_key_here node scripts/migrate-from-bubble.js');
  process.exit(1);
}

// Image download cache to avoid duplicates
const imageCache = new Map();

// Rate limiting helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ID mapping: Bubble ID -> Supabase UUID
// Clear these at the start of each run
let idMappings = {
  categories: new Map(),
  tags: new Map(),
  users: new Map(),
  resources: new Map(),
  lenders: new Map(),
  vendors: new Map(),
  events: new Map(),
  notifications: new Map()
};

// Generate UUID v4
function generateUUID() {
  return crypto.randomUUID();
}

// Get or create UUID mapping for a Bubble ID
function getOrCreateUUID(table, bubbleId) {
  if (!bubbleId) return null;

  if (!idMappings[table].has(bubbleId)) {
    idMappings[table].set(bubbleId, generateUUID());
  }

  return idMappings[table].get(bubbleId);
}

// Utility: Make HTTP(S) request
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Utility: Download binary file
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    if (!url || url === 'null' || url === 'undefined') {
      return resolve(null);
    }

    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, (res) => {
      if (res.statusCode !== 200) {
        return resolve(null);
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

// Upload image to Supabase Storage
async function uploadImageToSupabase(imageUrl, bucket = 'resources') {
  if (!imageUrl || !DOWNLOAD_IMAGES) return imageUrl;

  // Check cache
  if (imageCache.has(imageUrl)) {
    return imageCache.get(imageUrl);
  }

  try {
    // Clean up Bubble URL
    let cleanUrl = imageUrl;
    if (imageUrl.startsWith('//')) {
      cleanUrl = 'https:' + imageUrl;
    }

    console.log(`   📥 Downloading image: ${cleanUrl.substring(0, 60)}...`);

    // Download image
    const imageBuffer = await downloadFile(cleanUrl);
    if (!imageBuffer) {
      console.log(`   ⚠️  Failed to download image, keeping original URL`);
      return imageUrl;
    }

    // Generate unique filename
    const ext = cleanUrl.split('.').pop().split('?')[0] || 'jpg';
    const hash = crypto.createHash('md5').update(cleanUrl).digest('hex');
    const filename = `${hash}.${ext}`;
    const storagePath = `${bucket}/${filename}`;

    // Rate limit: wait 100ms between uploads to avoid throttling
    await sleep(100);

    // Upload to Supabase Storage
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${storagePath}`;
    const response = await makeRequest(uploadUrl, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/octet-stream',
        'x-upsert': 'true'
      },
      body: imageBuffer
    });

    if (response.statusCode >= 200 && response.statusCode < 300) {
      const supabaseUrl = `${SUPABASE_URL}/storage/v1/object/public/${storagePath}`;
      imageCache.set(imageUrl, supabaseUrl);
      console.log(`   ✅ Uploaded to: ${supabaseUrl}`);
      return supabaseUrl;
    } else if (response.statusCode === 429) {
      console.log(`   ⚠️  Rate limited, waiting 2s and retrying...`);
      await sleep(2000);
      // Retry once
      const retryResponse = await makeRequest(uploadUrl, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/octet-stream',
          'x-upsert': 'true'
        },
        body: imageBuffer
      });
      if (retryResponse.statusCode >= 200 && retryResponse.statusCode < 300) {
        const supabaseUrl = `${SUPABASE_URL}/storage/v1/object/public/${storagePath}`;
        imageCache.set(imageUrl, supabaseUrl);
        return supabaseUrl;
      } else {
        console.log(`   ⚠️  Upload failed after retry, keeping original URL`);
        return imageUrl;
      }
    } else {
      console.log(`   ⚠️  Upload failed, keeping original URL`);
      return imageUrl;
    }
  } catch (error) {
    console.log(`   ⚠️  Error processing image: ${error.message}`);
    return imageUrl;
  }
}

// Fetch all records from Bubble (handles pagination)
async function fetchAllFromBubble(tableName) {
  console.log(`\n📥 Fetching ${tableName} from Bubble...`);
  const allRecords = [];
  let cursor = 0;
  const limit = 100;

  while (true) {
    const url = `${BUBBLE_API_URL}/${tableName}?cursor=${cursor}&limit=${limit}`;
    const response = await makeRequest(url, {
      headers: { 'Authorization': `Bearer ${BUBBLE_API_TOKEN}` }
    });

    if (response.statusCode !== 200) {
      throw new Error(`Failed to fetch ${tableName}: ${JSON.stringify(response.data)}`);
    }

    const { results, remaining } = response.data.response;
    allRecords.push(...results);

    console.log(`   Fetched ${allRecords.length} records...`);

    if (remaining === 0 || results.length === 0) break;
    cursor += results.length;
  }

  console.log(`✅ Fetched ${allRecords.length} ${tableName} records`);
  return allRecords;
}

// Insert data into Supabase (batch by batch to avoid payload limits)
async function insertIntoSupabase(table, records) {
  if (!records || records.length === 0) {
    console.log(`⏭️  Skipping ${table} (no records)`);
    return;
  }

  console.log(`\n📤 Inserting ${records.length} records into ${table}...`);

  const BATCH_SIZE = 50;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const url = `${SUPABASE_URL}/rest/v1/${table}`;

    // Rate limit: wait 200ms between batches
    if (i > 0) await sleep(200);

    const response = await makeRequest(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates,return=minimal'
      },
      body: JSON.stringify(batch)
    });

    if (response.statusCode >= 200 && response.statusCode < 300) {
      successCount += batch.length;
      console.log(`   ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} records inserted`);
    } else if (response.statusCode === 409) {
      console.log(`   ⚠️  Batch ${Math.floor(i / BATCH_SIZE) + 1}: Duplicates ignored`);
      console.log(`   Error details:`, response.data);
    } else {
      errorCount += batch.length;
      console.error(`   ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, response.data);
      console.error(`   First record in failed batch:`, JSON.stringify(batch[0], null, 2));
    }
  }

  console.log(`✅ ${table}: ${successCount} inserted, ${errorCount} errors`);
}

// Transform Bubble user role to Supabase enum
// Bubble values: Admin, User
// Supabase values: Loan Officer, Broker Owner, Loan Officer Assistant, Processor, Partner Lender, Partner Vendor
function mapUserRole(bubbleRole) {
  const roleMap = {
    'Admin': 'Loan Officer',
    'User': 'Loan Officer',
    'Loan Officer': 'Loan Officer',
    'Broker Owner': 'Broker Owner',
    'Loan Officer Assistant': 'Loan Officer Assistant',
    'Processor': 'Processor',
    'Partner Lender': 'Partner Lender',
    'Partner Vendor': 'Partner Vendor',
    'Partner Vendor/Vendor member': 'Partner Vendor'
  };
  return roleMap[bubbleRole] || 'Loan Officer';
}

// Transform Bubble subscription tier to Supabase enum
// Bubble values: Elite, VIP, Premium, Premium Guest
// Supabase values: None, Premium Guest, Premium, Elite, VIP, Premium Processor, Elite Processor, VIP Processor
function mapPlanTier(bubbleType) {
  const tierMap = {
    'None': 'None',
    'Premium Guest': 'Premium Guest',
    'Premium': 'Premium',
    'Elite': 'Elite',
    'VIP': 'VIP',
    'Processor': 'Premium Processor',
    'Premium Processor': 'Premium Processor',
    'Elite Processor': 'Elite Processor',
    'VIP Processor': 'VIP Processor'
  };
  return tierMap[bubbleType] || 'None';
}

// Transform Bubble resource type to Supabase enum
function mapResourceType(bubbleData) {
  // Infer from category or hyperlink
  if (bubbleData.resourceHyperLink?.includes('youtube')) return 'video';
  if (bubbleData.resourceHyperLink?.includes('.pdf')) return 'pdf';
  return 'article'; // default
}

// Slug tracking to ensure uniqueness across each table
const slugCounters = {
  categories: {},
  tags: {},
  resources: {},
  lenders: {},
  vendors: {}
};

// Utility: Generate unique slug from name
function generateSlug(name, table) {
  const baseSlug = name?.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled';

  if (!table || !slugCounters[table]) {
    return baseSlug;
  }

  // Track slug usage
  if (!slugCounters[table][baseSlug]) {
    slugCounters[table][baseSlug] = 0;
  }

  slugCounters[table][baseSlug]++;

  // If this is the first use, return as-is
  if (slugCounters[table][baseSlug] === 1) {
    return baseSlug;
  }

  // Otherwise append counter
  return `${baseSlug}-${slugCounters[table][baseSlug]}`;
}

// Data Transformers
const transformers = {
  // Categories (do first - needed for relationships)
  categories: (bubbleRecords) => {
    return bubbleRecords.map(record => {
      const uuid = getOrCreateUUID('categories', record._id);
      return {
        id: uuid,
        name: record.categoryName,
        slug: generateSlug(record.categoryName, 'categories'),
        description: null,
        icon: null,
        display_order: 0,
        is_active: true,
        created_at: record['Created Date'],
        updated_at: record['Modified Date']
      };
    });
  },

  // Tags (do second - needed for relationships)
  tags: (bubbleRecords) => {
    return bubbleRecords.map(record => {
      const uuid = getOrCreateUUID('tags', record._id);
      return {
        id: uuid,
        name: record.tagName,
        slug: generateSlug(record.tagName, 'tags'),
        color: null,
        created_at: record['Created Date']
      };
    });
  },

  // Users/Profiles (do early - needed for relationships)
  users: (bubbleRecords) => {
    return bubbleRecords.map(record => {
      const uuid = getOrCreateUUID('users', record._id);
      const firstName = record['first name'] || null;
      const lastName = record['last name'] || null;
      const fullName = `${firstName || ''} ${lastName || ''}`.trim() || null;

      return {
        id: uuid,
        email: record.authentication?.email?.email || `user-${uuid}@placeholder.com`,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        role: mapUserRole(record.userType),
        plan_tier: mapPlanTier(record.subscriptionType),
        stripe_customer_id: record.subscriptionID || null,
        stripe_subscription_id: record.subscriptionItemID || null,
        subscription_status: record.subscriptionStatus || 'inactive',
        stripe_subscription_status: record.subscriptionStatus || 'inactive',
        profile_complete: record.userProfileCompleted || false,
        is_admin: record.userType === 'Admin',
        created_at: record['Created Date'] || new Date().toISOString(),
        updated_at: record['Modified Date'] || new Date().toISOString()
      };
    });
  },

  // Resources
  resources: async (bubbleRecords) => {
    const transformed = [];
    for (const record of bubbleRecords) {
      // Try featured image first, then fall back to first banner image
      const imageUrl = record.resourceFeaturedImage ||
                      (record['resourceBannerImage(List)'] && record['resourceBannerImage(List)'][0]) ||
                      record.resourceBannerImage ||
                      null;
      const thumbnail = await uploadImageToSupabase(imageUrl, 'thumbnails');
      const resourceType = mapResourceType(record);
      const uuid = getOrCreateUUID('resources', record._id);
      const categoryUuid = getOrCreateUUID('categories', record.category);

      transformed.push({
        id: uuid,
        title: record.resourceTitle || 'Untitled',
        slug: generateSlug(record.resourceTitle || 'untitled', 'resources'),
        sub_title: record.subTitle || null,
        description: record.resourceDescription || null,
        content: null,
        resource_type: resourceType,
        thumbnail_url: thumbnail || null,
        file_url: resourceType === 'pdf' ? (record.resourceHyperLink || null) : null,
        video_url: resourceType === 'video' ? (record.resourceHyperLink || null) : null,
        category_id: categoryUuid || null,
        is_featured: record.featured || false,
        is_published: true,
        views_count: 0,
        published_at: record['Created Date'] || new Date().toISOString(),
        created_at: record['Created Date'] || new Date().toISOString(),
        updated_at: record['Modified Date'] || new Date().toISOString()
      });
    }
    return transformed;
  },

  // Lenders
  lenders: async (bubbleRecords) => {
    const transformed = [];
    for (const record of bubbleRecords) {
      const logo = await uploadImageToSupabase(record.partnerLogo || null, 'lender-logos');
      const uuid = getOrCreateUUID('lenders', record._id);

      transformed.push({
        id: uuid,
        name: record.partnerTitle || 'Unnamed Lender',
        slug: generateSlug(record.partnerTitle || 'unnamed-lender', 'lenders'),
        description: record.partnerDescription || null,
        logo_url: logo || null,
        lender_type: record.partnerType || null,
        is_featured: record.featured || false,
        is_active: true,
        display_order: record.typeNumber || 0,
        created_at: record['Created Date'] || new Date().toISOString(),
        updated_at: record['Modified Date'] || new Date().toISOString()
      });
    }
    return transformed;
  },

  // Markets (Vendors)
  vendors: async (bubbleRecords) => {
    const transformed = [];
    for (const record of bubbleRecords) {
      const logo = await uploadImageToSupabase(record.marketLogo || null, 'vendor-logos');
      const uuid = getOrCreateUUID('vendors', record._id);

      transformed.push({
        id: uuid,
        name: record.marketName || 'Unnamed Vendor',
        slug: generateSlug(record.marketName || 'unnamed-vendor', 'vendors'),
        description: record.marketDescription || null,
        logo_url: logo || null,
        vendor_category: record.marketType || null,
        website_url: record.signUpLInk || null,
        is_core_partner: record.coreVendorPartner === 'Yes',
        is_affiliate: record.marketUserType === 'Affiliates',
        is_active: true,
        created_at: record['Created Date'] || new Date().toISOString(),
        updated_at: record['Modified Date'] || new Date().toISOString()
      });
    }
    return transformed;
  },

  // Events
  events: async (bubbleRecords) => {
    const transformed = [];
    const validEvents = bubbleRecords.filter(r => r.eventTitle && r.eventStartDate && r.eventEndDate);
    for (const record of validEvents) {
      const thumbnail = await uploadImageToSupabase(record.eventImage || null, 'thumbnails');
      const uuid = getOrCreateUUID('events', record._id);

      transformed.push({
        id: uuid,
        title: record.eventTitle,
        description: record.eventDescription || null,
        event_type: 'webinar',
        start_date: record.eventStartDate,
        end_date: record.eventEndDate,
        location: record.eventLocation || null,
        is_virtual: true,
        registration_url: record.eventRegistrationLink || null,
        thumbnail_url: thumbnail || null,
        is_featured: false,
        is_published: true,
        created_at: record['Created Date'] || new Date().toISOString(),
        updated_at: record['Modified Date'] || new Date().toISOString()
      });
    }
    return transformed;
  },

  // Notifications
  notifications: (bubbleRecords) => {
    return bubbleRecords
      .filter(r => r.notificationMessage) // Only valid notifications
      .map(record => {
        const uuid = getOrCreateUUID('notifications', record._id);
        return {
          id: uuid,
          title: record.notificationTitle || 'Notification',
          message: record.notificationMessage,
          type: 'info',
          created_at: record['Created Date']
        };
      });
  }
};

// Main migration flow
async function migrate() {
  console.log('🚀 Starting Bubble → Supabase Migration\n');
  console.log('═══════════════════════════════════════\n');

  // Clear ID mappings and slug counters from any previous runs
  idMappings = {
    categories: new Map(),
    tags: new Map(),
    users: new Map(),
    resources: new Map(),
    lenders: new Map(),
    vendors: new Map(),
    events: new Map(),
    notifications: new Map()
  };

  // Reset slug counters
  slugCounters.categories = {};
  slugCounters.tags = {};
  slugCounters.resources = {};
  slugCounters.lenders = {};
  slugCounters.vendors = {};

  imageCache.clear();

  try {
    // Step 1: Fetch all data from Bubble
    console.log('📦 STEP 1: Fetching data from Bubble...\n');
    console.log('⚠️  Skipping user data (will migrate at go-live)\n');

    const bubbleData = {
      category: await fetchAllFromBubble('category'),
      tag: await fetchAllFromBubble('tag'),
      // user: await fetchAllFromBubble('user'), // Skip users until go-live
      resources: await fetchAllFromBubble('resources'),
      lender: await fetchAllFromBubble('lender'),
      market: await fetchAllFromBubble('market'),
      event: await fetchAllFromBubble('event'),
      // notification: await fetchAllFromBubble('notification'), // Skip notifications (user-specific)
    };

    console.log('\n═══════════════════════════════════════\n');
    console.log('🔄 STEP 2: Transforming data & downloading images...\n');

    if (!DOWNLOAD_IMAGES) {
      console.log('⚠️  Image download disabled (DOWNLOAD_IMAGES=false)\n');
    }

    // Step 2: Transform data (now async to handle image downloads)
    const transformedData = {
      categories: transformers.categories(bubbleData.category),
      tags: transformers.tags(bubbleData.tag),
      // profiles: transformers.users(bubbleData.user), // Skip users
      resources: await transformers.resources(bubbleData.resources),
      lenders: await transformers.lenders(bubbleData.lender),
      vendors: await transformers.vendors(bubbleData.market),
      events: await transformers.events(bubbleData.event),
      // notifications: transformers.notifications(bubbleData.notification), // Skip notifications
    };

    console.log('\n✅ Data transformation complete\n');
    console.log('═══════════════════════════════════════\n');
    console.log('💾 STEP 3: Inserting into Supabase...\n');

    // Step 3: Insert in order (respecting foreign keys)
    await insertIntoSupabase('categories', transformedData.categories);
    await insertIntoSupabase('tags', transformedData.tags);
    // await insertIntoSupabase('profiles', transformedData.profiles); // Skip users
    await insertIntoSupabase('resources', transformedData.resources);
    await insertIntoSupabase('lenders', transformedData.lenders);
    await insertIntoSupabase('vendors', transformedData.vendors);
    await insertIntoSupabase('events', transformedData.events);
    // await insertIntoSupabase('notifications', transformedData.notifications); // Skip notifications

    console.log('\n═══════════════════════════════════════\n');
    console.log('✨ Migration Complete!\n');
    console.log('Summary:');
    console.log(`  - ${transformedData.categories.length} categories`);
    console.log(`  - ${transformedData.tags.length} tags`);
    console.log(`  - ${transformedData.resources.length} resources`);
    console.log(`  - ${transformedData.lenders.length} lenders`);
    console.log(`  - ${transformedData.vendors.length} vendors`);
    console.log(`  - ${transformedData.events.length} events`);
    console.log('\n⚠️  User profiles and notifications will be migrated at go-live');
    console.log('\n═══════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration
migrate();
