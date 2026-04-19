import { createClient } from '@supabase/supabase-js';

/**
 * Admin Supabase client — BYPASSES Row Level Security.
 * Use ONLY in server-side API routes. NEVER import in client components.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
