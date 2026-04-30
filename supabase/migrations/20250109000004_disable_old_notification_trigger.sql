-- CRITICAL FIX: Remove old trigger that creates notifications for ALL users
-- This trigger conflicts with the new targeted notification system that filters by roles/tiers

-- Drop the old trigger
DROP TRIGGER IF EXISTS on_notification_created ON public.notifications;

-- Drop the old function
DROP FUNCTION IF EXISTS public.create_user_notifications_for_all();
