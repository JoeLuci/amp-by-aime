/**
 * Stripe Mass Cancellation Script (Safe Version)
 *
 * IMPORTANT: Before running --execute:
 * 1. Disable Stripe customer emails (Dashboard -> Settings -> Emails)
 * 2. Disable or pause your webhook endpoint (Dashboard -> Webhooks)
 *    OR add logic to ignore events with metadata.migration_cancel = true
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_xxx node stripe-mass-cancel.js
 *   STRIPE_SECRET_KEY=sk_live_xxx node stripe-mass-cancel.js --dry-run
 *   STRIPE_SECRET_KEY=sk_live_xxx node stripe-mass-cancel.js --execute
 *
 * Rate Limits:
 *   - Stripe allows 100 req/sec in live mode, 25 req/sec in test mode
 *   - This script uses 200ms delay = 5 req/sec (very conservative)
 *   - Batch listing uses 500ms delay between pages
 */

const Stripe = require('stripe');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error('Error: STRIPE_SECRET_KEY environment variable required');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

// ============================================
// CONFIGURE: Add the price IDs you want to cancel
// ============================================
const PRICE_IDS_TO_CANCEL = [
  'price_1LMBSiKq6gZ6OHL8dzBjFgJC',
];

// Rate limiting configuration (conservative)
const DELAY_BETWEEN_CANCELLATIONS_MS = 200;  // 5 req/sec
const DELAY_BETWEEN_LIST_PAGES_MS = 500;     // 2 pages/sec

const DRY_RUN = !process.argv.includes('--execute');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAllSubscriptionsByPriceId(priceIds) {
  console.log('\nFetching all subscriptions...\n');

  const subscriptionsByPrice = {};
  priceIds.forEach(id => subscriptionsByPrice[id] = []);

  let hasMore = true;
  let startingAfter = null;
  let totalFetched = 0;

  while (hasMore) {
    const params = {
      limit: 100,
      status: 'all',
      expand: ['data.customer', 'data.items.data.price']
    };
    if (startingAfter) params.starting_after = startingAfter;

    const response = await stripe.subscriptions.list(params);
    totalFetched += response.data.length;

    for (const sub of response.data) {
      const priceId = sub.items.data[0]?.price?.id;
      if (priceIds.includes(priceId)) {
        // Safe date handling
        let created = 'N/A';
        let periodEnd = 'N/A';
        try {
          if (sub.created) created = new Date(sub.created * 1000).toISOString();
        } catch (e) { /* ignore */ }
        try {
          if (sub.current_period_end) periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        } catch (e) { /* ignore */ }

        subscriptionsByPrice[priceId].push({
          id: sub.id,
          status: sub.status,
          customer_id: sub.customer?.id || sub.customer,
          customer_email: sub.customer?.email || 'N/A',
          price_id: priceId,
          created: created,
          current_period_end: periodEnd,
        });
      }
    }

    hasMore = response.has_more;
    if (response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }

    process.stdout.write('\r   Fetched ' + totalFetched + ' subscriptions...');

    // Rate limit between list pages
    if (hasMore) {
      await sleep(DELAY_BETWEEN_LIST_PAGES_MS);
    }
  }

  console.log('\n');
  return subscriptionsByPrice;
}

async function cancelSubscription(sub) {
  try {
    // Cancel with specific options to minimize side effects:
    // - cancel_at_period_end: false = immediate cancellation
    // - prorate: false = no proration credits/charges
    // - invoice_now: false = don't generate final invoice
    //
    // NOTE: This WILL still trigger webhook events:
    //   - customer.subscription.updated
    //   - customer.subscription.deleted
    //
    // You should disable your webhook endpoint before running this,
    // or handle these events specially in your webhook handler.

    await stripe.subscriptions.cancel(sub.id, {
      prorate: false,
      invoice_now: false,
      // Add metadata to identify migration cancellations
      // (useful if you want to filter these in your webhook handler)
      cancellation_details: {
        comment: 'Mass migration cleanup - ' + new Date().toISOString()
      }
    });
    return { success: true, sub };
  } catch (error) {
    return { success: false, sub, error: error.message };
  }
}

