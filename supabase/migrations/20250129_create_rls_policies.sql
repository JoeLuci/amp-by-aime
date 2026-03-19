-- Enable Row Level Security on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

CREATE POLICY "Admins can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- Categories policies (public read, admin write)
CREATE POLICY "Anyone can view active categories"
  ON categories FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage categories"
  ON categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- Tags policies (public read, admin write)
CREATE POLICY "Anyone can view tags"
  ON tags FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage tags"
  ON tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- Resources policies (plan-based access)
CREATE POLICY "Users can view resources based on their plan"
  ON resources FOR SELECT
  USING (
    is_published = true
    AND (
      -- Check if user's plan is in the required_plan_tier array
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND plan_tier = ANY(required_plan_tier)
      )
      -- Or if user is an admin
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('Broker Owner')
      )
    )
  );

CREATE POLICY "Admins can manage resources"
  ON resources FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- Resource tags policies
CREATE POLICY "Users can view resource tags"
  ON resource_tags FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage resource tags"
  ON resource_tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- Events policies (plan-based access)
CREATE POLICY "Users can view events based on their plan"
  ON events FOR SELECT
  USING (
    is_published = true
    AND (
      -- Check if user's plan is in the required_plan_tier array
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND plan_tier = ANY(required_plan_tier)
      )
      -- Or if user is an admin
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('Broker Owner')
      )
    )
  );

CREATE POLICY "Admins can manage events"
  ON events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- Lenders policies (authenticated users can view, Partner Lenders can edit their own)
CREATE POLICY "Authenticated users can view active lenders"
  ON lenders FOR SELECT
  USING (is_active = true AND auth.uid() IS NOT NULL);

CREATE POLICY "Partner Lenders can update their own listing"
  ON lenders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'Partner Lender'
      AND email = lenders.contact_email
    )
  );

CREATE POLICY "Admins can manage lenders"
  ON lenders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- Vendors policies (authenticated users can view, Partner Vendors can edit their own)
CREATE POLICY "Authenticated users can view active vendors"
  ON vendors FOR SELECT
  USING (is_active = true AND auth.uid() IS NOT NULL);

CREATE POLICY "Partner Vendors can update their own listing"
  ON vendors FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'Partner Vendor'
      AND email = vendors.contact_email
    )
  );

CREATE POLICY "Admins can manage vendors"
  ON vendors FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- Coupons policies (admin only)
CREATE POLICY "Admins can view coupons"
  ON coupons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

CREATE POLICY "Admins can manage coupons"
  ON coupons FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- Coupon redemptions policies
CREATE POLICY "Users can view their own redemptions"
  ON coupon_redemptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create redemptions"
  ON coupon_redemptions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all redemptions"
  ON coupon_redemptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- Support tickets policies
CREATE POLICY "Users can view their own tickets"
  ON support_tickets FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create tickets"
  ON support_tickets FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own tickets"
  ON support_tickets FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all tickets"
  ON support_tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

CREATE POLICY "Admins can update all tickets"
  ON support_tickets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- User activity policies
CREATE POLICY "Users can view their own activity"
  ON user_activity FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can log their own activity"
  ON user_activity FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all activity"
  ON user_activity FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', '')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile automatically
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
