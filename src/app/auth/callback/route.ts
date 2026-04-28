import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * OAuth callback (server route handler).
 *
 * Exchanges the PKCE `?code` for a session entirely server-side, which
 * writes session cookies via the @supabase/ssr cookie adapter. Then
 * decides where to send the user:
 *
 *   - missing/incomplete profile (no phone) -> /profile/complete?next=...
 *   - complete profile                       -> ?next=  (default /profile)
 *
 * The `profiles` row is auto-created by a Postgres trigger on
 * `auth.users` (see migration 003), so no client-side bootstrap is
 * required.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const errorParam = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  const rawNext = url.searchParams.get('next') || '/profile';
  // Only allow internal redirects.
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/profile';

  if (errorParam) {
    const target = new URL('/auth', url.origin);
    target.searchParams.set('error', errorDescription || errorParam);
    return NextResponse.redirect(target);
  }

  if (!code) {
    const target = new URL('/auth', url.origin);
    target.searchParams.set('error', 'Missing authorization code');
    return NextResponse.redirect(target);
  }

  const supabase = await createServerSupabaseClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    const target = new URL('/auth', url.origin);
    target.searchParams.set('error', exchangeError.message);
    return NextResponse.redirect(target);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const target = new URL('/auth', url.origin);
    target.searchParams.set('error', 'Session not established');
    return NextResponse.redirect(target);
  }

  // Profile row is auto-created by trigger; we only inspect `phone` to
  // decide whether onboarding is needed.
  const { data: profile } = await supabase
    .from('profiles')
    .select('phone')
    .eq('id', user.id)
    .maybeSingle();

  const destination = profile?.phone
    ? next
    : `/profile/complete?next=${encodeURIComponent(next)}`;

  return NextResponse.redirect(new URL(destination, url.origin));
}
