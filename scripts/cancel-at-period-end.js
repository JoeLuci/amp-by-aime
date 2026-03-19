const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_ID = 'price_1LMBSiKq6gZ6OHL8dzBjFgJC';
const DRY_RUN = !process.argv.includes('--execute');

async function run() {
  console.log('Finding subscriptions with price: ' + PRICE_ID + '\n');

  // Get all statuses
  const allSubs = [];
  for (const status of ['active', 'trialing', 'past_due']) {
    const subs = await stripe.subscriptions.list({
      price: PRICE_ID,
      status: status,
      expand: ['data.customer', 'data.items.data.price'],
      limit: 100,
    });
    allSubs.push(...subs.data);
  }
  const subs = { data: allSubs };

  console.log('Found ' + subs.data.length + ' active subscription(s):\n');

  for (const sub of subs.data) {
    const item = sub.items.data[0];
    const periodEnd = new Date(item.current_period_end * 1000).toLocaleString('en-US', {timeZone: 'America/New_York'});
    console.log('  ' + sub.id);
    console.log('    Customer: ' + (sub.customer?.email || sub.customer));
    console.log('    Price: $' + (item.price.unit_amount / 100).toFixed(2));
    console.log('    Cancels at: ' + periodEnd + ' EST');
    console.log('');
  }

  if (DRY_RUN) {
    console.log('DRY RUN - no changes made');
    console.log('Run with --execute to cancel at period end');
    return;
  }

  console.log('Scheduling cancellations...\n');

  for (const sub of subs.data) {
    try {
      await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: true,
      });
      console.log('Scheduled: ' + sub.id + ' (' + sub.customer?.email + ')');
    } catch (e) {
      console.log('Failed: ' + sub.id + ' - ' + e.message);
    }
  }

  console.log('\nDone!');
}

run().catch(console.error);
