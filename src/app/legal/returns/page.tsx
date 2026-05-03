import type { Metadata } from 'next';
import LegalShell from '../_components/LegalShell';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbLd } from '@/lib/seo/jsonLd';
import { BRAND, CONTACT, canonicalUrl } from '@/lib/seo/site';

/**
 * RETURNS POLICY — DRAFT.
 *
 * Align final copy with Merchant Center policy rules and with the
 * actual operations capability (carrier pickup availability,
 * inspection window, refund turnaround).
 *
 * Merchant Center requires a return policy to surface on Shopping
 * listings — the stricter and clearer this is, the fewer manual
 * review escalations.
 */

export const metadata: Metadata = {
  title: 'Returns',
  description: `How to return or exchange an item purchased from ${BRAND.name}.`,
  alternates: { canonical: canonicalUrl('/legal/returns') },
};

const UPDATED = 'January 2026';

export default function ReturnsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: 'Returns', path: '/legal/returns' },
        ])}
      />
      <LegalShell eyebrow="Legal" title="Returns" updatedOn={UPDATED}>
        <p>
          We want you to be certain of your purchase. Pieces may be
          returned or exchanged within <strong>seven days</strong> of
          delivery, provided they are unworn, unwashed, and in their
          original packaging with tags intact.
        </p>

        <h2>How to initiate</h2>
        <p>
          Write to {CONTACT.email || 'our care team'} with your order
          number and the piece you wish to return. We will confirm the
          address or arrange a reverse pickup where serviceable.
        </p>

        <h2>Refunds</h2>
        <p>
          Once the returned piece reaches us and passes inspection,
          refunds are processed to the original payment method within
          seven working days.
        </p>

        <h2>Exceptions</h2>
        <p>
          Items marked final sale, personalised items, and innerwear are
          not eligible for return.
        </p>

        <h2>Exchanges</h2>
        <p>
          Size exchanges are subject to inventory availability. If the
          replacement size is unavailable we will refund in full.
        </p>
      </LegalShell>
    </>
  );
}
