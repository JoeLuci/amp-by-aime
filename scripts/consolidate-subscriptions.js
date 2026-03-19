/**
 * Consolidate Two Subscriptions Script
 *
 * This script consolidates 2 subscriptions into 1:
 * - Sub A: $100/month active subscription (will be canceled)
 * - Sub B: Trial subscription that becomes $199.99/mo VIP (will keep, add discount)
 *
 * Result: Single subscription at $100/mo until coupon expires, then $199.99/mo
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_xxx node scripts/consolidate-subscriptions.js --dry-run
 *   STRIPE_SECRET_KEY=sk_live_xxx node scripts/consolidate-subscriptions.js --execute
 */

const Stripe = require('stripe');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error('Error: STRIPE_SECRET_KEY environment variable required');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

// ============================================
// CONFIGURE: Subscription IDs
// ============================================
const SUB_A_PRICE_ID = 'price_1S163UKq6gZ6OHL8mgAmDFnX';  // $100/month price - TO BE CANCELED
const SUB_B_ID = 'sub_1S1677Kq6gZ6OHL8dWs0dOBT';          // Trial -> $199.99/mo VIP - TO KEEP

// Coupon config
const DISCOUNT_AMOUNT_OFF = 9999;  // $99.99 off in cents
const COUPON_EXPIRY_DATE = new Date('2026-01-21T00:00:00-05:00');  // Jan 21, 2026 EST

const DRY_RUN = !process.argv.includes('--execute');

function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  return new Date(timestamp * 1000).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }) + ' EST';
}

async function getSubscriptionDetails(subId) {
  const sub = await stripe.subscriptions.retrieve(subId, {
    expand: ['customer', 'items.data.price', 'discount']
  });

  const item = sub.items.data[0];
  const price = item?.price;

  return {
    id: sub.id,
    status: sub.status,
    customer_id: sub.customer?.id || sub.customer,
    customer_email: sub.customer?.email || 'N/A',
    price_id: price?.id,
    price_amount: price?.unit_amount ? (price.unit_amount / 100).toFixed(2) : 'N/A',
    price_nickname: price?.nickname || '',
    current_period_end: item?.current_period_end,
    trial_end: sub.trial_end,
    cancel_at: sub.cancel_at,
    cancel_at_period_end: sub.cancel_at_period_end,
    discount: sub.discount,
  };
}

