/**
 * Stripe Price Migration Script
 *
 * Migrates subscriptions from old Bubble price IDs to new Supabase price IDs
 * while preserving billing cycles and avoiding customer notifications.
 *
 * IMPORTANT: Before running --execute:
 * 1. Disable Stripe customer emails (Dashboard -> Settings -> Emails)
 * 2. Disable or pause your webhook endpoint (Dashboard -> Webhooks)
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_xxx node scripts/stripe-price-migration.js
 *   STRIPE_SECRET_KEY=sk_live_xxx node scripts/stripe-price-migration.js --dry-run
 *   STRIPE_SECRET_KEY=sk_live_xxx node scripts/stripe-price-migration.js --execute
 *
 * Rate Limits:
 *   - Stripe allows 100 req/sec in live mode
 *   - This script uses 300ms delay = ~3 req/sec (conservative)
 */

const Stripe = require('stripe');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error('Error: STRIPE_SECRET_KEY environment variable required');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

// ============================================
// CONFIGURE: Map old price IDs to new price IDs
// ============================================
const PRICE_MIGRATIONS = {
  // Old Bubble Price ID -> New Supabase Price ID
  'price_1Ja02mKq6gZ6OHL8CHXQHwFb': null,  // Free plan - skip (already canceled)

  // Migrations
  'price_1ONhs6Kq6gZ6OHL8cJ9V71Ou': 'price_1PtZmdKq6gZ6OHL8b8D2okBw',  // -> Premium Monthly $19.99
  'price_1QaKLSKq6gZ6OHL8g2covIGk': 'price_1PtZmdKq6gZ6OHL8b8D2okBw',
  'price_1QaMRAKq6gZ6OHL8AEMNGLzX': 'price_1PtZw5Kq6gZ6OHL8SlbrZqOA',  // -> VIP Monthly $199.99

  // Team plan migrations -> Team Annual
  'price_1QaK2nKq6gZ6OHL8qB59qTuv': 'price_1PtZoCKq6gZ6OHL8NhK2QLQA',
  'price_1QaNmBKq6gZ6OHL8WjxvDMQR': 'price_1PtZoCKq6gZ6OHL8NhK2QLQA',
  'price_1QaNnyKq6gZ6OHL8AJeauWEW': 'price_1PtZoCKq6gZ6OHL8NhK2QLQA',

  // VIP Annual migrations
  'price_1QaNmDKq6gZ6OHL8stztKg7G': 'price_1PtZwTKq6gZ6OHL8zRSVLHKi',
  'price_1QaNoRKq6gZ6OHL8RM3I3k3N': 'price_1PtZwTKq6gZ6OHL8zRSVLHKi',
  'price_1QaMRyKq6gZ6OHL8A4h2QjyP': 'price_1PtZwTKq6gZ6OHL8zRSVLHKi',
  'price_1QaMRyKq6gZ6OHL8obxhhVCW': 'price_1PtZwTKq6gZ6OHL8zRSVLHKi',
  'price_1LjnwGKq6gZ6OHL8M0sPkKO4': 'price_1PtZwTKq6gZ6OHL8zRSVLHKi',

  // Premium Annual migration
  'price_1QaNoBKq6gZ6OHL85vsh9PAD': 'price_1PtZvAKq6gZ6OHL8AKsPuIYS',
  'price_1Ja02mKq6gZ6OHL8ZX4Ckztk': 'price_1PtZvAKq6gZ6OHL8AKsPuIYS',

  // VIP Monthly
  'price_1QaNpjKq6gZ6OHL8MzmuX0VI': 'price_1PtZw5Kq6gZ6OHL8SlbrZqOA',
  'price_1QaMRbKq6gZ6OHL8t8sQcWKO': 'price_1PtZw5Kq6gZ6OHL8SlbrZqOA',

  // Team Annual
  'price_1R41FhKq6gZ6OHL8lU8JhWih': 'price_1PtZoCKq6gZ6OHL8NhK2QLQA',
  'price_1QUuoZKq6gZ6OHL8g6ksyVbt': 'price_1PtZoCKq6gZ6OHL8NhK2QLQA',
  'price_1QaKNtKq6gZ6OHL80Ug1Yi95': 'price_1PtZoCKq6gZ6OHL8NhK2QLQA',
  'price_1QaKLSKq6gZ6OHL8bIJDhSV1': 'price_1PtZoCKq6gZ6OHL8NhK2QLQA',
  'price_1QaKLzKq6gZ6OHL8sS65jTuK': 'price_1PtZoCKq6gZ6OHL8NhK2QLQA',
  'price_1Ja02mKq6gZ6OHL8UQE1dHZN': 'price_1PtZoCKq6gZ6OHL8NhK2QLQA',

  // Team Monthly
  'price_1QaMMwKq6gZ6OHL8rdpgVDUl': 'price_1PtZuiKq6gZ6OHL8dRdkjr8G',
};

