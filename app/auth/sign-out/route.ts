import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { headers, cookies } from 'next/headers'

export async function POST(request: Request) {
  const supabase = await createClient()
  const cookieStore = await cookies()

  // Clear view-as settings cookie to prevent stale role impersonation
  cookieStore.delete('viewAsSettings')

  const { error } = await supabase.auth.signOut()

  // Get the host from headers to handle proxied environments (Railway, etc.)
  const headersList = await headers()
  const host = headersList.get('host') || ''
  const protocol = headersList.get('x-forwarded-proto') || 'https'
  const baseUrl = `${protocol}://${host}`

  if (error) {
    return NextResponse.redirect(new URL('/dashboard', baseUrl))
  }

  return NextResponse.redirect(new URL('/sign-in', baseUrl))
}
