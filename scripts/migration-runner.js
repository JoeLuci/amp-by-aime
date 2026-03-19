/**
 * User Migration Runner
 *
 * This script:
 * 1. STAGE: Loads Bubble users and inserts them into migration_queue (status=pending)
 * 2. RUN: Processes pending queue items by calling the migrate-user Edge Function
 *
 * Usage:
 *   # Stage all users (load into queue, no processing)
 *   node scripts/migration-runner.js --stage
 *
 *   # Run migration (process pending queue items)
 *   node scripts/migration-runner.js --run
 *
 *   # Run with dry-run (creates users/profiles but doesn't send emails)
 *   node scripts/migration-runner.js --run --dry-run
 *
 *   # Run specific batch size
 *   node scripts/migration-runner.js --run --batch=50
 *
 *   # Check status
 *   node scripts/migration-runner.js --status
 *
 * Required env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   BUBBLE_API_TOKEN (for staging)
 */

const https = require("https");
const http = require("http");

// Configuration
const BUBBLE_API_URL = "https://app.brokersarebest.com/api/1.1/obj";
const BUBBLE_API_TOKEN = process.env.BUBBLE_API_TOKEN || "9fc78905aa3695360c3afcbaf1f7a4db";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Rate limiting
const DELAY_BETWEEN_MIGRATIONS_MS = 500; // 2 per second
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith("--batch="))?.split("=")[1] || "100");

const DRY_RUN = process.argv.includes("--dry-run");
const STAGE_MODE = process.argv.includes("--stage");
const RUN_MODE = process.argv.includes("--run");
const STATUS_MODE = process.argv.includes("--status");

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  console.log("\nUsage:");
  console.log("  SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/migration-runner.js --stage");
  process.exit(1);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// HTTP request helper
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(url, options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Fetch all users from Bubble
async function fetchBubbleUsers() {
  console.log("\nFetching users from Bubble...\n");
  const allUsers = [];
  let cursor = 0;
  const limit = 100;

  while (true) {
    const url = `${BUBBLE_API_URL}/user?cursor=${cursor}&limit=${limit}`;
    const response = await makeRequest(url, {
      headers: { "Authorization": `Bearer ${BUBBLE_API_TOKEN}` }
    });

    if (response.statusCode !== 200) {
      throw new Error(`Bubble API error: ${JSON.stringify(response.data)}`);
    }

    const { results, remaining } = response.data.response;
    allUsers.push(...results);

    process.stdout.write(`\r   Fetched ${allUsers.length} users...`);

    if (remaining === 0 || results.length === 0) break;
    cursor += results.length;
    await sleep(200); // Rate limit Bubble API
  }

  console.log(`\n\n   Total: ${allUsers.length} users\n`);
  return allUsers;
}

// Insert users into migration queue
async function stageUsers(users) {
  console.log("Staging users into migration_queue...\n");

  const queueItems = users.map(user => {
    const email = user.authentication?.email?.email;
    if (!email) return null;

    return {
      bubble_user_id: user._id,
      email: email,
      first_name: user["first name"] || null,
      last_name: user["last name"] || null,
      phone: user.phoneNumber || user["mobileNumber(User)"] || null,
      user_role: user.userRole || null,
      subscription_type: user.subscriptionType || null,
      stripe_customer_id: user.StripeCustomerID || user.customerID || null,
      bubble_data: user,
      status: "pending",
    };
  }).filter(Boolean);

  console.log(`   Valid users with email: ${queueItems.length}`);
  console.log(`   Skipped (no email): ${users.length - queueItems.length}\n`);

  // Insert in batches
  const BATCH = 50;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < queueItems.length; i += BATCH) {
    const batch = queueItems.slice(i, i + BATCH);

    const response = await makeRequest(`${SUPABASE_URL}/rest/v1/migration_queue`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    });

    if (response.statusCode >= 200 && response.statusCode < 300) {
      inserted += batch.length;
    } else if (response.statusCode === 409) {
      skipped += batch.length;
    } else {
      console.error(`   Batch error:`, response.data);
    }

    process.stdout.write(`\r   Progress: ${i + batch.length}/${queueItems.length}`);
    await sleep(100);
  }

  console.log(`\n\n   Inserted: ${inserted}`);
  console.log(`   Skipped (duplicates): ${skipped}\n`);
}

