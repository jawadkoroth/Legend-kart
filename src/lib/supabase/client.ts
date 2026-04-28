import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client.
 *
 * Intentionally does NOT override `auth.storage`, `flowType`, or
 * `detectSessionInUrl`. `@supabase/ssr` defaults to cookie-backed storage
 * (mirrored in `document.cookie`) and PKCE — which is what the SSR
 * architecture (middleware + server route handler for OAuth callback)
 * requires. Any override here re-introduces the localStorage/cookie split
 * that breaks SSR auth and mobile Safari.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
