import { UserRole } from '@/types/database.types'

/**
 * Display names for user roles
 * Database stores snake_case, UI displays Title Case
 */
export const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  admin: 'Admin',
  super_admin: 'Super Admin',
  member: 'Member',
  loan_officer: 'Loan Officer',
  broker_owner: 'Broker Owner',
  loan_officer_assistant: 'Loan Officer Assistant',
  processor: 'Processor',
  partner_lender: 'Partner Lender',
  partner_vendor: 'Partner Vendor',
}

/**
 * Get the display name for a role
 */
export function getRoleDisplayName(role?: UserRole | string): string {
  if (!role) return 'Member'
  return ROLE_DISPLAY_NAMES[role as UserRole] || role
}

/**
 * Admin roles that have access to the admin portal
 */
export const ADMIN_ROLES: UserRole[] = [
  'admin',
  'super_admin',
  'broker_owner',
  'partner_lender',
  'partner_vendor',
]

/**
 * Check if a role is an admin role
 */
export function isAdminRole(role?: UserRole | string): boolean {
  if (!role) return false
  return ADMIN_ROLES.includes(role as UserRole)
}
