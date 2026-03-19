-- Recreate user_role_access columns after role enum was dropped and recreated
-- The previous DROP TYPE user_role CASCADE removed these columns

-- Add user_role_access columns back to all tables
ALTER TABLE public.resources
ADD COLUMN IF NOT EXISTS user_role_access user_role[] DEFAULT NULL;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS user_role_access user_role[] DEFAULT NULL;

ALTER TABLE public.lenders
ADD COLUMN IF NOT EXISTS user_role_access user_role[] DEFAULT NULL;

ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS user_role_access user_role[] DEFAULT NULL;

-- Add comments
COMMENT ON COLUMN public.resources.user_role_access IS 'Array of user roles that can access this resource. NULL means all roles can access.';
COMMENT ON COLUMN public.events.user_role_access IS 'Array of user roles that can access this event. NULL means all roles can access.';
COMMENT ON COLUMN public.lenders.user_role_access IS 'Array of user roles that can access this lender. NULL means all roles can access.';
COMMENT ON COLUMN public.vendors.user_role_access IS 'Array of user roles that can access this vendor. NULL means all roles can access.';

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_resources_user_role_access ON public.resources USING GIN (user_role_access);
CREATE INDEX IF NOT EXISTS idx_events_user_role_access ON public.events USING GIN (user_role_access);
CREATE INDEX IF NOT EXISTS idx_lenders_user_role_access ON public.lenders USING GIN (user_role_access);
CREATE INDEX IF NOT EXISTS idx_vendors_user_role_access ON public.vendors USING GIN (user_role_access);
