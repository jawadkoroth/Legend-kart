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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
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
