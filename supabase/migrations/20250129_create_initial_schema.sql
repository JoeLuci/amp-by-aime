-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ENUM types for roles and plan tiers
CREATE TYPE user_role AS ENUM (
  'Loan Officer',
  'Broker Owner',
  'Loan Officer Assistant',
  'Processor',
  'Partner Lender',
  'Partner Vendor'
);

CREATE TYPE plan_tier AS ENUM (
  'Free',
  'Premium Guest',
  'Premium',
  'Elite',
  'VIP',
  'Premium Processor',
  'Elite Processor',
  'VIP Processor'
);

CREATE TYPE resource_type AS ENUM (
  'video',
  'pdf',
  'podcast',
  'article'
);

CREATE TYPE event_type AS ENUM (
  'webinar',
  'conference',
  'training',
  'networking',
  'other'
);

-- Create profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role user_role NOT NULL DEFAULT 'Loan Officer',
  plan_tier plan_tier NOT NULL DEFAULT 'Free',
  avatar_url TEXT,
  phone TEXT,
  company TEXT,

  -- Stripe integration
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  subscription_status TEXT,

  -- Trial tracking for Premium Guest
  trial_start_date TIMESTAMPTZ,
  trial_end_date TIMESTAMPTZ,

  -- Assigned Account Executive
  assigned_ae TEXT,
  assigned_ae_email TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create categories table
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create tags table
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT '#20adce',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create resources table (videos, PDFs, podcasts, articles)
CREATE TABLE resources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  content TEXT,

  -- Resource specifics
  resource_type resource_type NOT NULL,
  thumbnail_url TEXT,
  file_url TEXT, -- For PDFs and podcasts
  video_url TEXT, -- YouTube embed URL
  duration INTEGER, -- in seconds for videos/podcasts

  -- Access control
  required_plan_tier plan_tier[] DEFAULT ARRAY['Premium', 'Elite', 'VIP', 'Premium Processor', 'Elite Processor', 'VIP Processor']::plan_tier[],

  -- Organization
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  is_featured BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,

  -- SEO and metadata
  views_count INTEGER DEFAULT 0,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Create resource_tags junction table
CREATE TABLE resource_tags (
  resource_id UUID REFERENCES resources(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (resource_id, tag_id)
);

-- Create events table
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  event_type event_type NOT NULL DEFAULT 'webinar',

  -- Date and time
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  timezone TEXT DEFAULT 'America/New_York',

  -- Location (can be virtual or physical)
  location TEXT,
  is_virtual BOOLEAN DEFAULT true,
  meeting_url TEXT,

  -- Registration
  registration_url TEXT,
  max_attendees INTEGER,
  current_attendees INTEGER DEFAULT 0,

  -- Access control
  required_plan_tier plan_tier[] DEFAULT ARRAY['Premium', 'Elite', 'VIP', 'Premium Processor', 'Elite Processor', 'VIP Processor']::plan_tier[],

  -- Metadata
  thumbnail_url TEXT,
  is_featured BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Create lenders table
CREATE TABLE lenders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  description TEXT,
  website_url TEXT,

  -- Contact info
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,

  -- Categorization
  lender_type TEXT, -- 'wholesale', 'correspondent', 'portfolio'
  states_served TEXT[], -- Array of state abbreviations

  -- Features and products
  features TEXT[],
  products TEXT[],

  -- Display
  badge_color TEXT DEFAULT '#20adce',
  display_order INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create vendors table (for Market page)
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  description TEXT,
  website_url TEXT,

  -- Contact info
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,

  -- Categorization
  vendor_category TEXT, -- 'CRM', 'Marketing', 'Technology', etc.

  -- Features
  features TEXT[],
  pricing_info TEXT,

  -- Display
  badge_color TEXT DEFAULT '#dd1969',
  display_order INTEGER DEFAULT 0,
  is_core_partner BOOLEAN DEFAULT false,
  is_affiliate BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create coupons table
CREATE TABLE coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  description TEXT,

  -- Discount details
  discount_type TEXT NOT NULL, -- 'percentage', 'fixed_amount', 'trial_extension'
  discount_value NUMERIC,

  -- Usage limits
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  max_uses_per_user INTEGER DEFAULT 1,

  -- Validity
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,

  -- Applicable plans
  applicable_plans plan_tier[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Create coupon_redemptions table
CREATE TABLE coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coupon_id UUID REFERENCES coupons(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(coupon_id, user_id)
);

-- Create support_tickets table (for GoHighLevel integration)
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT,
  priority TEXT DEFAULT 'medium',

  -- GoHighLevel integration
  ghl_contact_id TEXT,
  ghl_opportunity_id TEXT,
  ghl_pipeline_id TEXT,
  ghl_stage_id TEXT,

  -- Status tracking
  status TEXT DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Create user_activity table (for tracking views, downloads, etc.)
CREATE TABLE user_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL, -- 'view_resource', 'download_pdf', 'watch_video', etc.
  resource_id UUID REFERENCES resources(id) ON DELETE CASCADE,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_plan_tier ON profiles(plan_tier);
CREATE INDEX idx_profiles_stripe_customer ON profiles(stripe_customer_id);
CREATE INDEX idx_resources_type ON resources(resource_type);
CREATE INDEX idx_resources_category ON resources(category_id);
CREATE INDEX idx_resources_featured ON resources(is_featured);
CREATE INDEX idx_resources_published ON resources(is_published) WHERE is_published = true;
CREATE INDEX idx_events_start_date ON events(start_date);
CREATE INDEX idx_events_published ON events(is_published) WHERE is_published = true;
CREATE INDEX idx_lenders_active ON lenders(is_active) WHERE is_active = true;
CREATE INDEX idx_vendors_active ON vendors(is_active) WHERE is_active = true;
CREATE INDEX idx_user_activity_user ON user_activity(user_id);
CREATE INDEX idx_user_activity_resource ON user_activity(resource_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON resources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lenders_updated_at BEFORE UPDATE ON lenders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
