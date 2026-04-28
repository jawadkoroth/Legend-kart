import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Single source of truth for session refresh + protected-route gating.
 *
 * Pattern from @supabase/ssr docs: build a NextResponse, wire a server
 * Supabase client to the request/response cookie jars, then call
 * `getUser()` to refresh the access token. Refreshed cookies are written
 * onto the outgoing response, so subsequent server components and route
 * handlers see an up-to-date session.
 *
 * IMPORTANT: do not run any logic between `createServerClient` and
 * `getUser()` — the @supabase/ssr README warns this can desync auth.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Routes that require an authenticated user.
  const requiresUser =
    pathname.startsWith('/profile') ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/order/');

  // Admin protected sub-tree (the /admin login page itself is public).
  const requiresAdmin = pathname.startsWith('/admin/');

  if ((requiresUser || requiresAdmin) && !user) {
    const redirectUrl = request.nextUrl.clone();
    if (requiresAdmin) {
      redirectUrl.pathname = '/admin';
      redirectUrl.search = '';
    } else {
      redirectUrl.pathname = '/auth';
      redirectUrl.search = '';
      redirectUrl.searchParams.set('next', pathname);
    }
    return NextResponse.redirect(redirectUrl);
  }

  // Already authenticated users should not see the login page.
  if (pathname === '/auth' && user) {
    const next = request.nextUrl.searchParams.get('next') || '/profile';
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = next.startsWith('/') ? next : '/profile';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on every path except:
     * - Next internals (_next/static, _next/image)
     * - Common static files
     * The OAuth callback route (/auth/callback) MUST be matched so the
     * exchange's Set-Cookie headers survive any session refresh logic.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
