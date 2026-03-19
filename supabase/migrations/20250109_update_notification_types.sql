-- Update the notification type constraint to include new types
ALTER TABLE notifications
DROP CONSTRAINT IF EXISTS valid_type;

ALTER TABLE notifications
ADD CONSTRAINT valid_type CHECK (
  type = ANY (ARRAY[
    'info',
    'success',
    'warning',
    'error',
    'announcement',
    'lender',
    'vendor',
    'resource',
    'event',
    'update',
    'promotion',
    'custom'
  ])
);
