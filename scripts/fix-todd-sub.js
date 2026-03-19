const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SUB_ID = 'sub_1MROYKKq6gZ6OHL8inh5PTBG';
const NEW_PRICE_ID = 'price_1PtZwTKq6gZ6OHL8zRSVLHKi';  // VIP Annual

const DRY_RUN = !process.argv.includes('--execute');

async function run() {
  // Get current subscription details
  const sub = await stripe.subscriptions.retrieve(SUB_ID, {
    expand: ['items.data.price', 'customer']
  });

  const item = sub.items.data[0];
  const currentPeriodEnd = item.current_period_end;

  console.log('Current subscription:');
  console.log('  Customer:', sub.customer.email);
  console.log('  Price:', item.price.id);
  console.log('  Amount: $' + (item.price.unit_amount / 100).toFixed(2));
  console.log('  Interval:', item.price.recurring.interval);
  console.log('  Next billing:', new Date(currentPeriodEnd * 1000).toLocaleString('en-US', {timeZone: 'America/New_York'}), 'EST');
  console.log('');

  // Get new price details
  const newPrice = await stripe.prices.retrieve(NEW_PRICE_ID);
  console.log('New price:');
  console.log('  ID:', newPrice.id);
  console.log('  Amount: $' + (newPrice.unit_amount / 100).toFixed(2));
  console.log('  Interval:', newPrice.recurring.interval);
  console.log('');

  console.log('Plan:');
  console.log('  1. Switch to annual price');
  console.log('  2. Set trial_end to current period end (no charge until then)');
  console.log('  3. First annual charge on:', new Date(currentPeriodEnd * 1000).toLocaleString('en-US', {timeZone: 'America/New_York'}), 'EST');
  console.log('');

  if (DRY_RUN) {
    console.log('DRY RUN - no changes made');
    console.log('Run with --execute to apply');
    return;
  }

  // Update subscription
  const updated = await stripe.subscriptions.update(SUB_ID, {
    items: [{
      id: item.id,
      price: NEW_PRICE_ID,
    }],
    trial_end: currentPeriodEnd,
    proration_behavior: 'none',
  });

  console.log('Done!');
  console.log('New status:', updated.status);
  console.log('Trial ends:', new Date(updated.trial_end * 1000).toLocaleString('en-US', {timeZone: 'America/New_York'}), 'EST');
}

run().catch(console.error);
