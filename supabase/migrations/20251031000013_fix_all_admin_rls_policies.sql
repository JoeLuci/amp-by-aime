-- Fix all admin RLS policies to use is_admin flag and security definer function

-- First, ensure the is_admin function exists and uses the correct check
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id
    AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Resources
DROP POLICY IF EXISTS "Admins can manage resources" ON public.resources;
CREATE POLICY "Admins can manage resources"
ON public.resources FOR ALL TO public
USING (public.is_admin(auth.uid()));

-- Events
DROP POLICY IF EXISTS "Admins can manage events" ON public.events;
CREATE POLICY "Admins can manage events"
ON public.events FOR ALL TO public
USING (public.is_admin(auth.uid()));

-- Lenders
DROP POLICY IF EXISTS "Admins can manage lenders" ON public.lenders;
CREATE POLICY "Admins can manage lenders"
ON public.lenders FOR ALL TO public
USING (public.is_admin(auth.uid()));

-- Vendors
DROP POLICY IF EXISTS "Admins can manage vendors" ON public.vendors;
CREATE POLICY "Admins can manage vendors"
ON public.vendors FOR ALL TO public
USING (public.is_admin(auth.uid()));

-- Tags
DROP POLICY IF EXISTS "Admins can manage tags" ON public.tags;
CREATE POLICY "Admins can manage tags"
ON public.tags FOR ALL TO public
USING (public.is_admin(auth.uid()));

-- Profiles (view all)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT TO public
USING (public.is_admin(auth.uid()));

-- Profiles (update all)
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
ON public.profiles FOR UPDATE TO public
USING (public.is_admin(auth.uid()));

-- Profiles (insert)
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
CREATE POLICY "Admins can insert profiles"
ON public.profiles FOR INSERT TO public
WITH CHECK (public.is_admin(auth.uid()));

-- Coupons (view)
DROP POLICY IF EXISTS "Admins can view coupons" ON public.coupons;
CREATE POLICY "Admins can view coupons"
ON public.coupons FOR SELECT TO public
USING (public.is_admin(auth.uid()));

-- Coupons (manage)
DROP POLICY IF EXISTS "Admins can manage coupons" ON public.coupons;
CREATE POLICY "Admins can manage coupons"
ON public.coupons FOR ALL TO public
USING (public.is_admin(auth.uid()));

-- Coupon Redemptions (view all)
DROP POLICY IF EXISTS "Admins can view all redemptions" ON public.coupon_redemptions;
CREATE POLICY "Admins can view all redemptions"
ON public.coupon_redemptions FOR SELECT TO public
USING (public.is_admin(auth.uid()));

-- Support Tickets (view all)
DROP POLICY IF EXISTS "Admins can view all tickets" ON public.support_tickets;
CREATE POLICY "Admins can view all tickets"
ON public.support_tickets FOR SELECT TO public
USING (public.is_admin(auth.uid()));

-- Support Tickets (update all)
DROP POLICY IF EXISTS "Admins can update all tickets" ON public.support_tickets;
CREATE POLICY "Admins can update all tickets"
ON public.support_tickets FOR UPDATE TO public
USING (public.is_admin(auth.uid()));

-- User Activity (view all)
DROP POLICY IF EXISTS "Admins can view all activity" ON public.user_activity;
CREATE POLICY "Admins can view all activity"
ON public.user_activity FOR SELECT TO public
USING (public.is_admin(auth.uid()));

-- Resource Tags
DROP POLICY IF EXISTS "Admins can manage resource tags" ON public.resource_tags;
CREATE POLICY "Admins can manage resource tags"
ON public.resource_tags FOR ALL TO public
USING (public.is_admin(auth.uid()));