async function main() {
  console.log('===========================================================');
  console.log('   SUBSCRIPTION CONSOLIDATION SCRIPT');
  console.log('===========================================================');
  console.log('   Mode: ' + (DRY_RUN ? 'DRY RUN (no changes)' : 'EXECUTE (will make changes!)'));
  console.log('===========================================================\n');

  // Fetch Sub B first to get customer ID
  console.log('Fetching subscription details...\n');

  let subA, subB, subAId;

  try {
    subB = await getSubscriptionDetails(SUB_B_ID);
    console.log('SUB B (to keep with discount):');
    console.log('   ID: ' + subB.id);
    console.log('   Status: ' + subB.status);
    console.log('   Customer: ' + subB.customer_email);
    console.log('   Price: $' + subB.price_amount + '/mo (' + subB.price_nickname + ')');
    if (subB.trial_end) console.log('   Trial Ends: ' + formatDate(subB.trial_end));
    console.log('   Next Billing: ' + formatDate(subB.current_period_end));
    if (subB.discount) {
      console.log('   Current Discount: ' + (subB.discount.coupon?.name || subB.discount.coupon?.id));
    }
    console.log('');
  } catch (e) {
    console.log('ERROR fetching Sub B: ' + e.message);
    process.exit(1);
  }

  // Find Sub A by price ID for the same customer
  console.log('Finding $100/month subscription by price ID...');
  try {
    const subs = await stripe.subscriptions.list({
      customer: subB.customer_id,
      price: SUB_A_PRICE_ID,
      status: 'active',
      limit: 1,
    });

    if (subs.data.length === 0) {
      console.log('ERROR: No active subscription found with price ' + SUB_A_PRICE_ID);
      process.exit(1);
    }

    subAId = subs.data[0].id;
    subA = await getSubscriptionDetails(subAId);
    console.log('');
    console.log('SUB A (to cancel):');
    console.log('   ID: ' + subA.id);
    console.log('   Status: ' + subA.status);
    console.log('   Customer: ' + subA.customer_email);
    console.log('   Price: $' + subA.price_amount + '/mo (' + subA.price_nickname + ')');
    console.log('   Next Billing: ' + formatDate(subA.current_period_end));
    if (subA.cancel_at) console.log('   Cancels At: ' + formatDate(subA.cancel_at));
    console.log('');
  } catch (e) {
    console.log('ERROR fetching Sub A: ' + e.message);
    process.exit(1);
  }

  console.log('-----------------------------------------------------------');
  console.log('PLAN:');
  console.log('-----------------------------------------------------------');
  console.log('1. Schedule Sub A ($' + subA.price_amount + '/mo) to cancel at period end');
  console.log('2. End trial on Sub B immediately (if applicable)');
  console.log('3. Create coupon: $' + (DISCOUNT_AMOUNT_OFF / 100).toFixed(2) + ' off');
  console.log('   Expires: ' + COUPON_EXPIRY_DATE.toLocaleDateString('en-US', { timeZone: 'America/New_York' }));
  console.log('4. Apply coupon to Sub B');
  console.log('');
  console.log('RESULT:');
  console.log('   Customer pays $' + ((parseFloat(subB.price_amount) * 100 - DISCOUNT_AMOUNT_OFF) / 100).toFixed(2) + '/mo until Jan 21, 2026');
  console.log('   Then pays full $' + subB.price_amount + '/mo');
  console.log('-----------------------------------------------------------\n');

  if (DRY_RUN) {
    console.log('===========================================================');
    console.log('   DRY RUN COMPLETE - No changes made');
    console.log('===========================================================');
    console.log('\nTo execute, run with --execute flag');
    return;
  }

  // EXECUTE
  console.log('EXECUTING...\n');

  // Step 1: Cancel Sub A at period end
  console.log('Step 1: Scheduling Sub A cancellation at period end...');
  try {
    await stripe.subscriptions.update(subAId, {
      cancel_at_period_end: true,
    });
    console.log('   Done - Sub A scheduled to cancel at period end\n');
  } catch (e) {
    // Check if it's managed by a schedule
    if (e.message.includes('subscription schedule')) {
      console.log('   Sub A is managed by a schedule, releasing it first...');
      const sub = await stripe.subscriptions.retrieve(subAId);
      if (sub.schedule) {
        await stripe.subscriptionSchedules.release(sub.schedule);
        console.log('   Schedule released, now canceling...');
        await stripe.subscriptions.update(subAId, {
          cancel_at_period_end: true,
        });
        console.log('   Done - Sub A scheduled to cancel at period end\n');
      }
    } else {
      console.log('   ERROR: ' + e.message);
      process.exit(1);
    }
  }

  // Step 2: End trial on Sub B (if in trial)
  if (subB.status === 'trialing' && subB.trial_end) {
    console.log('Step 2: Ending trial on Sub B...');
    try {
      await stripe.subscriptions.update(SUB_B_ID, {
        trial_end: 'now',
        proration_behavior: 'none',
      });
      console.log('   Done - Trial ended\n');
    } catch (e) {
      console.log('   ERROR: ' + e.message);
      // Continue anyway
    }
  } else {
    console.log('Step 2: Sub B not in trial, skipping...\n');
  }

  // Step 3: Create coupon
  console.log('Step 3: Creating coupon...');
  let coupon;
  try {
    // Calculate months from now until expiry date
    const now = new Date();
    const monthsUntilExpiry = Math.ceil(
      (COUPON_EXPIRY_DATE.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
    console.log('   Months until expiry: ' + monthsUntilExpiry);

    const couponId = 'migration_' + subB.customer_id.slice(-8) + '_' + Date.now();
    coupon = await stripe.coupons.create({
      id: couponId,
      amount_off: DISCOUNT_AMOUNT_OFF,
      currency: 'usd',
      duration: 'repeating',
      duration_in_months: monthsUntilExpiry,
      name: 'Migration Discount - ' + monthsUntilExpiry + ' months',
      metadata: {
        migration: 'true',
        original_sub: subAId,
        consolidated_sub: SUB_B_ID,
        expires: COUPON_EXPIRY_DATE.toISOString(),
      }
    });
    console.log('   Done - Coupon created: ' + coupon.id);
    console.log('   Duration: ' + monthsUntilExpiry + ' months\n');
  } catch (e) {
    console.log('   ERROR: ' + e.message);
    process.exit(1);
  }

  // Step 4: Apply coupon to Sub B
  console.log('Step 4: Applying coupon to Sub B...');
  try {
    await stripe.subscriptions.update(SUB_B_ID, {
      discounts: [{ coupon: coupon.id }],
    });
    console.log('   Done - Coupon applied\n');
  } catch (e) {
    console.log('   ERROR: ' + e.message);
    process.exit(1);
  }

  // Verify final state
  console.log('Verifying final state...\n');
  const finalSub = await getSubscriptionDetails(SUB_B_ID);

  console.log('===========================================================');
  console.log('   CONSOLIDATION COMPLETE');
  console.log('===========================================================');
  console.log('   Final Subscription: ' + finalSub.id);
  console.log('   Status: ' + finalSub.status);
  console.log('   Price: $' + finalSub.price_amount + '/mo');
  if (finalSub.discount) {
    const off = finalSub.discount.coupon?.amount_off;
    console.log('   Discount: -$' + (off / 100).toFixed(2));
    console.log('   Effective Price: $' + ((parseFloat(finalSub.price_amount) * 100 - off) / 100).toFixed(2) + '/mo');
    if (finalSub.discount.coupon?.redeem_by) {
      console.log('   Discount Expires: ' + formatDate(finalSub.discount.coupon.redeem_by));
    }
  }
  console.log('===========================================================\n');
}

main().catch(console.error);
