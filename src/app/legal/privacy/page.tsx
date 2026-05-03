import type { Metadata } from 'next';
import LegalShell from '../_components/LegalShell';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbLd } from '@/lib/seo/jsonLd';
import { BRAND, CONTACT, canonicalUrl } from '@/lib/seo/site';

/**
 * PRIVACY POLICY — DRAFT.
 *
 * This scaffold should be reviewed against the Digital Personal
 * Data Protection Act, 2023 (DPDPA) obligations, including:
 *   - Consent collection and purpose limitation
 *   - Data principal rights (access, correction, erasure, grievance)
 *   - Data breach notification
 *   - Retention periods
 *
 * If you operate cross-border (EU, UK), add GDPR/UK-GDPR language
 * and a DPO nomination.
 */

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `How ${BRAND.name} collects, uses, and protects personal data.`,
  alternates: { canonical: canonicalUrl('/legal/privacy') },
};

const UPDATED = 'January 2026';

export default function PrivacyPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: 'Privacy', path: '/legal/privacy' },
        ])}
      />
      <LegalShell
        eyebrow="Legal"
        title="Privacy Policy"
        updatedOn={UPDATED}
      >
        <p>
          This policy describes the personal data {BRAND.name} collects,
          why we collect it, and the choices you have. We collect only
          what we need.
        </p>

        <h2>What we collect</h2>
        <p>
          When you place an order, we collect your name, contact details,
          shipping address, and the details of your purchase. Payment
          information is collected and processed by our payment partners;
          we do not store card data on our servers.
        </p>

        <h2>How we use it</h2>
        <p>
          To fulfil your order, communicate about it, and meet legal
          obligations (tax, accounting). We do not sell personal data.
        </p>

        <h2>Your choices</h2>
        <p>
          You may request access to, correction of, or deletion of your
          personal data by writing to{' '}
          {CONTACT.email || 'our grievance officer'}. We will respond
          within the timelines set by applicable law.
        </p>

        <h2>Retention</h2>
        <p>
          Order records are retained for as long as necessary to comply
          with statutory obligations, typically eight years for tax
          purposes under Indian law.
        </p>

        <h2>Cookies</h2>
        <p>
          We use cookies only where strictly necessary for the site to
          function (session, cart, authentication). We do not run
          advertising cookies by default.
        </p>

        <h2>Contact</h2>
        <p>
          For any privacy question, write to{' '}
          {CONTACT.email || 'our contact address'}.
        </p>
      </LegalShell>
    </>
  );
}
