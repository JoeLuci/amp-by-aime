-- Add visibility fields for role and plan access to all content tables

-- Resources table: Add role visibility (plan already exists as required_plan_tier)
ALTER TABLE public.resources
ADD COLUMN IF NOT EXISTS user_role_access user_role[] DEFAULT NULL;

COMMENT ON COLUMN public.resources.user_role_access IS 'Array of user roles that can access this resource. NULL means all roles can access.';

-- Events table: Already has required_plan_tier, add role visibility
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS user_role_access user_role[] DEFAULT NULL;

COMMENT ON COLUMN public.events.user_role_access IS 'Array of user roles that can access this event. NULL means all roles can access.';

-- Lenders table: Add both role and plan visibility
ALTER TABLE public.lenders
ADD COLUMN IF NOT EXISTS user_role_access user_role[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS required_plan_tier plan_tier[] DEFAULT NULL;

COMMENT ON COLUMN public.lenders.user_role_access IS 'Array of user roles that can access this lender. NULL means all roles can access.';
COMMENT ON COLUMN public.lenders.required_plan_tier IS 'Array of plan tiers that can access this lender. NULL means all plans can access.';

-- Vendors table: Add both role and plan visibility
ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS user_role_access user_role[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS required_plan_tier plan_tier[] DEFAULT NULL;

COMMENT ON COLUMN public.vendors.user_role_access IS 'Array of user roles that can access this vendor. NULL means all roles can access.';
COMMENT ON COLUMN public.vendors.required_plan_tier IS 'Array of plan tiers that can access this vendor. NULL means all plans can access.';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_resources_user_role_access ON public.resources USING GIN (user_role_access);
CREATE INDEX IF NOT EXISTS idx_events_user_role_access ON public.events USING GIN (user_role_access);
CREATE INDEX IF NOT EXISTS idx_lenders_user_role_access ON public.lenders USING GIN (user_role_access);
CREATE INDEX IF NOT EXISTS idx_lenders_required_plan_tier ON public.lenders USING GIN (required_plan_tier);
CREATE INDEX IF NOT EXISTS idx_vendors_user_role_access ON public.vendors USING GIN (user_role_access);
CREATE INDEX IF NOT EXISTS idx_vendors_required_plan_tier ON public.vendors USING GIN (required_plan_tier);
