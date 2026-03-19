#!/usr/bin/env node

/**
 * Stripe Sync for Migration Queue
 *
 * Validates and syncs Stripe data for users in migration_queue.
 * Does NOT modify Stripe - only reads from Stripe and updates migration_queue.
 *
 * Usage:
 *   node scripts/stripe-sync-migration.js --report
 *   node scripts/stripe-sync-migration.js --sync
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
const SYNC_MODE = process.argv.includes("--sync");
const VERBOSE = process.argv.includes("--verbose");
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith("--batch="))?.split("=")[1] || "100");

// Rate limiting
const DELAY_BETWEEN_REQUESTS_MS = 100; // 10 req/sec (conservative)

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

  // Fallback: guess from amount
  if (!amount) return "None";

  const monthly = interval === "month" ? amount : amount / 12;

  if (monthly >= 15000) return "VIP";           // $150+/mo
  if (monthly >= 5000) return "Elite";          // $50+/mo
  if (monthly >= 1000) return "Premium";        // $10+/mo
  return "None";
}

// Fetch users from migration_queue
async function fetchQueueUsers(withStripeId = true) {
  const filter = withStripeId
    ? "stripe_customer_id=not.is.null"
    : "stripe_customer_id=is.null";

  const response = await supabaseRequest(
    `migration_queue?${filter}&select=id,email,stripe_customer_id,subscription_type,bubble_data&order=email`,
    { headers: { "Prefer": "count=exact" } }
  );

  return response.data || [];
}

// Validate a single customer against Stripe
async function validateCustomer(user) {
  const result = {
    email: user.email,
    queue_id: user.id,
    bubble_stripe_id: user.stripe_customer_id,
    bubble_tier: user.subscription_type,
    stripe_customer_exists: false,
    stripe_customer_id: null,
    stripe_email: null,
    stripe_subscription_id: null,
    stripe_subscription_status: null,
    stripe_plan_tier: null,
    stripe_price_id: null,
    stripe_amount: null,
    stripe_interval: null,
    email_match: false,
    tier_match: false,
    issues: [],
  };

  try {
    // Try to fetch customer by ID
    if (user.stripe_customer_id) {
      try {
        const customer = await stripe.customers.retrieve(user.stripe_customer_id);

        if (customer.deleted) {
          result.issues.push("Customer deleted in Stripe");
        } else {
          result.stripe_customer_exists = true;
          result.stripe_customer_id = customer.id;
          result.stripe_email = customer.email;
          result.email_match = customer.email?.toLowerCase() === user.email?.toLowerCase();

          if (!result.email_match) {
            result.issues.push(`Email mismatch: Bubble=${user.email}, Stripe=${customer.email}`);
          }
        }
      } catch (err) {
        if (err.code === "resource_missing") {
          result.issues.push("Customer ID not found in Stripe");
        } else {
          result.issues.push(`Stripe error: ${err.message}`);
        }
      }
    }

    // If customer exists, check subscriptions
    if (result.stripe_customer_exists) {
      const subscriptions = await stripe.subscriptions.list({
        customer: result.stripe_customer_id,
        status: "all",
        limit: 10,
        expand: ["data.items.data.price"],
      });

      // Find active/trialing subscription
      const activeSub = subscriptions.data.find(s =>
        ["active", "trialing", "past_due"].includes(s.status)
      );

      if (activeSub) {
        const item = activeSub.items.data[0];
        const price = item?.price;

        result.stripe_subscription_id = activeSub.id;
        result.stripe_subscription_status = activeSub.status;
        result.stripe_price_id = price?.id;
        result.stripe_amount = price?.unit_amount;
        result.stripe_interval = price?.recurring?.interval;
        result.stripe_plan_tier = mapPriceToTier(
          price?.id,
          price?.unit_amount,
          price?.recurring?.interval
        );

        // Check tier match
        result.tier_match = result.stripe_plan_tier === user.subscription_type;
        if (!result.tier_match && user.subscription_type) {
          result.issues.push(`Tier mismatch: Bubble=${user.subscription_type}, Stripe=${result.stripe_plan_tier}`);
        }
      } else {
        // Check for canceled subscriptions
        const canceledSub = subscriptions.data.find(s => s.status === "canceled");
        if (canceledSub) {
          result.stripe_subscription_status = "canceled";
          result.issues.push("Subscription canceled");
        } else if (subscriptions.data.length === 0) {
          result.issues.push("No subscriptions found");
        } else {
          result.stripe_subscription_status = subscriptions.data[0]?.status;
          result.issues.push(`Subscription status: ${result.stripe_subscription_status}`);
        }
      }
    }

    // If no Stripe customer ID, try to find by email
    if (!user.stripe_customer_id && user.email) {
      const customers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        result.stripe_customer_id = customers.data[0].id;
        result.stripe_customer_exists = true;
        result.issues.push(`Found customer by email: ${result.stripe_customer_id}`);
      }
    }

  } catch (error) {
    result.issues.push(`Error: ${error.message}`);
  }

  return result;
}

// Update migration_queue with Stripe data
async function updateQueueWithStripeData(queueId, stripeData) {
  const updates = {};

  if (stripeData.stripe_customer_id && !stripeData.bubble_stripe_id) {
    updates.stripe_customer_id = stripeData.stripe_customer_id;
  }

  // Store validation results in bubble_data
  const response = await supabaseRequest(`migration_queue?id=eq.${queueId}`, {
    method: "PATCH",
    body: {
      ...updates,
      bubble_data: {
        ...stripeData.original_bubble_data,
        _stripe_validation: {
          validated_at: new Date().toISOString(),
          customer_exists: stripeData.stripe_customer_exists,
          subscription_status: stripeData.stripe_subscription_status,
          stripe_tier: stripeData.stripe_plan_tier,
          tier_match: stripeData.tier_match,
          email_match: stripeData.email_match,
          issues: stripeData.issues,
        }
      }
    },
    prefer: "return=minimal",
  });

  return response.statusCode >= 200 && response.statusCode < 300;
}

// Generate report
async function generateReport(results) {
  const summary = {
    total: results.length,
    customer_exists: results.filter(r => r.stripe_customer_exists).length,
    customer_missing: results.filter(r => !r.stripe_customer_exists).length,
    has_active_sub: results.filter(r => ["active", "trialing"].includes(r.stripe_subscription_status)).length,
    has_past_due: results.filter(r => r.stripe_subscription_status === "past_due").length,
    canceled: results.filter(r => r.stripe_subscription_status === "canceled").length,
    no_subscription: results.filter(r => r.stripe_customer_exists && !r.stripe_subscription_id).length,
    email_match: results.filter(r => r.email_match).length,
    email_mismatch: results.filter(r => r.stripe_customer_exists && !r.email_match).length,
    tier_match: results.filter(r => r.tier_match).length,
    tier_mismatch: results.filter(r => r.stripe_customer_exists && r.stripe_subscription_id && !r.tier_match).length,
  };

  console.log("\n===========================================================");
  console.log("   STRIPE SYNC REPORT");
  console.log("===========================================================\n");

  console.log("CUSTOMER STATUS:");
  console.log(`   Total checked:        ${summary.total}`);
  console.log(`   Customer exists:      ${summary.customer_exists}`);
  console.log(`   Customer missing:     ${summary.customer_missing}`);
  console.log("");

  console.log("SUBSCRIPTION STATUS:");
  console.log(`   Active/Trialing:      ${summary.has_active_sub}`);
  console.log(`   Past Due:             ${summary.has_past_due}`);
  console.log(`   Canceled:             ${summary.canceled}`);
  console.log(`   No subscription:      ${summary.no_subscription}`);
  console.log("");

  console.log("DATA QUALITY:");
  console.log(`   Email match:          ${summary.email_match}`);
  console.log(`   Email mismatch:       ${summary.email_mismatch}`);
  console.log(`   Tier match:           ${summary.tier_match}`);
  console.log(`   Tier mismatch:        ${summary.tier_mismatch}`);
  console.log("");

  // Show issues
  const withIssues = results.filter(r => r.issues.length > 0);
  if (withIssues.length > 0) {
    console.log("===========================================================");
    console.log("   ISSUES FOUND");
    console.log("===========================================================\n");

    // Group by issue type
    const issueGroups = {};
    for (const r of withIssues) {
      for (const issue of r.issues) {
        const key = issue.split(":")[0];
        if (!issueGroups[key]) issueGroups[key] = [];
        issueGroups[key].push({ email: r.email, issue });
      }
    }

    for (const [issueType, items] of Object.entries(issueGroups)) {
      console.log(`${issueType}: ${items.length} users`);
      if (VERBOSE) {
        items.slice(0, 10).forEach(i => console.log(`   ${i.email}: ${i.issue}`));
        if (items.length > 10) console.log(`   ... and ${items.length - 10} more`);
      }
      console.log("");
    }
  }

  console.log("===========================================================\n");

  return summary;
}

// Main
async function main() {
  console.log("===========================================================");
  console.log("   STRIPE SYNC FOR MIGRATION");
  console.log("===========================================================");
  console.log(`   Mode: ${REPORT_MODE ? "REPORT" : SYNC_MODE ? "SYNC" : "NONE"}`);
  console.log(`   Batch size: ${BATCH_SIZE}`);
  console.log("===========================================================\n");

  if (!REPORT_MODE && !SYNC_MODE) {
    console.log("Usage:");
    console.log("  --report    Generate validation report (read-only)");
    console.log("  --sync      Validate and update migration_queue");
    console.log("  --verbose   Show detailed issues");
    console.log("  --batch=N   Process N users at a time (default: 100)");
    console.log("\nExample:");
    console.log("  STRIPE_SECRET_KEY=sk_xxx SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx \\");
    console.log("    node scripts/stripe-sync-migration.js --report");
    return;
  }

  // Fetch users with Stripe IDs
  console.log("Fetching users from migration_queue...\n");
  const usersWithStripe = await fetchQueueUsers(true);
  const usersWithoutStripe = await fetchQueueUsers(false);

  console.log(`   Users with Stripe ID:    ${usersWithStripe.length}`);
  console.log(`   Users without Stripe ID: ${usersWithoutStripe.length}`);
  console.log("");

  // Process users with Stripe IDs
  const results = [];
  const startTime = Date.now();

  console.log("Validating against Stripe API...\n");

  for (let i = 0; i < usersWithStripe.length; i++) {
    const user = usersWithStripe[i];
    const result = await validateCustomer(user);
    result.original_bubble_data = user.bubble_data;
    results.push(result);

    // Update queue if in sync mode
    if (SYNC_MODE) {
      await updateQueueWithStripeData(user.id, result);
    }

    const progress = Math.round(((i + 1) / usersWithStripe.length) * 100);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    process.stdout.write(`\r   Progress: ${progress}% (${i + 1}/${usersWithStripe.length}) | Time: ${elapsed}s`);

    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }

  console.log("\n");

  // Also check users without Stripe IDs (try to find by email)
  if (usersWithoutStripe.length > 0) {
    console.log("Checking users without Stripe ID (by email)...\n");

    for (let i = 0; i < usersWithoutStripe.length; i++) {
      const user = usersWithoutStripe[i];
      const result = await validateCustomer(user);
      result.original_bubble_data = user.bubble_data;
      results.push(result);

      if (SYNC_MODE && result.stripe_customer_id) {
        await updateQueueWithStripeData(user.id, result);
      }

      const progress = Math.round(((i + 1) / usersWithoutStripe.length) * 100);
      process.stdout.write(`\r   Progress: ${progress}% (${i + 1}/${usersWithoutStripe.length})`);

      await sleep(DELAY_BETWEEN_REQUESTS_MS);
    }

    console.log("\n");
  }

  // Generate report
  await generateReport(results);

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`Total time: ${totalTime} seconds`);

  if (SYNC_MODE) {
    console.log("\nSync complete! Run --report to see updated data.");
  }
}

main().catch(console.error);
