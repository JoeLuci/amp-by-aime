-- Add 'admin' and 'super_admin' to the user_role ENUM
-- This allows for clearer separation of admin roles from business roles

-- Add the new values to the enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Comment to document the roles
COMMENT ON TYPE user_role IS
'User roles in the system:
- super_admin: Can create/manage admins and has full system access
- admin: Can manage platform content but cannot create other admins
- Broker Owner: Business owner role
- Loan Officer: Standard loan officer
- Loan Officer Assistant: Assists loan officers
- Processor: Loan processor
- Partner Lender: External lender partner
- Partner Vendor: External vendor partner';
