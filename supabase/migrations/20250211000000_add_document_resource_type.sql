-- Migration: Add missing types to resource_type enum
-- Date: 2025-02-11
-- Purpose: Add all content types from content_types table to the legacy enum for backwards compatibility

-- Add missing values to the resource_type enum (in alphabetical order after existing values)
-- Existing: video, pdf, podcast, article
-- Adding: blog, document, infographic, webinar

ALTER TYPE resource_type ADD VALUE IF NOT EXISTS 'blog';
ALTER TYPE resource_type ADD VALUE IF NOT EXISTS 'document';
ALTER TYPE resource_type ADD VALUE IF NOT EXISTS 'infographic';
ALTER TYPE resource_type ADD VALUE IF NOT EXISTS 'webinar';

-- Note: The content_types table already has these types from the 20251109_add_dynamic_types_categories.sql migration
-- This migration ensures the legacy enum column has all the same types for backwards compatibility
