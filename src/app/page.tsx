import type { Metadata } from 'next';
import LandingClient from './LandingClient';
import { JsonLd } from '@/components/seo/JsonLd';
import { organizationLd, webSiteLd } from '@/lib/seo/jsonLd';
import { BRAND, SITE_URL } from '@/lib/seo/site';

/**
 * Landing — server shell.
 *
 * Holds everything crawlers, social cards, and rich-results parsers
 * care about: title, description, canonical, OpenGraph + Twitter
 * cards, and Organization + WebSite JSON-LD. The interactive
 * landing (hero video, story slider, featured product) is delegated
 * to `<LandingClient>`, a client island.
 *
 * This split is what allows the page to be `'use client'`-free at
 * the route level. Route-level metadata MUST be exported from a
 * server component, so the client logic moves one layer down. No
 * UI behavior changes.
 *
 * The home page uses an absolute title (no `%s — PANTHER` template
 * applied) because the root layout's default already composes the
 * brand lockup correctly.
 */
export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} — Monochrome Menswear, India` },
  description: BRAND.description,
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    url: SITE_URL,
    title: `${BRAND.name} — Monochrome Menswear, India`,
    description: BRAND.description,
    type: 'website',
  },
};

export default function LandingPage() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd data={webSiteLd()} />
      <LandingClient />
    </>
  );
}
