// Sync AIME Users Edge Function
// API endpoint that returns profiles for external AIME AI system to fetch
// Called by AIME AI's cron job to sync user data

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth via standard Supabase apikey header (anon key)
    const apiKey = req.headers.get('apikey')
    const expectedAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!apiKey || apiKey !== expectedAnonKey) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid apikey' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Missing environment variables' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Parse query params for pagination/filtering
    const url = new URL(req.url)
    const cursor = parseInt(url.searchParams.get('cursor') || '0')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500)
    const updatedSince = url.searchParams.get('updated_since') // ISO date string

    // Build query
    let query = supabase
      .from('profiles')
      .select('*')
      .eq('is_admin', false)
      .order('created_at', { ascending: true })
      .range(cursor, cursor + limit - 1)

    if (updatedSince) {
      query = query.gte('updated_at', updatedSince)
    }

    const { data: profiles, error: fetchError, count } = await query

    if (fetchError) {
      throw new Error(`Failed to fetch profiles: ${fetchError.message}`)
    }

    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_admin', false)

    const hasMore = (cursor + limit) < (totalCount || 0)

    return new Response(
      JSON.stringify({
        success: true,
        response: {
          results: profiles || [],
          count: profiles?.length || 0,
          remaining: Math.max(0, (totalCount || 0) - cursor - limit),
          cursor: cursor + limit,
          has_more: hasMore,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
