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
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true });

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
  const [loading, setLoading] = useState(true);
  const lastUserId = useRef<string | null>(initialUser?.id ?? null);

  useEffect(() => {
    const supabase = createClient();

    console.log('[AUTH_RESTORE] Starting session recovery check...');

    const restoreSession = async () => {
      try {
        const saved = localStorage.getItem('legend_kart_admin_session');
        if (saved) {
          console.log('[AUTH_RESTORE] Found saved session in localStorage.');
          const { access_token, refresh_token } = JSON.parse(saved);
          const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) {
            console.error('[AUTH_RESTORE] Failed to setSession:', error.message);
          } else if (data.session) {
            console.log('[AUTH_RESTORE] Successfully restored session via setSession.');
            setUser(data.session.user);
            lastUserId.current = data.session.user.id;
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error('[AUTH_RESTORE] Error reading/setting saved session:', err);
      }

      // Fallback to default getSession
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[AUTH_RESTORE] Error getting session:', error.message);
        } else if (session) {
          console.log(`[AUTH_SESSION_FOUND] Session restored for user: ${session.user.email}`);
          setUser(session.user);
          lastUserId.current = session.user.id;
        } else {
          console.log('[AUTH_SESSION_MISSING] No session found on startup.');
        }
      } catch (err) {
        console.error('[AUTH_RESTORE] Catch getSession error:', err);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();

    // Background session verification on app focus, reconnect, and resume
    const triggerBackgroundCheck = async () => {
      console.log('[AUTH_RESILIENCE] Triggering background session verification check...');
      setLoading(true);
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[AUTH_RESILIENCE] Background session check error:', error.message);
        } else if (session) {
          console.log('[AUTH_RESILIENCE] Background session check active for:', session.user.email);
          setUser(session.user);
          lastUserId.current = session.user.id;
        } else {
          console.log('[AUTH_RESILIENCE] Background session check: no session found.');
          setUser(null);
        }
      } catch (err) {
        console.error('[AUTH_RESILIENCE] Background session check failed:', err);
      } finally {
        setLoading(false);
      }
    };

    // Attach native/browser listeners
    const handleFocus = () => triggerBackgroundCheck();
    const handleOnline = () => triggerBackgroundCheck();

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    let appStateListener: any = null;
    if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
      App.addListener('appStateChange', (state) => {
        console.log('[AUTH_RESILIENCE] Capacitor state changed. Active:', state.isActive);
        if (state.isActive) {
          triggerBackgroundCheck();
        }
      }).then((listener) => {
        appStateListener = listener;
      });
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[AUTH_RESTORE] AuthStateChanged event: ${event}`);
      if (session) {
        localStorage.setItem('legend_kart_admin_session', JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }));
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('legend_kart_admin_session');
      }

      if (event === 'TOKEN_REFRESHED') {
        console.log('[AUTH_REFRESH_SUCCESS] Token refreshed.');
      } else if (event === 'SIGNED_OUT') {
        console.log('[AUTH_SESSION_MISSING] AuthStateChanged user signed out.');
      }

      const nextUser = session?.user ?? null;
      const nextId = nextUser?.id ?? null;
      setUser(nextUser);
      setLoading(false);

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
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      if (appStateListener) {
        appStateListener.remove();
      }
    };
  }, [router]);

  const value = useMemo<AuthContextValue>(() => ({ user, loading }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
