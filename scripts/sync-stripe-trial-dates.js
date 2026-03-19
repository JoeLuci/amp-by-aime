#!/usr/bin/env node

/**
 * Sync Trial Dates from Stripe to Profiles
 *
 * Fetches trial_start and trial_end from Stripe subscriptions
 * and updates the profiles table.
 *
 * Usage:
 *   node scripts/sync-stripe-trial-dates.js --report
 *   node scripts/sync-stripe-trial-dates.js --sync
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

// Rate limiting
const DELAY_MS = 100;

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

// Fetch trialing users from profiles
async function fetchTrialingUsers() {
  console.log("Fetching trialing users from profiles...\n");

  // Fetch users with subscription_status = trialing AND stripe_customer_id
  const response = await supabaseRequest(
    "profiles?subscription_status=eq.trialing&stripe_customer_id=not.is.null&select=id,email,stripe_customer_id,stripe_subscription_id,trial_start_date,trial_end_date"
  );

  if (!Array.isArray(response.data)) {
    console.error("Error fetching profiles:", response.data);
    return [];
  }

  console.log(`   Found ${response.data.length} trialing users with Stripe ID\n`);
  return response.data;
}

// Get trial dates from Stripe subscription
async function getStripeTrialDates(customerId, subscriptionId) {
  try {
    let subscription;

    // Try by subscription ID first if available
    if (subscriptionId) {
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    } else {
      // Otherwise list subscriptions for customer
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: "trialing",
        limit: 1,
      });
      subscription = subs.data[0];
    }

    if (!subscription) {
      return { error: "No trialing subscription found" };
    }

    return {
      subscription_id: subscription.id,
      status: subscription.status,
      trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
      trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    };
  } catch (err) {
    return { error: err.message };
  }
}

// Update profile with trial dates
async function updateProfileTrialDates(profileId, trialStart, trialEnd, subscriptionId) {
  const updates = {
    trial_start_date: trialStart,
    trial_end_date: trialEnd,
    updated_at: new Date().toISOString(),
  };

  // Also update subscription ID if we found it
  if (subscriptionId) {
    updates.stripe_subscription_id = subscriptionId;
  }

  const response = await supabaseRequest(`profiles?id=eq.${profileId}`, {
    method: "PATCH",
    body: updates,
    prefer: "return=minimal",
  });

  return response.statusCode >= 200 && response.statusCode < 300;
}

// Main
async function main() {
  console.log("===========================================================");
  console.log("   SYNC STRIPE TRIAL DATES");
  console.log("===========================================================");
  console.log(`   Mode: ${REPORT_MODE ? "REPORT" : SYNC_MODE ? "SYNC" : "NONE"}`);
  console.log("===========================================================\n");

  if (!REPORT_MODE && !SYNC_MODE) {
    console.log("Usage:");
    console.log("  --report    Show trial dates from Stripe (read-only)");
    console.log("  --sync      Update profiles with Stripe trial dates");
    console.log("  --verbose   Show detailed output");
    console.log("\nExample:");
    console.log("  STRIPE_SECRET_KEY=sk_xxx SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx \\");
    console.log("    node scripts/sync-stripe-trial-dates.js --sync");
    return;
  }

  // Fetch trialing users
  const users = await fetchTrialingUsers();

  if (users.length === 0) {
    console.log("No trialing users found.\n");
    return;
  }

  const results = {
    total: users.length,
    updated: 0,
    no_trial: 0,
    errors: 0,
    mismatches: [],
  };

  console.log("Processing users...\n");

  for (let i = 0; i < users.length; i++) {
    const user = users[i];

    const stripeData = await getStripeTrialDates(user.stripe_customer_id, user.stripe_subscription_id);

    if (stripeData.error) {
      results.errors++;
      if (VERBOSE) {
        console.log(`   ${user.email}: Error - ${stripeData.error}`);
      }
    } else if (!stripeData.trial_end) {
      results.no_trial++;
      if (VERBOSE) {
        console.log(`   ${user.email}: No trial dates in Stripe`);
      }
    } else {
      // Check for mismatch
      const currentEnd = user.trial_end_date ? new Date(user.trial_end_date).toISOString().split('T')[0] : null;
      const stripeEnd = stripeData.trial_end ? new Date(stripeData.trial_end).toISOString().split('T')[0] : null;

      if (currentEnd !== stripeEnd) {
        results.mismatches.push({
          email: user.email,
          current: currentEnd,
          stripe: stripeEnd,
        });
      }

      if (SYNC_MODE) {
        const success = await updateProfileTrialDates(
          user.id,
          stripeData.trial_start,
          stripeData.trial_end,
          stripeData.subscription_id
        );

        if (success) {
          results.updated++;
          if (VERBOSE) {
            console.log(`   ${user.email}: Updated trial_end to ${stripeEnd}`);
          }
        } else {
          results.errors++;
          if (VERBOSE) {
            console.log(`   ${user.email}: Failed to update`);
          }
        }
      } else {
        results.updated++;
        if (VERBOSE) {
          console.log(`   ${user.email}: Trial ends ${stripeEnd}`);
        }
      }
    }

    const progress = Math.round(((i + 1) / users.length) * 100);
    process.stdout.write(`\r   Progress: ${progress}% (${i + 1}/${users.length})`);

    await sleep(DELAY_MS);
  }

  console.log("\n\n===========================================================");
  console.log("   RESULTS");
  console.log("===========================================================\n");

  console.log(`   Total trialing users:    ${results.total}`);
  console.log(`   With trial dates:        ${results.updated}`);
  console.log(`   No trial in Stripe:      ${results.no_trial}`);
  console.log(`   Errors:                  ${results.errors}`);
  console.log("");

  if (results.mismatches.length > 0) {
    console.log(`   DATE MISMATCHES FOUND:   ${results.mismatches.length}`);
    console.log("");
    console.log("   Examples:");
    results.mismatches.slice(0, 10).forEach(m => {
      console.log(`      ${m.email}: Current=${m.current || 'null'} -> Stripe=${m.stripe}`);
    });
    if (results.mismatches.length > 10) {
      console.log(`      ... and ${results.mismatches.length - 10} more`);
    }
    console.log("");
  }

  if (SYNC_MODE) {
    console.log(`   Updated ${results.updated} profiles with Stripe trial dates.\n`);
  } else {
    console.log("   Run with --sync to update profiles with these dates.\n");
  }

  console.log("===========================================================\n");
}

main().catch(console.error);
