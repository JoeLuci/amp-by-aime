#!/usr/bin/env node

/**
 * Find Stripe Customers Missing from Migration Queue
 *
 * Scans all active Stripe subscriptions and identifies customers
 * who are NOT in the migration_queue (not in Bubble).
 *
 * Usage:
 *   node scripts/stripe-find-missing.js --report
 *   node scripts/stripe-find-missing.js --add
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const Stripe = require("stripe");
const https = require("https");

// Configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error("Error: STRIPE_SECRET_KEY required");
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

// Modes
const REPORT_MODE = process.argv.includes("--report");
const ADD_MODE = process.argv.includes("--add");
const VERBOSE = process.argv.includes("--verbose");

// Rate limiting
const DELAY_MS = 200;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// HTTP request helper for Supabase
function supabaseRequest(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
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

// Map Stripe price to plan tier
function mapPriceToTier(priceId, amount, interval) {
  // Known price mappings (from allowed_stripe_prices table)
  const priceMappings = {
    // Premium
    "price_1PtZmdKq6gZ6OHL8b8D2okBw": "Premium",      // Premium Monthly
    "price_1PtZoCKq6gZ6OHL8NhK2QLQA": "Premium",      // Premium Annual
    // Elite
    "price_1PtZuiKq6gZ6OHL8dRdkjr8G": "Elite",        // Elite Monthly
    "price_1PtZvAKq6gZ6OHL8AKsPuIYS": "Elite",        // Elite Annual
    // VIP
    "price_1PtZw5Kq6gZ6OHL8SlbrZqOA": "VIP",          // VIP Monthly
    "price_1PtZwTKq6gZ6OHL8zRSVLHKi": "VIP",          // VIP Annual
    // Premium Processor
    "price_1RhZUuKq6gZ6OHL8l77hU8fR": "Premium Processor",  // Monthly
    "price_1RhZUuKq6gZ6OHL8ZZtf3w8g": "Premium Processor",  // Annual
    // Elite Processor
    "price_1RhZVaKq6gZ6OHL8DcBogOUv": "Elite Processor",    // Monthly
    "price_1RhZVyKq6gZ6OHL8e5GtRB3r": "Elite Processor",    // Annual
    // VIP Processor
    "price_1RhZWaKq6gZ6OHL8kdecStbM": "VIP Processor",      // Monthly
    "price_1RhZWtKq6gZ6OHL8C0YVDBR1": "VIP Processor",      // Annual
  };

  if (priceMappings[priceId]) {
    return priceMappings[priceId];
  }

  if (!amount) return "None";
  const monthly = interval === "month" ? amount : amount / 12;
  if (monthly >= 15000) return "VIP";
  if (monthly >= 5000) return "Elite";
  if (monthly >= 1000) return "Premium";
  return "None";
}

// Fetch all emails from migration_queue
async function fetchQueueEmails() {
  console.log("Fetching emails from migration_queue...\n");

  const response = await supabaseRequest(
    "migration_queue?select=email,stripe_customer_id"
  );

  const emails = new Set();
  const stripeIds = new Set();

  if (Array.isArray(response.data)) {
    response.data.forEach(row => {
      if (row.email) emails.add(row.email.toLowerCase());
      if (row.stripe_customer_id) stripeIds.add(row.stripe_customer_id);
    });
  }

  console.log(`   Found ${emails.size} emails in queue`);
  console.log(`   Found ${stripeIds.size} Stripe IDs in queue\n`);

  return { emails, stripeIds };
}

// Fetch all active subscriptions from Stripe
async function fetchActiveStripeSubscriptions() {
  console.log("Fetching active subscriptions from Stripe...\n");

  const subscriptions = [];
  let hasMore = true;
  let startingAfter = null;

  while (hasMore) {
    const params = {
      limit: 100,
      status: "active",
      expand: ["data.customer", "data.items.data.price"],
    };
    if (startingAfter) params.starting_after = startingAfter;

    const response = await stripe.subscriptions.list(params);
    subscriptions.push(...response.data);

    process.stdout.write(`\r   Fetched ${subscriptions.length} active subscriptions...`);

    hasMore = response.has_more;
    if (response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }

    if (hasMore) await sleep(DELAY_MS);
  }

  // Also fetch trialing
  hasMore = true;
  startingAfter = null;

  while (hasMore) {
    const params = {
      limit: 100,
      status: "trialing",
      expand: ["data.customer", "data.items.data.price"],
    };
    if (startingAfter) params.starting_after = startingAfter;

    const response = await stripe.subscriptions.list(params);
    subscriptions.push(...response.data);

    process.stdout.write(`\r   Fetched ${subscriptions.length} total (incl. trialing)...`);

    hasMore = response.has_more;
    if (response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }

    if (hasMore) await sleep(DELAY_MS);
  }

  console.log(`\n\n   Total active/trialing: ${subscriptions.length}\n`);
  return subscriptions;
}

// Add missing customers to migration_queue
async function addToQueue(customers) {
  console.log(`\nAdding ${customers.length} customers to migration_queue...\n`);

  const BATCH = 50;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < customers.length; i += BATCH) {
    const batch = customers.slice(i, i + BATCH);

    const queueItems = batch.map(c => ({
      bubble_user_id: `stripe_${c.customer_id}`,  // Synthetic ID for Stripe-only customers
      email: c.email,
      first_name: c.name?.split(" ")[0] || null,
      last_name: c.name?.split(" ").slice(1).join(" ") || null,
      stripe_customer_id: c.customer_id,
      subscription_type: c.plan_tier,
      status: "pending",
      bubble_data: {
        _source: "stripe_only",
        _stripe_validation: {
          validated_at: new Date().toISOString(),
          customer_exists: true,
          subscription_status: c.subscription_status,
          stripe_tier: c.plan_tier,
          subscription_id: c.subscription_id,
          price_id: c.price_id,
        }
      }
    }));

    const response = await supabaseRequest("migration_queue", {
      method: "POST",
      body: queueItems,
      prefer: "resolution=ignore-duplicates,return=minimal",
    });

    if (response.statusCode >= 200 && response.statusCode < 300) {
      inserted += batch.length;
    } else if (response.statusCode === 409) {
      // Duplicates, that's fine
    } else {
      errors += batch.length;
      if (VERBOSE) {
        console.log(`\n   Batch error:`, response.data);
      }
    }

    process.stdout.write(`\r   Progress: ${i + batch.length}/${customers.length}`);
    await sleep(100);
  }

  console.log(`\n\n   Inserted: ${inserted}`);
  console.log(`   Errors: ${errors}\n`);
}

// Main
async function main() {
  console.log("===========================================================");
  console.log("   FIND MISSING STRIPE CUSTOMERS");
  console.log("===========================================================");
  console.log(`   Mode: ${REPORT_MODE ? "REPORT" : ADD_MODE ? "ADD" : "NONE"}`);
  console.log("===========================================================\n");

  if (!REPORT_MODE && !ADD_MODE) {
    console.log("Usage:");
    console.log("  --report    Find and report missing customers");
    console.log("  --add       Add missing customers to migration_queue");
    console.log("  --verbose   Show detailed output");
    console.log("\nExample:");
    console.log("  STRIPE_SECRET_KEY=sk_xxx SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx \\");
    console.log("    node scripts/stripe-find-missing.js --report");
    return;
  }

  // Get existing queue data
  const { emails: queueEmails, stripeIds: queueStripeIds } = await fetchQueueEmails();

  // Get all active Stripe subscriptions
  const subscriptions = await fetchActiveStripeSubscriptions();

  // Find missing customers
  const missing = [];
  const inQueue = [];

  for (const sub of subscriptions) {
    const customer = sub.customer;
    const customerId = typeof customer === "string" ? customer : customer?.id;
    const customerEmail = typeof customer === "string" ? null : customer?.email;
    const customerName = typeof customer === "string" ? null : customer?.name;

    if (!customerEmail) {
      if (VERBOSE) console.log(`   Skipping ${customerId} - no email`);
      continue;
    }

    const emailLower = customerEmail.toLowerCase();
    const item = sub.items.data[0];
    const price = item?.price;

    const customerData = {
      customer_id: customerId,
      email: customerEmail,
      name: customerName,
      subscription_id: sub.id,
      subscription_status: sub.status,
      price_id: price?.id,
      amount: price?.unit_amount,
      interval: price?.recurring?.interval,
      plan_tier: mapPriceToTier(price?.id, price?.unit_amount, price?.recurring?.interval),
    };

    // Check if already in queue by email OR stripe ID
    if (queueEmails.has(emailLower) || queueStripeIds.has(customerId)) {
      inQueue.push(customerData);
    } else {
      missing.push(customerData);
    }
  }

  // Report
  console.log("===========================================================");
  console.log("   RESULTS");
  console.log("===========================================================\n");

  console.log(`   Active Stripe subscriptions:  ${subscriptions.length}`);
  console.log(`   Already in queue:             ${inQueue.length}`);
  console.log(`   MISSING from queue:           ${missing.length}`);
  console.log("");

  if (missing.length > 0) {
    // Group by tier
    const byTier = {};
    for (const c of missing) {
      if (!byTier[c.plan_tier]) byTier[c.plan_tier] = [];
      byTier[c.plan_tier].push(c);
    }

    console.log("Missing by tier:");
    for (const [tier, customers] of Object.entries(byTier)) {
      console.log(`   ${tier}: ${customers.length}`);
    }
    console.log("");

    if (VERBOSE) {
      console.log("Missing customers (first 20):");
      missing.slice(0, 20).forEach(c => {
        console.log(`   ${c.email} | ${c.plan_tier} | ${c.customer_id}`);
      });
      if (missing.length > 20) {
        console.log(`   ... and ${missing.length - 20} more`);
      }
      console.log("");
    }
  }

  console.log("===========================================================\n");

  // Add if requested
  if (ADD_MODE && missing.length > 0) {
    await addToQueue(missing);
  } else if (ADD_MODE && missing.length === 0) {
    console.log("No missing customers to add.\n");
  }

  if (REPORT_MODE && missing.length > 0) {
    console.log("Run with --add to add these customers to migration_queue.\n");
  }
}

main().catch(console.error);
