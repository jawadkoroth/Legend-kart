import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { runPantherSchemaCheck } from '@/lib/diagnostics/schemaCheck';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  if (process.env.NODE_ENV === 'development') {
    void runPantherSchemaCheck();
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Silently fail in Server Components (read-only)
          }
        },
      },
    }
  );
}