async function checkWebhookEndpoints() {
  try {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 10 });
    const enabledEndpoints = endpoints.data.filter(e => e.status === 'enabled');

    if (enabledEndpoints.length > 0) {
      console.log('\n*** WARNING: ACTIVE WEBHOOK ENDPOINTS DETECTED ***\n');
      for (const ep of enabledEndpoints) {
        console.log('   - ' + ep.url);
        console.log('     Events: ' + ep.enabled_events.slice(0, 3).join(', ') + '...');
      }
      console.log('\n   Canceling subscriptions will trigger webhook events!');
      console.log('   Consider disabling webhooks in Stripe Dashboard first.');
      console.log('   Or ensure your webhook handler ignores migration events.\n');
      return true;
    }
    return false;
  } catch (error) {
    console.log('   (Could not check webhook endpoints: ' + error.message + ')');
    return false;
  }
}

async function main() {
  console.log('===========================================================');
  console.log('   STRIPE MASS CANCELLATION SCRIPT (Safe Version)');
  console.log('===========================================================');
  console.log('   Mode: ' + (DRY_RUN ? 'DRY RUN (no changes)' : 'EXECUTE (will cancel!)'));
  console.log('   Rate: ' + (1000 / DELAY_BETWEEN_CANCELLATIONS_MS) + ' cancellations/sec');
  console.log('===========================================================\n');

  // Check for active webhooks
  const hasWebhooks = await checkWebhookEndpoints();

  if (PRICE_IDS_TO_CANCEL.length === 0) {
    console.log('No price IDs configured. Showing all subscription price IDs:\n');

    const priceIdCounts = {};
    let hasMore = true;
    let startingAfter = null;
    let total = 0;

    while (hasMore) {
      const params = { limit: 100, status: 'all', expand: ['data.items.data.price'] };
      if (startingAfter) params.starting_after = startingAfter;

      const response = await stripe.subscriptions.list(params);
      total += response.data.length;

      for (const sub of response.data) {
        const priceId = sub.items.data[0]?.price?.id || 'unknown';
        const priceName = sub.items.data[0]?.price?.nickname || '';

        if (!priceIdCounts[priceId]) {
          priceIdCounts[priceId] = {
            count: 0,
            name: priceName,
            statuses: {}
          };
        }
        priceIdCounts[priceId].count++;
        priceIdCounts[priceId].statuses[sub.status] = (priceIdCounts[priceId].statuses[sub.status] || 0) + 1;
      }

      hasMore = response.has_more;
      if (response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      }
      process.stdout.write('\r   Fetched ' + total + ' subscriptions...');

      if (hasMore) await sleep(DELAY_BETWEEN_LIST_PAGES_MS);
    }

    console.log('\n\n');
    console.log('PRICE ID                                  | COUNT | STATUSES');
    console.log('-'.repeat(90));

    const sorted = Object.entries(priceIdCounts).sort((a, b) => b[1].count - a[1].count);
    for (const [priceId, data] of sorted) {
      const statusStr = Object.entries(data.statuses)
        .map(([s, c]) => s + ':' + c)
        .join(', ');
      const nameStr = data.name ? ' (' + data.name + ')' : '';
      console.log(priceId + nameStr.padEnd(40 - priceId.length) + ' | ' + String(data.count).padStart(5) + ' | ' + statusStr);
    }

    console.log('\nTotal subscriptions: ' + total);
    console.log('\n===========================================================');
    console.log('NEXT STEPS:');
    console.log('===========================================================');
    console.log('1. Copy price IDs to cancel into PRICE_IDS_TO_CANCEL array');
    console.log('2. Disable Stripe customer emails (Dashboard -> Settings -> Emails)');
    console.log('3. Disable webhook endpoints (Dashboard -> Developers -> Webhooks)');
    console.log('4. Run with --dry-run to preview');
    console.log('5. Run with --execute to cancel');
    console.log('6. Re-enable webhooks and emails after completion');
    return;
  }

  const subscriptionsByPrice = await getAllSubscriptionsByPriceId(PRICE_IDS_TO_CANCEL);

  let totalToCancel = 0;
  let alreadyCanceled = 0;
  console.log('SUBSCRIPTIONS FOUND:\n');

  for (const [priceId, subs] of Object.entries(subscriptionsByPrice)) {
    const active = subs.filter(s => s.status === 'active').length;
    const trialing = subs.filter(s => s.status === 'trialing').length;
    const canceled = subs.filter(s => s.status === 'canceled').length;
    const other = subs.filter(s => !['active', 'trialing', 'canceled'].includes(s.status)).length;

    console.log('   ' + priceId + ':');
    console.log('      Active: ' + active + ', Trialing: ' + trialing + ', Already Canceled: ' + canceled + ', Other: ' + other);
    totalToCancel += active + trialing;
    alreadyCanceled += canceled;
  }

  console.log('\n   TO CANCEL (active + trialing): ' + totalToCancel);
  console.log('   ALREADY CANCELED (skip): ' + alreadyCanceled);

  const estimatedTime = Math.ceil(totalToCancel * DELAY_BETWEEN_CANCELLATIONS_MS / 1000 / 60);
  console.log('   ESTIMATED TIME: ~' + estimatedTime + ' minutes\n');

  if (DRY_RUN) {
    console.log('===========================================================');
    console.log('   DRY RUN COMPLETE - No changes made');
    console.log('===========================================================\n');

    if (hasWebhooks) {
      console.log('*** REMINDER: Disable webhook endpoints before --execute ***\n');
    }

    console.log('Subscriptions that would be canceled:\n');
    let shown = 0;
    for (const subs of Object.values(subscriptionsByPrice)) {
      for (const sub of subs) {
        if (['active', 'trialing'].includes(sub.status) && shown < 20) {
          console.log('   ' + sub.id + ' | ' + sub.customer_email.substring(0, 35).padEnd(35) + ' | ' + sub.status);
          shown++;
        }
      }
    }
    if (totalToCancel > 20) {
      console.log('   ... and ' + (totalToCancel - 20) + ' more');
    }

    console.log('\nTo execute, run with --execute flag');
    return;
  }

  // EXECUTE MODE
  console.log('EXECUTING CANCELLATIONS...\n');
  console.log('(This will take ~' + estimatedTime + ' minutes)\n');

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  const errors = [];
  const startTime = Date.now();

  for (const [priceId, subs] of Object.entries(subscriptionsByPrice)) {
    const toCancel = subs.filter(s => ['active', 'trialing'].includes(s.status));

    for (let i = 0; i < toCancel.length; i++) {
      const sub = toCancel[i];
      const result = await cancelSubscription(sub);

      if (result.success) {
        successCount++;
        const progress = Math.round((successCount + errorCount) / totalToCancel * 100);
        process.stdout.write('\r   Progress: ' + progress + '% | Canceled: ' + successCount + ' | Errors: ' + errorCount + '   ');
      } else {
        errorCount++;
        errors.push(result);
      }

      // Rate limit between cancellations
      await sleep(DELAY_BETWEEN_CANCELLATIONS_MS);
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000 / 60);

  console.log('\n\n===========================================================');
  console.log('   CANCELLATION COMPLETE');
  console.log('===========================================================');
  console.log('   Successfully canceled: ' + successCount);
  console.log('   Errors: ' + errorCount);
  console.log('   Time elapsed: ' + elapsed + ' minutes');
  console.log('===========================================================\n');

  if (errors.length > 0) {
    console.log('Failed cancellations:');
    errors.slice(0, 20).forEach(e => console.log('   ' + e.sub.id + ': ' + e.error));
    if (errors.length > 20) {
      console.log('   ... and ' + (errors.length - 20) + ' more errors');
    }
  }

  console.log('\nDONT FORGET: Re-enable your webhook endpoints in Stripe Dashboard!');
}

main().catch(console.error);
