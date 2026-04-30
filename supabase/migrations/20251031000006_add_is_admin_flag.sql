-- Add is_admin flag to profiles table
-- This separates AIME team admins from regular client users

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false NOT NULL;

-- Create index for faster admin checks
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_admin) WHERE is_admin = true;

-- Add comment
COMMENT ON COLUMN public.profiles.is_admin IS 'Flag indicating if user is an AIME team admin (not a client)';
