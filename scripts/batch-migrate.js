#!/usr/bin/env node

const SUPABASE_URL = "https://jrinrobepqsofuhjnxcp.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyaW5yb2JlcHFzb2Z1aGpueGNwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTc4MzE3OCwiZXhwIjoyMDc3MzU5MTc4fQ.smHhYNpqZ4rj3BRF3O8gbUFnryDJ9LUUKIMb86HFlHA";

const CONCURRENCY = 3; // Safe for rate limits
const DELAY_BETWEEN_BATCHES = 1000; // 1 second between batches

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPendingQueue() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/migration_queue?status=eq.pending&select=id,email&order=created_at.asc`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    }
  );
  return response.json();
}

async function migrateUser(queueId) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/migrate-user`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ queue_id: queueId }),
  });
  return response.json();
}

async function processBatch(batch, batchNum, totalBatches) {
  const results = await Promise.all(
    batch.map(async (item) => {
      try {
        const result = await migrateUser(item.id);
        if (result.success) {
          return { email: item.email, status: "success" };
        } else {
          return { email: item.email, status: "failed", error: result.error };
        }
      } catch (err) {
        return { email: item.email, status: "error", error: err.message };
      }
    })
  );
  return results;
}

async function main() {
  console.log("Fetching pending migrations...");
  const queue = await fetchPendingQueue();
  const total = queue.length;
  console.log(`Found ${total} pending users\n`);

  if (total === 0) {
    console.log("No pending migrations!");
    return;
  }

  let success = 0;
  let failed = 0;
  let processed = 0;

  // Split into batches
  const batches = [];
  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    batches.push(queue.slice(i, i + CONCURRENCY));
  }

  const startTime = Date.now();

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const results = await processBatch(batch, i + 1, batches.length);

    for (const result of results) {
      processed++;
      if (result.status === "success") {
        success++;
        console.log(`✓ [${processed}/${total}] ${result.email}`);
      } else {
        failed++;
        console.log(`✗ [${processed}/${total}] ${result.email} - ${result.error}`);
      }
    }

    // Progress update every 10 batches
    if ((i + 1) % 10 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = total - processed;
      const eta = Math.round(remaining / rate / 60);
      console.log(`\n--- Progress: ${processed}/${total} | ETA: ~${eta} min ---\n`);
    }

    // Delay between batches to respect rate limits
    if (i < batches.length - 1) {
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n==========================================`);
  console.log(`Migration Complete!`);
  console.log(`  Total: ${total}`);
  console.log(`  Success: ${success}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Time: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);
  console.log(`==========================================`);
}

main().catch(console.error);
