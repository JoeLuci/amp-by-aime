-- Migration: Add recurrence support to events
-- Date: 2025-02-11
-- Purpose: Allow events to be recurring with RRULE support

-- Add recurrence fields to events table
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS recurrence_rule TEXT NULL,
ADD COLUMN IF NOT EXISTS recurrence_end_date TIMESTAMP WITH TIME ZONE NULL;

-- Add comments for clarity
COMMENT ON COLUMN public.events.is_recurring IS 'Whether this event repeats on a schedule';
COMMENT ON COLUMN public.events.recurrence_rule IS 'iCalendar RRULE format (e.g., FREQ=WEEKLY;BYDAY=MO for every Monday)';
COMMENT ON COLUMN public.events.recurrence_end_date IS 'Optional end date for recurring series';

-- Examples of recurrence_rule values:
-- Daily: FREQ=DAILY
-- Weekly on Mondays: FREQ=WEEKLY;BYDAY=MO
-- Monthly on 1st: FREQ=MONTHLY;BYMONTHDAY=1
-- Every 2 weeks: FREQ=WEEKLY;INTERVAL=2
-- First Monday of month: FREQ=MONTHLY;BYDAY=1MO
