import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateAdminRequest {
  first_name: string
  last_name: string
  email: string
  phone?: string
  role: 'admin' | 'super_admin'
  password: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the authorization header to verify the request is from an authenticated user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Create regular client to verify the caller's permissions
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    )

    // Verify the caller is authenticated and is a super admin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if caller is a super admin
    const { data: callerProfile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role, is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !callerProfile?.is_admin || callerProfile.role !== 'super_admin') {
      return new Response(
        JSON.stringify({ error: 'Only super admins can create admin users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: CreateAdminRequest = await req.json()
    const { first_name, last_name, email, phone, role, password } = body

    // Validate required fields
    if (!first_name || !last_name || !email || !password || !role) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate role
    if (!['admin', 'super_admin'].includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role. Must be admin or super_admin' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create the admin user using Supabase Admin API
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        first_name,
        last_name,
        full_name: `${first_name} ${last_name}`,
        phone: phone || '',
        role, // Required for handle_new_user trigger
      },
    })

    if (createError || !newUser.user) {
      console.error('Error creating user:', createError)
      return new Response(
        JSON.stringify({ error: createError?.message || 'Failed to create admin user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update the profile with admin role using service role client
    // Set profile_complete and onboarding_step so admins skip onboarding
    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({
        role,
        is_admin: true,
        first_name,
        last_name,
        full_name: `${first_name} ${last_name}`,
        phone: phone || '',
        profile_complete: true,
        onboarding_step: 'completed',
      })
      .eq('id', newUser.user.id)

    if (profileUpdateError) {
      console.error('Error updating profile:', profileUpdateError)
      // Try to delete the created user if profile update fails
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      return new Response(
        JSON.stringify({ error: 'Failed to set admin role' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        message: 'Admin created successfully',
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in create-admin-user function:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