// Rate limiting
const DELAY_BETWEEN_UPDATES_MS = 300;  // ~3 req/sec
const DELAY_BETWEEN_LIST_PAGES_MS = 500;

const DRY_RUN = !process.argv.includes('--execute');
const SHOW_MAPPINGS = process.argv.includes('--show-prices');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getSuffix(day) {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

async function getAllPriceIds() {
  console.log('\nFetching all active subscriptions to identify price IDs...\n');

  const priceIdCounts = {};
  let hasMore = true;
  let startingAfter = null;
  let total = 0;

  while (hasMore) {
    const params = {
      limit: 100,
      status: 'all',
      expand: ['data.items.data.price']
    };
    if (startingAfter) params.starting_after = startingAfter;

    const response = await stripe.subscriptions.list(params);
    total += response.data.length;

    for (const sub of response.data) {
      const priceId = sub.items.data[0]?.price?.id || 'unknown';
      const priceName = sub.items.data[0]?.price?.nickname || '';
      const amount = sub.items.data[0]?.price?.unit_amount || 0;
      const interval = sub.items.data[0]?.price?.recurring?.interval || '';

      if (!priceIdCounts[priceId]) {
        priceIdCounts[priceId] = {
          count: 0,
          name: priceName,
          amount: amount / 100,
          interval: interval,
          statuses: {}
        };
      }
      priceIdCounts[priceId].count++;
      priceIdCounts[priceId].statuses[sub.status] =
        (priceIdCounts[priceId].statuses[sub.status] || 0) + 1;
    }

    hasMore = response.has_more;
    if (response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }
    process.stdout.write('\r   Fetched ' + total + ' subscriptions...');

    if (hasMore) await sleep(DELAY_BETWEEN_LIST_PAGES_MS);
  }

  console.log('\n');
  return { priceIdCounts, total };
}

async function getSubscriptionsForMigration() {
  console.log('\nFetching subscriptions to migrate...\n');

  const oldPriceIds = Object.keys(PRICE_MIGRATIONS).filter(id => PRICE_MIGRATIONS[id] !== null);

  if (oldPriceIds.length === 0) {
    return [];
  }

  const subscriptionsToMigrate = [];

  // Query each price ID directly instead of scanning all subscriptions
  for (const priceId of oldPriceIds) {
    const newPriceId = PRICE_MIGRATIONS[priceId];
    console.log('   Fetching subs for ' + priceId + '...');

    let hasMore = true;
    let startingAfter = null;

    while (hasMore) {
      const params = {
        limit: 100,
        price: priceId,  // Filter by price ID directly
        expand: ['data.customer', 'data.items.data.price']
      };
      // Note: not filtering by status - we want active AND trialing
      if (startingAfter) params.starting_after = startingAfter;

      const response = await stripe.subscriptions.list(params);

      for (const sub of response.data) {
        // Only migrate active, trialing, or past_due subscriptions
        if (!['active', 'trialing', 'past_due'].includes(sub.status)) {
          continue;
        }

        // Get current_period_end from subscription item (Stripe 2025+ API change)
        const item = sub.items.data[0];
        let nextBilling = 'N/A';

        // Debug: show raw data from Stripe
        if (subscriptionsToMigrate.length === 0) {
          console.log('   DEBUG - Raw item.current_period_end:', item?.current_period_end);
          console.log('   DEBUG - Converted:', item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : 'N/A');
        }

        if (item?.current_period_end) {
          const date = new Date(item.current_period_end * 1000);
          nextBilling = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/New_York',
            timeZoneName: 'short'
          });
        }

        // Check cancellation status
        let cancelInfo = null;
        if (sub.cancel_at) {
          const cancelDate = new Date(sub.cancel_at * 1000);
          cancelInfo = 'Cancels: ' + cancelDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'America/New_York'
          });
        } else if (sub.cancel_at_period_end) {
          cancelInfo = 'Cancels at period end';
        }

        // Check trial status
        let trialInfo = null;
        if (sub.status === 'trialing' && sub.trial_end) {
          const trialEnd = new Date(sub.trial_end * 1000);
          trialInfo = 'Trial ends: ' + trialEnd.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'America/New_York'
          });
        }

        // Check for discounts/coupons
        let discountInfo = null;
        if (sub.discount) {
          const coupon = sub.discount.coupon;
          if (coupon.percent_off) {
            discountInfo = coupon.percent_off + '% off';
          } else if (coupon.amount_off) {
            discountInfo = '$' + (coupon.amount_off / 100) + ' off';
          }
          if (coupon.name) {
            discountInfo += ' (' + coupon.name + ')';
          }
        }

        subscriptionsToMigrate.push({
          id: sub.id,
          subscription_item_id: item.id,
          customer_id: sub.customer?.id || sub.customer,
          customer_email: sub.customer?.email || 'N/A',
          current_price_id: priceId,
          new_price_id: newPriceId,
          next_billing: nextBilling,
          status: sub.status,
          cancel_info: cancelInfo,
          cancel_at: sub.cancel_at,
          cancel_at_period_end: sub.cancel_at_period_end,
          trial_info: trialInfo,
          trial_end: sub.trial_end,
          discount_info: discountInfo,
        });
      }

      hasMore = response.has_more;
      if (response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      }

      if (hasMore) await sleep(DELAY_BETWEEN_LIST_PAGES_MS);
    }

    console.log('   Found ' + subscriptionsToMigrate.length + ' total so far');
  }

  console.log('');
  return subscriptionsToMigrate;
}

