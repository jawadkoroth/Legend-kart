'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * NOIR — Homepage promotional strip.
 *
 * Renders the most recently updated active coupon row whose
 * `show_on_homepage` flag is true. RLS allows public SELECT on
 * active rows so this works for guests too.
 *
 * Premium / non-spammy aesthetic:
 *   - dark accent (royal blue / cobalt / gold / emerald)
 *   - serif headline mark, sans-serif body
 *   - dismissible per-session via sessionStorage
 *   - server-driven copy + colour, no hard-coded codes
 *
 * Hidden silently when no banner is configured. Never blocks the
 * page on its fetch.
 */

const ACCENT_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  'royal-blue': { bg: '#1F3A8A', fg: '#F5F1EA', border: 'rgba(255,255,255,0.18)' },
  cobalt: { bg: '#1E2F8C', fg: '#F5F1EA', border: 'rgba(255,255,255,0.16)' },
  gold: { bg: '#1A1611', fg: '#D4AF37', border: 'rgba(212,175,55,0.35)' },
  emerald: { bg: '#0D3B30', fg: '#E9DDB5', border: 'rgba(255,255,255,0.16)' },
  default: { bg: '#1A1611', fg: '#D4AF37', border: 'rgba(212,175,55,0.35)' },
};

interface BannerCoupon {
  code: string;
  discount_percent: number;
  homepage_text: string | null;
  homepage_accent: string | null;
}

const DISMISS_KEY = 'noir_banner_dismissed_v1';

export default function HomepageCouponBanner() {
  const [banner, setBanner] = useState<BannerCoupon | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        if (sessionStorage.getItem(DISMISS_KEY) === '1') {
          setDismissed(true);
          return;
        }
      } catch {
        /* ignore — non-fatal */
      }
    }

    let cancelled = false;
    const supabase = createClient();
    supabase
      .from('coupons')
      .select('code, discount_percent, homepage_text, homepage_accent')
      .eq('is_active', true)
      .eq('show_on_homepage', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) setBanner(data as BannerCoupon);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleDismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  if (!banner || dismissed) return null;

  const accent = ACCENT_COLORS[banner.homepage_accent ?? 'default'] ?? ACCENT_COLORS.default;

  const text =
    (banner.homepage_text && banner.homepage_text.trim()) ||
    `Use code ${banner.code} for ${banner.discount_percent}% off`;

  return (
    <div
      role="region"
      aria-label="Promotional offer"
      style={{
        background: accent.bg,
        color: accent.fg,
        borderBottom: `1px solid ${accent.border}`,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        position: 'relative',
        fontSize: '0.8125rem',
        letterSpacing: '0.02em',
      }}
    >
      <span
        style={{
          fontWeight: 600,
          textAlign: 'center',
          maxWidth: '90%',
        }}
      >
        {text}
      </span>
      <button
        type="button"
        aria-label="Dismiss promotional banner"
        onClick={handleDismiss}
        style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'transparent',
          color: accent.fg,
          border: 'none',
          fontSize: '1rem',
          opacity: 0.7,
          cursor: 'pointer',
          padding: 4,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
