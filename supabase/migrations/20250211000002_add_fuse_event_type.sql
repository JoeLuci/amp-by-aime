-- Migration: Add 'fuse' to event_type enum
-- Date: 2025-02-11
-- Purpose: Add fuse event type to match content_types table

-- Add 'fuse' to the event_type enum
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'fuse';

-- Note: The content_types table already has 'fuse' from the 20251109_add_dynamic_types_categories.sql migration
-- This migration ensures the legacy enum has the same value for backwards compatibility
