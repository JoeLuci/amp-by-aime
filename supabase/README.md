# Database Setup Instructions

## Prerequisites
1. Go to your Supabase project: https://jrinrobepqsofuhjnxcp.supabase.co
2. Make sure your project is active (not paused)

## Step 1: Get Your API Keys
1. In Supabase dashboard, go to **Settings** → **API**
2. Copy the following values:
   - Project URL (already in `.env.local`)
   - `anon` `public` key → Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`

## Step 2: Run Migrations
Run these SQL migrations in order in the Supabase **SQL Editor**:

### Migration 1: Initial Schema
Open and run: `migrations/20250129_create_initial_schema.sql`

This creates:
- ENUM types for roles and plan tiers
- All database tables (profiles, resources, events, lenders, vendors, etc.)
- Indexes for performance
- Triggers for automatic `updated_at` timestamps

### Migration 2: RLS Policies
Open and run: `migrations/20250129_create_rls_policies.sql`

This creates:
- Row Level Security policies for all tables
- Plan-based and role-based access control
- Automatic profile creation trigger

### Migration 3: Storage Buckets
Open and run: `migrations/20250129_create_storage_buckets.sql`

This creates:
- Storage buckets for avatars, videos, PDFs, podcasts, logos
- Storage policies for file access control

## Step 3: Verify Setup
Run this query to verify everything is set up:

```sql
-- Check if tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE';

-- Check if storage buckets exist
SELECT * FROM storage.buckets;
```

You should see all tables and 8 storage buckets.

## Step 4: Configure Email Templates (Optional)
1. Go to **Authentication** → **Email Templates**
2. Customize the sign-up confirmation and password reset emails
3. Update the redirect URLs to match your domain

## Step 5: Configure Auth Settings
1. Go to **Authentication** → **URL Configuration**
2. Add your site URL: `http://localhost:3000` (for development)
3. Add redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/dashboard`

## Database Schema Overview

### User Management
- `profiles` - User profiles with roles and plan tiers
- `user_activity` - Track user actions and engagement

### Content Management
- `resources` - Videos, PDFs, podcasts, articles
- `categories` - Organize resources
- `tags` - Tag resources for filtering
- `resource_tags` - Many-to-many relationship

### Events & Community
- `events` - Webinars, conferences, training sessions

### Marketplace
- `lenders` - Partner lender directory
- `vendors` - Vendor marketplace

### Billing & Subscriptions
- `coupons` - Discount codes
- `coupon_redemptions` - Track coupon usage

### Support
- `support_tickets` - Help desk with GoHighLevel integration

## User Roles
- **Loan Officer** - Standard user
- **Broker Owner** - Admin with full access
- **Loan Officer Assistant** - Support role
- **Processor** - Processor-specific access
- **Partner Lender** - Can manage their lender listing
- **Partner Vendor** - Can manage their vendor listing

## Plan Tiers
- **Free** - Read-only access to Market and Lenders (for vendors/lenders)
- **Premium Guest** - 90-day trial with some limitations
- **Premium** - Full access tier 1
- **Elite** - Full access tier 2
- **VIP** - Full access tier 3
- **Premium Processor** - Processor version of Premium
- **Elite Processor** - Processor version of Elite
- **VIP Processor** - Processor version of VIP

## Next Steps
After completing database setup:
1. Update `.env.local` with your Supabase anon key
2. Get your Stripe API keys and add them to `.env.local`
3. Get your GoHighLevel API credentials and add them to `.env.local`
4. Run `npm run dev` to start the development server
