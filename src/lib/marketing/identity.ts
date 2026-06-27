import { ClickIds, DeviceContext, UTMContext } from './types';

// Helper to generate a UUID v4 in pure JS
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Cookie helpers
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const nameEQ = name + '=';
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

export function setCookie(name: string, value: string, days?: number): void {
  if (typeof document === 'undefined') return;
  let expires = '';
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    expires = '; expires=' + date.toUTCString();
  }
  document.cookie = `${name}=${value}${expires}; path=/; SameSite=Lax; Secure`;
}

export function getOrSetAnonymousId(): string {
  const cookieName = 'panther_anonymous_id';
  let anonymousId = getCookie(cookieName);
  
  if (!anonymousId && typeof window !== 'undefined') {
    // Fallback to localStorage check before generating a new one
    anonymousId = window.localStorage.getItem(cookieName);
    if (!anonymousId) {
      anonymousId = generateUUID();
      window.localStorage.setItem(cookieName, anonymousId);
    }
    // Refresh cookie
    setCookie(cookieName, anonymousId, 365);
  }
  
  return anonymousId || generateUUID();
}

export function getOrSetSessionId(): string {
  const cookieName = 'panther_session_id';
  let sessionId = getCookie(cookieName);
  
  if (!sessionId && typeof window !== 'undefined') {
    // Fallback to sessionStorage check before generating a new one
    sessionId = window.sessionStorage.getItem(cookieName);
    if (!sessionId) {
      sessionId = generateUUID();
      window.sessionStorage.setItem(cookieName, sessionId);
    }
    // Session cookie (no expiry sets it as session cookie)
    setCookie(cookieName, sessionId);
  }
  
  return sessionId || generateUUID();
}

export function getDeviceContext(): DeviceContext {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { type: 'desktop' };
  }

  const ua = navigator.userAgent;
  let type: 'desktop' | 'tablet' | 'mobile' = 'desktop';

  // Basic device type detection
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    type = 'tablet';
  } else if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    type = 'mobile';
  }

  // Detect browser name
  let browser = 'Unknown';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('SamsungBrowser')) browser = 'Samsung Browser';
  else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';
  else if (ua.includes('Trident')) browser = 'Internet Explorer';
  else if (ua.includes('Edge') || ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';

  // Detect OS name
  let os = 'Unknown';
  if (ua.includes('Windows NT')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return {
    type,
    os,
    browser,
    userAgent: ua,
  };
}

export function getUTMContext(searchParams: URLSearchParams): UTMContext {
  return {
    source: searchParams.get('utm_source'),
    medium: searchParams.get('utm_medium'),
    campaign: searchParams.get('utm_campaign'),
    term: searchParams.get('utm_term'),
    content: searchParams.get('utm_content'),
  };
}

export function getClickIds(searchParams: URLSearchParams): ClickIds {
  return {
    gclid: searchParams.get('gclid'),
    fbclid: searchParams.get('fbclid'),
  };
}

export function getReferrer(): string {
  if (typeof document === 'undefined') return '';
  return document.referrer || '';
}

export function getLandingPage(): string {
  if (typeof window === 'undefined') return '';
  
  // Store the landing page in sessionStorage on first entry
  const key = 'panther_landing_page';
  let landingPage = window.sessionStorage.getItem(key);
  if (!landingPage) {
    landingPage = window.location.href;
    window.sessionStorage.setItem(key, landingPage);
  }
  return landingPage;
}
