// Authentication utilities for Edge Functions

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface AuthenticatedUser {
  id: string
  email?: string
  [key: string]: any
}

/**
 * Authenticate user from Authorization header
 * Returns user object or throws error
 */
export async function authenticateUser(authHeader: string | null): Promise<AuthenticatedUser> {
  if (!authHeader) {
    throw new Error('Missing Authorization header')
  }

  const token = authHeader.replace('Bearer ', '')

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: {
        headers: { Authorization: authHeader }
      }
    }
  )

  const { data: { user }, error } = await supabaseClient.auth.getUser(token)

  if (error || !user) {
    throw new Error('Invalid or expired token')
  }

  return user
}

/**
 * Create authenticated Supabase client from Authorization header
 */
export function createAuthenticatedClient(authHeader: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: {
        headers: { Authorization: authHeader }
      }
    }
  )
}
