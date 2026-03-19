-- Rename borrower_location to subject_property_state in loan_escalations table
-- This reflects that the field captures the property location, not the borrower's residence

ALTER TABLE public.loan_escalations
RENAME COLUMN borrower_location TO subject_property_state;

-- Add comment for clarity
COMMENT ON COLUMN public.loan_escalations.subject_property_state IS 'State where the subject property is located';
