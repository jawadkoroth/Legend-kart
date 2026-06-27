import { ConsentState } from './types';
import { getCookie, setCookie } from './identity';

const CONSENT_COOKIE_NAME = 'panther_consent';
const DEFAULT_CONSENT_VERSION = '1.0.0';

export const DEFAULT_CONSENT: ConsentState = {
  analytics: false,
  marketing: false,
  functional: true, // Functional is necessary for the app to work (session cookies, cart, etc.)
  version: DEFAULT_CONSENT_VERSION,
};

export function getConsentState(): ConsentState {
  if (typeof window === 'undefined') return DEFAULT_CONSENT;
  
  const cookieValue = getCookie(CONSENT_COOKIE_NAME);
  if (!cookieValue) {
    return DEFAULT_CONSENT;
  }
  
  try {
    const parsed = JSON.parse(cookieValue);
    return {
      analytics: !!parsed.analytics,
      marketing: !!parsed.marketing,
      functional: !!parsed.functional,
      version: parsed.version || DEFAULT_CONSENT_VERSION,
      timestamp: parsed.timestamp,
    };
  } catch {
    return DEFAULT_CONSENT;
  }
}

export function updateConsentState(
  state: Partial<Omit<ConsentState, 'version' | 'timestamp'>>,
  subjectId: string
): ConsentState {
  const current = getConsentState();
  const updated: ConsentState = {
    analytics: state.analytics ?? current.analytics,
    marketing: state.marketing ?? current.marketing,
    functional: state.functional ?? current.functional,
    version: current.version,
    timestamp: new Date().toISOString(),
  };
  
  // Persist client-side
  setCookie(CONSENT_COOKIE_NAME, JSON.stringify(updated), 365);
  
  // Persist audit server-side (best-effort async fire-and-forget)
  void sendConsentAuditToServer(subjectId, updated);
  
  return updated;
}

async function sendConsentAuditToServer(subjectId: string, consent: ConsentState): Promise<void> {
  try {
    const res = await fetch('/api/marketing/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subjectId,
        consent,
      }),
      keepalive: true, // Ensure it sends even if page is unloading
    });
    
    if (!res.ok) {
      console.warn('[PANTHER_CONSENT] Failed to send consent audit to server:', res.statusText);
    }
  } catch (err) {
    console.error('[PANTHER_CONSENT] Error pushing consent audit to server:', err);
  }
}
