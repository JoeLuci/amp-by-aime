-- Add universal tags support for vendors, lenders, and events
-- Tags are used to improve searchability across all content types

-- Create vendor_tags junction table
CREATE TABLE IF NOT EXISTS vendor_tags (
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (vendor_id, tag_id)
);

-- Create lender_tags junction table
CREATE TABLE IF NOT EXISTS lender_tags (
  lender_id UUID REFERENCES lenders(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (lender_id, tag_id)
);

-- Create event_tags junction table
CREATE TABLE IF NOT EXISTS event_tags (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, tag_id)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_vendor_tags_vendor_id ON vendor_tags(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_tags_tag_id ON vendor_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_lender_tags_lender_id ON lender_tags(lender_id);
CREATE INDEX IF NOT EXISTS idx_lender_tags_tag_id ON lender_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_event_tags_event_id ON event_tags(event_id);
CREATE INDEX IF NOT EXISTS idx_event_tags_tag_id ON event_tags(tag_id);

-- Add comments
COMMENT ON TABLE vendor_tags IS 'Junction table linking vendors to tags for improved searchability';
COMMENT ON TABLE lender_tags IS 'Junction table linking lenders to tags for improved searchability';
COMMENT ON TABLE event_tags IS 'Junction table linking events to tags for improved searchability';
