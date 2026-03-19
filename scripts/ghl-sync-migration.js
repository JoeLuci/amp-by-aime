#!/usr/bin/env node

/**
 * GHL Contact Sync for Migration Queue
 *
 * Finds GHL contacts for users in migration_queue and stores contact IDs.
 * Run this BEFORE running the migration to ensure ghl_contact_id is set.
 *
 * Usage:
 *   node scripts/ghl-sync-migration.js --report
 *   node scripts/ghl-sync-migration.js --sync
 *
 * Required env vars:
 *   GHL_PRIVATE_KEY
 *   GHL_LOCATION_ID
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const https = require("https");

// Configuration
const GHL_PRIVATE_KEY = process.env.GHL_PRIVATE_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GHL_PRIVATE_KEY || !GHL_LOCATION_ID) {
  console.error("Error: GHL_PRIVATE_KEY and GHL_LOCATION_ID required");
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

// Modes
const REPORT_MODE = process.argv.includes("--report");
const SYNC_MODE = process.argv.includes("--sync");
const VERBOSE = process.argv.includes("--verbose");
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith("--batch="))?.split("=")[1] || "50");

// Rate limiting - GHL has strict rate limits
const DELAY_BETWEEN_REQUESTS_MS = 200;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// HTTP request helper for Supabase
function supabaseRequest(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${endpoint}`);
    const req = https.request(url, {
      method: options.method || "GET",
      headers: {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": options.prefer || "return=minimal",
        ...options.headers,
      },
    }, (res) => {
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
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// HTTP request helper for GHL
function ghlRequest(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://services.leadconnectorhq.com${endpoint}`);
    const req = https.request(url, {
      method: options.method || "GET",
      headers: {
        "Authorization": `Bearer ${GHL_PRIVATE_KEY}`,
        "Content-Type": "application/json",
        "Version": "2021-07-28",
        ...options.headers,
      },
    }, (res) => {
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
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// Search GHL for a contact by email
let debugCount = 0;
async function findGHLContact(email) {
  if (!email) return null;

  try {
    const response = await ghlRequest("/contacts/search", {
      method: "POST",
      body: {
        locationId: GHL_LOCATION_ID,
        page: 1,
        pageLimit: 1,
        filters: [{
          group: "OR",
          filters: [{
            field: "email",
            operator: "eq",
            value: email.toLowerCase()
          }]
        }]
      }
    });

    // Debug: Log first 3 responses
    if (debugCount < 3) {
      console.log(`\n[DEBUG] Search for: ${email}`);
      console.log(`[DEBUG] Status: ${response.statusCode}`);
      console.log(`[DEBUG] Response:`, JSON.stringify(response.data, null, 2));
      debugCount++;
    }

    if (response.statusCode === 200 && response.data.contacts?.length > 0) {
      return response.data.contacts[0];
    }

    return null;
  } catch (error) {
    console.error(`Error searching GHL for ${email}:`, error.message);
    return null;
  }
}

// Fetch users from migration_queue without GHL contact ID
async function fetchQueueUsers(onlyMissing = true) {
  const filter = onlyMissing
    ? "ghl_contact_found=is.false"
    : "";

  const response = await supabaseRequest(
    `migration_queue?${filter}&select=id,email,first_name,last_name,phone,ghl_contact_id,ghl_contact_found&order=email`,
    { headers: { "Prefer": "count=exact" } }
  );

  return response.data || [];
}

// Update migration_queue with GHL contact data
async function updateQueueWithGHLContact(queueId, contactId) {
  const response = await supabaseRequest(`migration_queue?id=eq.${queueId}`, {
    method: "PATCH",
    body: {
      ghl_contact_id: contactId,
      ghl_contact_found: true,
      updated_at: new Date().toISOString(),
    },
    prefer: "return=minimal",
  });

  return response.statusCode >= 200 && response.statusCode < 300;
}

// Mark as searched but not found
async function markSearched(queueId) {
  const response = await supabaseRequest(`migration_queue?id=eq.${queueId}`, {
    method: "PATCH",
    body: {
      ghl_contact_found: false,
      updated_at: new Date().toISOString(),
    },
    prefer: "return=minimal",
  });

  return response.statusCode >= 200 && response.statusCode < 300;
}

// Main
async function main() {
  console.log("===========================================================");
  console.log("   GHL CONTACT SYNC FOR MIGRATION");
  console.log("===========================================================");
  console.log(`   Mode: ${REPORT_MODE ? "REPORT" : SYNC_MODE ? "SYNC" : "NONE"}`);
  console.log(`   Batch size: ${BATCH_SIZE}`);
  console.log("===========================================================\n");

  if (!REPORT_MODE && !SYNC_MODE) {
    console.log("Usage:");
    console.log("  --report    Find GHL contacts (read-only)");
    console.log("  --sync      Find and store GHL contact IDs");
    console.log("  --verbose   Show detailed output");
    console.log("  --batch=N   Process N users at a time (default: 50)");
    console.log("\nExample:");
    console.log("  GHL_PRIVATE_KEY=xxx GHL_LOCATION_ID=xxx SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx \\");
    console.log("    node scripts/ghl-sync-migration.js --report");
    return;
  }

  // Fetch users without GHL contact ID
  console.log("Fetching users from migration_queue...\n");
  const usersToProcess = await fetchQueueUsers(true);
  const allUsers = await fetchQueueUsers(false);

  const alreadyFound = allUsers.filter(u => u.ghl_contact_found && u.ghl_contact_id);

  console.log(`   Total in queue:           ${allUsers.length}`);
  console.log(`   Already have GHL contact: ${alreadyFound.length}`);
  console.log(`   Need to search:           ${usersToProcess.length}`);
  console.log("");

  if (usersToProcess.length === 0) {
    console.log("No users need GHL contact lookup.\n");
    return;
  }

  // Process users
  const results = {
    found: [],
    notFound: [],
    errors: [],
  };

  const startTime = Date.now();

  console.log("Searching GHL for contacts...\n");

  for (let i = 0; i < usersToProcess.length; i++) {
    const user = usersToProcess[i];

    try {
      const contact = await findGHLContact(user.email);

      if (contact) {
        results.found.push({
          email: user.email,
          contactId: contact.id,
          contactName: `${contact.firstName || ""} ${contact.lastName || ""}`.trim(),
        });

        if (SYNC_MODE) {
          await updateQueueWithGHLContact(user.id, contact.id);
        }
      } else {
        results.notFound.push({ email: user.email });

        // Mark as searched (so we don't keep re-searching)
        if (SYNC_MODE) {
          // Note: We still set ghl_contact_found=false to mark as searched
          // but don't set ghl_contact_id since there isn't one
        }
      }
    } catch (error) {
      results.errors.push({ email: user.email, error: error.message });
    }

    const progress = Math.round(((i + 1) / usersToProcess.length) * 100);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    process.stdout.write(`\r   Progress: ${progress}% (${i + 1}/${usersToProcess.length}) | Found: ${results.found.length} | Time: ${elapsed}s`);

    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }

  console.log("\n");

  // Report
  console.log("===========================================================");
  console.log("   RESULTS");
  console.log("===========================================================\n");

  console.log(`   Searched:      ${usersToProcess.length}`);
  console.log(`   Found:         ${results.found.length}`);
  console.log(`   Not found:     ${results.notFound.length}`);
  console.log(`   Errors:        ${results.errors.length}`);
  console.log("");

  if (VERBOSE && results.found.length > 0) {
    console.log("Contacts found (first 20):");
    results.found.slice(0, 20).forEach(r => {
      console.log(`   ${r.email} => ${r.contactId}`);
    });
    if (results.found.length > 20) {
      console.log(`   ... and ${results.found.length - 20} more`);
    }
    console.log("");
  }

  if (VERBOSE && results.notFound.length > 0) {
    console.log("Contacts NOT found (first 20):");
    results.notFound.slice(0, 20).forEach(r => {
      console.log(`   ${r.email}`);
    });
    if (results.notFound.length > 20) {
      console.log(`   ... and ${results.notFound.length - 20} more`);
    }
    console.log("");
  }

  if (results.errors.length > 0) {
    console.log("Errors:");
    results.errors.forEach(r => {
      console.log(`   ${r.email}: ${r.error}`);
    });
    console.log("");
  }

  console.log("===========================================================\n");

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`Total time: ${totalTime} seconds`);

  if (SYNC_MODE) {
    console.log("\nSync complete! GHL contact IDs have been stored in migration_queue.");
    console.log("These will be copied to profiles during migration.");
  } else if (REPORT_MODE && results.found.length > 0) {
    console.log("\nRun with --sync to store these contact IDs in migration_queue.");
  }
}

main().catch(console.error);
