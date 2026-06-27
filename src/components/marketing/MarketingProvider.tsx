'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ConsentState, MarketingEventName } from '@/lib/marketing/types';
import { getConsentState } from '@/lib/marketing/consent';
import {
  getOrSetAnonymousId,
  getOrSetSessionId,
} from '@/lib/marketing/identity';
import { MarketingPlatformService, getOrSetCorrelationId } from '@/lib/marketing/service';
import { EventDispatcher } from '@/lib/marketing/dispatcher';

interface MarketingContextType {
  anonymousId: string;
  sessionId: string;
  userId: string | null;
  correlationId: string;
  consent: ConsentState;
  track: (eventName: MarketingEventName, properties?: Record<string, any>) => void;
  identify: (userId: string | null, traits?: Record<string, any>) => void;
  updateConsent: (state: Partial<Omit<ConsentState, 'version' | 'timestamp'>>) => void;
}

const MarketingContext = createContext<MarketingContextType | undefined>(undefined);

export function MarketingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  
  const [anonymousId, setAnonymousId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [correlationId, setCorrelationId] = useState('');
  const [consent, setConsent] = useState<ConsentState>(getConsentState());
  const [initialized, setInitialized] = useState(false);
  
  const prevPathname = useRef<string | null>(null);
  const prevUser = useRef<string | null>(null);

  // Initialize identity, consent, and dispatcher on client mount
  useEffect(() => {
    const anon = getOrSetAnonymousId();
    const sess = getOrSetSessionId();
    const corr = getOrSetCorrelationId();
    setAnonymousId(anon);
    setSessionId(sess);
    setCorrelationId(corr);

    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const utmSource = searchParams.get('utm_source');
      const gclid = searchParams.get('gclid');
      const fbclid = searchParams.get('fbclid');
      const ref = document.referrer;
      
      let sourceName = 'Direct / Organic';
      if (utmSource) {
        sourceName = `UTM: ${utmSource}`;
        const campaign = searchParams.get('utm_campaign');
        if (campaign) sourceName += ` (${campaign})`;
      } else if (gclid) {
        sourceName = 'Google Ads (gclid)';
      } else if (fbclid) {
        sourceName = 'Facebook Ads (fbclid)';
      } else if (ref) {
        try {
          const refUrl = new URL(ref);
          sourceName = `Referrer: ${refUrl.hostname}`;
        } catch {
          sourceName = `Referrer: ${ref}`;
        }
      }

      if (!window.localStorage.getItem('panther_first_touch')) {
        window.localStorage.setItem('panther_first_touch', sourceName);
      }
      window.sessionStorage.setItem('panther_last_touch', sourceName);
    }
    
    // Fetch active provider configurations from DB
    async function loadProviders() {
      try {
        const res = await fetch('/api/marketing/event');
        if (res.ok) {
          const { providers } = await res.json();
          // Initialize active client-side providers
          const dispatcher = EventDispatcher.getInstance();
          await dispatcher.initializeProviders(providers);
        }
      } catch (err) {
        console.error('[MarketingProvider] Failed to load provider configurations:', err);
      } finally {
        setInitialized(true);
      }
    }
    
    void loadProviders();
  }, []);

  // Expose track function
  const track = (eventName: MarketingEventName, properties: Record<string, any> = {}) => {
    MarketingPlatformService.track(eventName, properties, user?.id || null);
  };

  // Expose identify function
  const identify = (userId: string | null, traits: Record<string, any> = {}) => {
    MarketingPlatformService.identify(userId, traits);
  };

  // Expose consent update function
  const updateConsent = (state: Partial<Omit<ConsentState, 'version' | 'timestamp'>>) => {
    const subject = user?.id || anonymousId || getOrSetAnonymousId();
    MarketingPlatformService.consent(state, subject);
    setConsent(getConsentState()); // Refresh local react state
  };

  // 1. Auto-track page views on pathname changes
  useEffect(() => {
    if (!initialized) return;
    
    if (prevPathname.current === pathname) return;
    prevPathname.current = pathname;

    MarketingPlatformService.page(
      window.location.href,
      pathname,
      document.title,
      document.referrer,
      user?.id || null
    );
  }, [pathname, initialized]);

  // 2. Auto-track Login / Logout based on Auth state changes
  useEffect(() => {
    if (!initialized) return;

    const currentUserId = user?.id || null;
    
    if (currentUserId !== prevUser.current) {
      if (currentUserId && !prevUser.current) {
        // User logged in
        track('login', {
          userId: currentUserId,
          email: user?.email,
        });
        identify(currentUserId, {
          email: user?.email,
          phone: user?.phone,
        });
      } else if (!currentUserId && prevUser.current) {
        // User logged out
        track('logout', {
          previousUserId: prevUser.current,
        });
      }
      prevUser.current = currentUserId;
    }
  }, [user, initialized]);

  return (
    <MarketingContext.Provider
      value={{
        anonymousId,
        sessionId,
        userId: user?.id || null,
        correlationId,
        consent,
        track,
        identify,
        updateConsent,
      }}
    >
      {children}
    </MarketingContext.Provider>
  );
}

export function useMarketing() {
  const context = useContext(MarketingContext);
  if (context === undefined) {
    throw new Error('useMarketing must be used within a MarketingProvider');
  }
  return context;
}