// Get migration status
async function getStatus() {
  const response = await makeRequest(
    `${SUPABASE_URL}/rest/v1/migration_queue?select=status,count`,
    {
      method: "GET",
      headers: {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    }
  );

  // Get counts by status
  const statsResponse = await makeRequest(
    `${SUPABASE_URL}/rest/v1/rpc/migration_status_counts`,
    {
      method: "POST",
      headers: {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    }
  );

  // Fallback: direct query
  const pendingRes = await makeRequest(
    `${SUPABASE_URL}/rest/v1/migration_queue?status=eq.pending&select=id`,
    {
      headers: {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Prefer": "count=exact",
      },
    }
  );

  const completedRes = await makeRequest(
    `${SUPABASE_URL}/rest/v1/migration_queue?status=eq.completed&select=id`,
    {
      headers: {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Prefer": "count=exact",
      },
    }
  );

  const failedRes = await makeRequest(
    `${SUPABASE_URL}/rest/v1/migration_queue?status=eq.failed&select=id`,
    {
      headers: {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Prefer": "count=exact",
      },
    }
  );

  const processingRes = await makeRequest(
    `${SUPABASE_URL}/rest/v1/migration_queue?status=eq.processing&select=id`,
    {
      headers: {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Prefer": "count=exact",
      },
    }
  );

  console.log("\n===========================================================");
  console.log("   MIGRATION STATUS");
  console.log("===========================================================\n");
  console.log(`   Pending:    ${pendingRes.data?.length || 0}`);
  console.log(`   Processing: ${processingRes.data?.length || 0}`);
  console.log(`   Completed:  ${completedRes.data?.length || 0}`);
  console.log(`   Failed:     ${failedRes.data?.length || 0}`);
  console.log("\n===========================================================\n");

  // Show recent failures
  if (failedRes.data?.length > 0) {
    const failedDetails = await makeRequest(
      `${SUPABASE_URL}/rest/v1/migration_queue?status=eq.failed&select=email,error_step,error_message&limit=5`,
      {
        headers: {
          "apikey": SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    );

    if (failedDetails.data?.length > 0) {
      console.log("Recent failures:");
      failedDetails.data.forEach(f => {
        console.log(`   ${f.email}: ${f.error_step} - ${f.error_message}`);
      });
      console.log("");
    }
  }
}

// Process pending queue items
async function runMigration() {
  console.log("\n===========================================================");
  console.log("   RUNNING MIGRATION");
  console.log("===========================================================");
  console.log(`   Batch size: ${BATCH_SIZE}`);
  console.log(`   Dry run: ${DRY_RUN}`);
  console.log(`   Delay: ${DELAY_BETWEEN_MIGRATIONS_MS}ms\n`);

  // Fetch pending items
  const response = await makeRequest(
    `${SUPABASE_URL}/rest/v1/migration_queue?status=eq.pending&select=id,email&limit=${BATCH_SIZE}`,
    {
      headers: {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    }
  );

  const pendingItems = response.data || [];
  console.log(`   Found ${pendingItems.length} pending items\n`);

  if (pendingItems.length === 0) {
    console.log("   No pending items to process.\n");
    return;
  }

  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < pendingItems.length; i++) {
    const item = pendingItems[i];

    // Call the Edge Function
    const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/migrate-user`;
    const result = await makeRequest(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        queue_id: item.id,
        dry_run: DRY_RUN,
      }),
    });

    if (result.statusCode === 200 && result.data?.success) {
      successCount++;
    } else {
      failCount++;
      console.log(`\n   Failed: ${item.email} - ${result.data?.error || "Unknown error"}`);
    }

    const progress = Math.round(((i + 1) / pendingItems.length) * 100);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    process.stdout.write(`\r   Progress: ${progress}% | Success: ${successCount} | Failed: ${failCount} | Time: ${elapsed}s`);

    await sleep(DELAY_BETWEEN_MIGRATIONS_MS);
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  console.log("\n\n===========================================================");
  console.log("   MIGRATION BATCH COMPLETE");
  console.log("===========================================================");
  console.log(`   Processed: ${pendingItems.length}`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Failed: ${failCount}`);
  console.log(`   Time: ${totalTime} seconds`);
  console.log("===========================================================\n");

  // Show updated status
  await getStatus();
}

// Main
async function main() {
  console.log("===========================================================");
  console.log("   USER MIGRATION RUNNER");
  console.log("===========================================================\n");

  if (STATUS_MODE) {
    await getStatus();
  } else if (STAGE_MODE) {
    console.log("MODE: STAGE (load Bubble users into queue)\n");
    const users = await fetchBubbleUsers();
    await stageUsers(users);
    console.log("Staging complete! Run with --run to process migrations.\n");
  } else if (RUN_MODE) {
    console.log("MODE: RUN (process pending queue items)\n");
    await runMigration();
  } else {
    console.log("Usage:");
    console.log("  --stage     Load Bubble users into migration_queue");
    console.log("  --run       Process pending migrations");
    console.log("  --status    Show migration status");
    console.log("  --dry-run   Don't send emails (use with --run)");
    console.log("  --batch=N   Process N items per run (default: 100)");
    console.log("\nExample:");
    console.log("  node scripts/migration-runner.js --stage");
    console.log("  node scripts/migration-runner.js --run --dry-run");
    console.log("  node scripts/migration-runner.js --run --batch=50");
  }
}

main().catch(console.error);
