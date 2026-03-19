import { redirect } from 'next/navigation'

export default function CouponsPage() {
  // Redirect to the new location under subscriptions
  redirect('/admin/subscriptions/coupons')
}
