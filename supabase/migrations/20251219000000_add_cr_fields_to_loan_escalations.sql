-- Add CR Number and CR Date fields to loan_escalations table
-- These fields are specific to United Wholesale Mortgage (UWM) escalations

ALTER TABLE public.loan_escalations
ADD COLUMN cr_number text,
ADD COLUMN cr_date date;

-- Add comments for clarity
COMMENT ON COLUMN public.loan_escalations.cr_number IS 'CR Number - specific to UWM escalations';
COMMENT ON COLUMN public.loan_escalations.cr_date IS 'CR Date - specific to UWM escalations';
