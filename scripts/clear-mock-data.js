#!/usr/bin/env node

/**
 * Clear all mock/placeholder data from Supabase
 */

const https = require('https');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrinrobepqsofuhjnxcp.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: data ? JSON.parse(data) : null });
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

async function deleteAllFromTable(table) {
  console.log(`🗑️  Clearing ${table}...`);

  // Get count first
  const countUrl = `${SUPABASE_URL}/rest/v1/${table}?select=count`;
  const countResponse = await makeRequest(countUrl, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'count=exact'
    }
  });

  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const response = await makeRequest(url, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=minimal'
    }
  });

  if (response.statusCode >= 200 && response.statusCode < 300) {
    console.log(`✅ Cleared ${table}`);
  } else {
    console.error(`❌ Failed to clear ${table}:`, response.data);
  }
}

async function main() {
  console.log('🚀 Clearing all mock data from Supabase\n');
  console.log('═══════════════════════════════════════\n');

  // Delete in reverse order to respect foreign keys
  await deleteAllFromTable('resources');
  await deleteAllFromTable('events');
  await deleteAllFromTable('vendors');
  await deleteAllFromTable('lenders');
  await deleteAllFromTable('tags');
  await deleteAllFromTable('categories');

  console.log('\n═══════════════════════════════════════');
  console.log('✨ Mock data cleared! Ready for migration.\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
