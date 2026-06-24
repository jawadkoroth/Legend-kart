'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type AuthContextValue = {
  user: User | null;
};

const AuthContext = createContext<AuthContextValue>({ user: null });

/**
 * Single client-side source of truth for the current user.
 *
 * - `initialUser` is hydrated from the server (RootLayout calls
 *   `getUser()` via the SSR cookie client) so the very first paint
 *   already reflects auth state — no flicker.
 * - One `onAuthStateChange` subscription per browser tab: the only
 *   `createClient()` consumer for auth observation. Page components
 *   should call `useAuth()` instead of spinning up their own listeners.
 * - On auth changes (sign-in / sign-out / token refresh emitted by
 *   another tab), we update local state AND call `router.refresh()` so
 *   any RSCs revalidate against the new cookie state.
 */
export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: User | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(initialUser);
  const lastUserId = useRef<string | null>(initialUser?.id ?? null);

  useEffect(() => {
    const supabase = createClient();

    console.log('[AUTH_RESTORE] Starting session recovery check...');

    // Restore session on startup
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('[AUTH_RESTORE] Error getting session:', error.message);
        console.log('[AUTH_REFRESH_FAILED] Session recovery failed.');
        return;
      }
      if (session) {
        console.log(`[AUTH_SESSION_FOUND] Session restored for user: ${session.user.email}`);
        setUser(session.user);
        lastUserId.current = session.user.id;
      } else {
        console.log('[AUTH_SESSION_MISSING] No session found on startup.');
      }
    }).catch(err => {
      console.error('[AUTH_RESTORE] Catch getSession error:', err);
      console.log('[AUTH_REFRESH_FAILED] Session recovery threw an error.');
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[AUTH_RESTORE] AuthStateChanged event: ${event}`);
      if (event === 'TOKEN_REFRESHED') {
        console.log('[AUTH_REFRESH_SUCCESS] Token refreshed.');
      } else if (event === 'SIGNED_OUT') {
        console.log('[AUTH_SESSION_MISSING] AuthStateChanged user signed out.');
      }

      const nextUser = session?.user ?? null;
      const nextId = nextUser?.id ?? null;
      setUser(nextUser);

      // Only ask the router to revalidate RSC trees when identity
      // actually changes — avoids thrashing on background
      // TOKEN_REFRESHED events.
      if (nextId !== lastUserId.current) {
        lastUserId.current = nextId;
        router.refresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  const value = useMemo<AuthContextValue>(() => ({ user }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
