-- Performance optimization indexes for 10K+ users
-- These indexes significantly improve query performance
-- Note: CONCURRENTLY removed for transaction compatibility

-- Enable pg_trgm extension for fuzzy search first
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Profiles table indexes
CREATE INDEX IF NOT EXISTS idx_profiles_escalations_remaining
  ON profiles(escalations_remaining)
  WHERE escalations_remaining > 0;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription
  ON profiles(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_assigned_ae
  ON profiles(assigned_ae)
  WHERE assigned_ae IS NOT NULL;

-- User notifications table indexes (user_notifications junction table)
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_read
  ON user_notifications(user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON user_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
  ON user_notifications(user_id)
  WHERE is_read = false;

-- Opportunity tables indexes (lender_connections, vendor_connections, etc. already have indexes in their creation migration)

-- Resources table composite indexes
CREATE INDEX IF NOT EXISTS idx_resources_published_featured_created
  ON resources(is_published, is_featured, created_at DESC)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_resources_type_published
  ON resources(resource_type, is_published)
  WHERE is_published = true;

-- Events table composite indexes
CREATE INDEX IF NOT EXISTS idx_events_published_start_asc
  ON events(is_published, start_date ASC)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_events_featured_published
  ON events(is_featured, is_published, start_date)
  WHERE is_featured = true AND is_published = true;

-- Lenders table composite indexes
CREATE INDEX IF NOT EXISTS idx_lenders_active_featured_order
  ON lenders(is_active, is_featured, display_order)
  WHERE is_active = true;

-- Vendors table composite indexes
CREATE INDEX IF NOT EXISTS idx_vendors_active_featured_order
  ON vendors(is_active, is_core_partner, display_order)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_vendors_category_active
  ON vendors(vendor_category, is_active)
  WHERE is_active = true;

-- User activity table indexes for analytics
CREATE INDEX IF NOT EXISTS idx_user_activity_created_desc
  ON user_activity(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_type_created
  ON user_activity(activity_type, created_at DESC);

-- Support tickets indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status
  ON support_tickets(user_id, status)
  WHERE status != 'closed';

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created
  ON support_tickets(status, created_at DESC);

-- Text search indexes for better search performance
CREATE INDEX IF NOT EXISTS idx_resources_title_trgm
  ON resources USING gin(title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_lenders_name_trgm
  ON lenders USING gin(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_vendors_name_trgm
  ON vendors USING gin(name gin_trgm_ops);

-- Add statistics for better query planning
ANALYZE profiles;
ANALYZE resources;
ANALYZE events;
ANALYZE lenders;
ANALYZE vendors;
ANALYZE notifications;
ANALYZE user_notifications;
ANALYZE lender_connections;
ANALYZE vendor_connections;
ANALYZE change_ae_requests;
ANALYZE loan_escalations;
