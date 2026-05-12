-- Capture UTM / referral attribution per user, sourced from the sign-up page.
-- Last-touch model: the value present when the user submits the sign-up form.
-- Stored as JSONB so we can add new fields (e.g. landing_path) without further
-- migrations. Existing RLS policies on `profiles` cover this column.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS attribution JSONB;

COMMENT ON COLUMN profiles.attribution IS
  'UTM / referral data captured at sign-up. Keys: utm_source, utm_medium, utm_campaign, utm_term, utm_content, landing_path, referrer, captured_at.';

CREATE INDEX IF NOT EXISTS idx_profiles_attribution_utm_source
  ON profiles ((attribution ->> 'utm_source'));
