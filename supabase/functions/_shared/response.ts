// Standard response helpers for Edge Functions

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function successResponse(data: any, status = 200) {
  return new Response(
    JSON.stringify({ success: true, ...data }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    }
  )
}

export function errorResponse(error: string | Error, status = 500) {
  const errorMessage = typeof error === 'string' ? error : error.message

  return new Response(
    JSON.stringify({
      success: false,
      error: errorMessage
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    }
  )
}

export function corsResponse() {
  return new Response('ok', { headers: corsHeaders })
}
