const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const OLD_PRICE_ID = 'price_1Q81xXKq6gZ6OHL8icnvuxdp';
const NEW_PRICE_ID = 'price_1RhZVyKq6gZ6OHL8e5GtRB3r';
const DISCOUNT_AMOUNT = 5000;  // $50.00 in cents

const DRY_RUN = !process.argv.includes('--execute');

async function run() {
  // Find subscriptions with this price
  const subs = await stripe.subscriptions.list({
    price: OLD_PRICE_ID,
    status: 'all',
    expand: ['data.customer', 'data.items.data.price'],
    limit: 100,
  });

  const eligible = subs.data.filter(s => ['active', 'trialing', 'past_due'].includes(s.status));

  console.log('Found ' + eligible.length + ' subscription(s) to migrate:\n');

  for (const sub of eligible) {
    const item = sub.items.data[0];
    console.log('  ' + sub.id);
    console.log('    Customer: ' + (sub.customer?.email || sub.customer));
    console.log('    Status: ' + sub.status);
    console.log('    Current Price: $' + (item.price.unit_amount / 100).toFixed(2));
    console.log('');
  }

  // Get new price details
  const newPrice = await stripe.prices.retrieve(NEW_PRICE_ID);
  console.log('New Price: $' + (newPrice.unit_amount / 100).toFixed(2) + '/' + newPrice.recurring.interval);
  console.log('Discount: -$' + (DISCOUNT_AMOUNT / 100).toFixed(2));
  console.log('Effective: $' + ((newPrice.unit_amount - DISCOUNT_AMOUNT) / 100).toFixed(2) + '/' + newPrice.recurring.interval);
  console.log('');

  if (DRY_RUN) {
    console.log('DRY RUN - no changes made');
    console.log('Run with --execute to apply');
    return;
  }

  // Create coupon (repeating for 100 years since forever not allowed with amount_off)
  const couponId = 'migration_' + (DISCOUNT_AMOUNT/100) + 'off_' + Date.now();
  const coupon = await stripe.coupons.create({
    id: couponId,
    amount_off: DISCOUNT_AMOUNT,
    currency: 'usd',
    duration: 'repeating',
    duration_in_months: 1200,  // 100 years
    name: 'Migration Discount $' + (DISCOUNT_AMOUNT/100) + ' off',
  });
  console.log('Created coupon: ' + coupon.id + '\n');

  // Migrate each subscription
  for (const sub of eligible) {
    const item = sub.items.data[0];
    try {
      await stripe.subscriptions.update(sub.id, {
        items: [{
          id: item.id,
          price: NEW_PRICE_ID,
        }],
        discounts: [{ coupon: coupon.id }],
        proration_behavior: 'none',
        billing_cycle_anchor: 'unchanged',
      });
      console.log('Migrated: ' + sub.id + ' (' + sub.customer?.email + ')');
    } catch (e) {
      console.log('Failed: ' + sub.id + ' - ' + e.message);
    }
  }

  console.log('\nDone!');
}

run().catch(console.error);