async function migrateSubscription(sub) {
  try {
    // Update the subscription item to the new price
    // Key settings to preserve billing cycle and avoid disruption:
    // - proration_behavior: 'none' = no immediate charges or credits
    // - billing_cycle_anchor: 'unchanged' = keep same billing date
    // - payment_behavior: 'allow_incomplete' = don't fail if payment issues

    await stripe.subscriptions.update(sub.id, {
      proration_behavior: 'none',
      billing_cycle_anchor: 'unchanged',
      payment_behavior: 'allow_incomplete',
      items: [{
        id: sub.subscription_item_id,
        price: sub.new_price_id,
      }],
      metadata: {
        migrated_from: sub.current_price_id,
        migration_date: new Date().toISOString(),
        migration_type: 'bubble_to_supabase'
      }
    });

    return { success: true, sub };
  } catch (error) {
    return { success: false, sub, error: error.message };
  }
}

async function main() {
  console.log('===========================================================');
  console.log('   STRIPE PRICE MIGRATION SCRIPT');
  console.log('===========================================================');
  console.log('   Mode: ' + (DRY_RUN ? 'DRY RUN (no changes)' : 'EXECUTE (will migrate!)'));
  console.log('   Rate: ' + Math.round(1000 / DELAY_BETWEEN_UPDATES_MS) + ' updates/sec');
  console.log('===========================================================\n');

  // Check if we have any migrations configured
  const configuredMigrations = Object.entries(PRICE_MIGRATIONS)
    .filter(([old, newId]) => newId !== null);

  if (configuredMigrations.length === 0 || SHOW_MAPPINGS) {
    console.log('No price migrations configured (or --show-prices flag used).\n');
    console.log('Scanning all subscription price IDs...\n');

    const { priceIdCounts, total } = await getAllPriceIds();

    console.log('PRICE ID                                  | $AMOUNT | INTERVAL | COUNT | STATUSES');
    console.log('-'.repeat(100));

    const sorted = Object.entries(priceIdCounts)
      .sort((a, b) => b[1].count - a[1].count);

    for (const [priceId, data] of sorted) {
      const statusStr = Object.entries(data.statuses)
        .map(([s, c]) => s + ':' + c)
        .join(', ');
      const amountStr = '$' + data.amount.toFixed(2);
      const intervalStr = data.interval || 'N/A';

      console.log(
        priceId.padEnd(42) + '| ' +
        amountStr.padStart(7) + ' | ' +
        intervalStr.padEnd(8) + ' | ' +
        String(data.count).padStart(5) + ' | ' +
        statusStr
      );
    }

    console.log('\nTotal subscriptions: ' + total);
    console.log('\n===========================================================');
    console.log('NEXT STEPS:');
    console.log('===========================================================');
    console.log('1. Edit this script and configure PRICE_MIGRATIONS object');
    console.log('   Map old price IDs to new price IDs:');
    console.log('   PRICE_MIGRATIONS = {');
    console.log('     "price_OLD_ID": "price_NEW_ID",');
    console.log('     "price_OLD_ID_2": "price_NEW_ID_2",');
    console.log('   }');
    console.log('2. Disable Stripe customer emails');
    console.log('3. Disable webhook endpoints');
    console.log('4. Run with no flags to preview migrations');
    console.log('5. Run with --execute to perform migrations');
    console.log('6. Re-enable webhooks and emails after completion');
    return;
  }

  console.log('CONFIGURED PRICE MIGRATIONS:\n');
  for (const [oldId, newId] of configuredMigrations) {
    console.log('   ' + oldId + ' -> ' + newId);
  }
  console.log('');

  // Get subscriptions to migrate
  const subscriptions = await getSubscriptionsForMigration();

  console.log('Found ' + subscriptions.length + ' subscriptions to migrate\n');

  if (subscriptions.length === 0) {
    console.log('No subscriptions found matching the configured price IDs.');
    console.log('(Note: Only active subscriptions are migrated)\n');
    return;
  }

  // Group by migration path
  const byPath = {};
  for (const sub of subscriptions) {
    const key = sub.current_price_id + ' -> ' + sub.new_price_id;
    if (!byPath[key]) byPath[key] = [];
    byPath[key].push(sub);
  }

  console.log('MIGRATION BREAKDOWN:\n');
  for (const [path, subs] of Object.entries(byPath)) {
    console.log('   ' + path + ': ' + subs.length + ' subscriptions');
  }

  const estimatedTime = Math.ceil(subscriptions.length * DELAY_BETWEEN_UPDATES_MS / 1000 / 60);
  console.log('\n   ESTIMATED TIME: ~' + estimatedTime + ' minutes\n');

  if (DRY_RUN) {
    console.log('===========================================================');
    console.log('   DRY RUN - Preview of migrations');
    console.log('===========================================================\n');

    console.log('Subscriptions that would be migrated:\n');
    const shown = subscriptions.slice(0, 20);
    for (const sub of shown) {
      let line = '   ' + sub.id + ' | ' +
        sub.customer_email.substring(0, 30).padEnd(30) + ' | ' +
        sub.status.padEnd(8) + ' | ' +
        'Next: ' + sub.next_billing;
      if (sub.discount_info) {
        line += ' | 💰 ' + sub.discount_info;
      }
      if (sub.trial_info) {
        line += ' | 🧪 ' + sub.trial_info;
      }
      if (sub.cancel_info) {
        line += ' | ⚠️  ' + sub.cancel_info;
      }
      console.log(line);
    }
    if (subscriptions.length > 20) {
      console.log('   ... and ' + (subscriptions.length - 20) + ' more');
    }

    console.log('\n===========================================================');
    console.log('   BILLING CYCLE PRESERVATION');
    console.log('===========================================================');
    console.log('   Each subscription will retain its current billing date.');
    console.log('   No prorations will be charged or credited.');
    console.log('   Example: If renewal is Jan 15, it stays Jan 15.');
    console.log('===========================================================\n');

    console.log('To execute, run with --execute flag');
    return;
  }

  // EXECUTE MODE
  console.log('===========================================================');
  console.log('   EXECUTING MIGRATIONS');
  console.log('===========================================================\n');
  console.log('(This will take ~' + estimatedTime + ' minutes)\n');

  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  const startTime = Date.now();

  for (let i = 0; i < subscriptions.length; i++) {
    const sub = subscriptions[i];
    const result = await migrateSubscription(sub);

    if (result.success) {
      successCount++;
    } else {
      errorCount++;
      errors.push(result);
    }

    const progress = Math.round(((i + 1) / subscriptions.length) * 100);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    process.stdout.write(
      '\r   Progress: ' + progress + '% | ' +
      'Migrated: ' + successCount + ' | ' +
      'Errors: ' + errorCount + ' | ' +
      'Time: ' + elapsed + 's   '
    );

    await sleep(DELAY_BETWEEN_UPDATES_MS);
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  console.log('\n\n===========================================================');
  console.log('   MIGRATION COMPLETE');
  console.log('===========================================================');
  console.log('   Successfully migrated: ' + successCount);
  console.log('   Errors: ' + errorCount);
  console.log('   Time elapsed: ' + totalTime + ' seconds');
  console.log('===========================================================\n');

  if (errors.length > 0) {
    console.log('Failed migrations:');
    errors.slice(0, 20).forEach(e => {
      console.log('   ' + e.sub.id + ' (' + e.sub.customer_email + '): ' + e.error);
    });
    if (errors.length > 20) {
      console.log('   ... and ' + (errors.length - 20) + ' more errors');
    }
  }

  console.log('\nDONT FORGET: Re-enable your webhook endpoints and customer emails!');
}

main().catch(console.error);
