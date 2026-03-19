-- Drop existing user_activity table if it exists
DROP TABLE IF EXISTS user_activity CASCADE;

-- Create analytics_events table for tracking all user interactions
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Who performed the action
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  session_id TEXT, -- For anonymous tracking before login

  -- What action was performed
  event_type TEXT NOT NULL, -- 'view', 'click', 'download', 'contact', 'registration', etc.
  event_category TEXT NOT NULL, -- 'resource', 'vendor', 'lender', 'event'

  -- What content was interacted with
  content_id UUID NOT NULL, -- Reference to resources, vendors, lenders, events
  content_type TEXT NOT NULL, -- 'resource', 'vendor', 'lender', 'event'
  content_title TEXT, -- Denormalized for faster queries

  -- User context at time of event
  user_plan_tier plan_tier,
  user_role user_role,

  -- Additional metadata
  metadata JSONB DEFAULT '{}'::jsonb, -- Flexible for additional data

  -- Session tracking
  ip_address INET, -- For unique visitor tracking (hashed for privacy)
  user_agent TEXT,
  referrer TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_event_type CHECK (event_type IN (
    'view', 'click', 'download', 'contact', 'registration',
    'calendar_add', 'share', 'bookmark', 'play', 'complete'
  )),
  CONSTRAINT valid_content_type CHECK (content_type IN (
    'resource', 'vendor', 'lender', 'event'
  ))
);

-- Indexes for performance
CREATE INDEX idx_analytics_events_user_id ON analytics_events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_analytics_events_content ON analytics_events(content_type, content_id);
CREATE INDEX idx_analytics_events_created_at ON analytics_events(created_at DESC);
CREATE INDEX idx_analytics_events_event_type ON analytics_events(event_type, created_at DESC);
CREATE INDEX idx_analytics_events_user_plan ON analytics_events(user_plan_tier, created_at DESC);

-- Composite indexes for common queries
CREATE INDEX idx_analytics_events_content_created ON analytics_events(content_id, created_at DESC);
CREATE INDEX idx_analytics_events_user_created ON analytics_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- GIN index for metadata queries
CREATE INDEX idx_analytics_events_metadata ON analytics_events USING GIN (metadata);

COMMENT ON TABLE analytics_events IS 'Central event tracking table for all user interactions';
COMMENT ON COLUMN analytics_events.session_id IS 'Anonymous session tracking before user authentication';
COMMENT ON COLUMN analytics_events.ip_address IS 'Hashed IP for unique visitor counting (GDPR compliant)';
