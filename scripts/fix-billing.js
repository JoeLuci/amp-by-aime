const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SUB_ID = 'sub_1S1677Kq6gZ6OHL8dWs0dOBT';
const COUPON_ID = 'migration_DQpJc5Pk_1765187322896';
const jan21 = Math.floor(new Date('2026-01-21T00:00:00-05:00').getTime() / 1000);

stripe.subscriptions.update(SUB_ID, {
  billing_cycle_anchor: jan21,
  proration_behavior: 'none',
  discounts: [{ coupon: COUPON_ID }]
}).then(function(s) {
  console.log('Done');
  console.log('Next billing:', new Date(s.items.data[0].current_period_end * 1000).toLocaleString('en-US', {timeZone: 'America/New_York'}), 'EST');
  console.log('Discount:', s.discount ? s.discount.coupon.id : 'none');
}).catch(function(e) {
  console.log('Error:', e.message);
});
