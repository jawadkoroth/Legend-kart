import type { Metadata } from 'next';
import LegalShell from '../_components/LegalShell';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbLd } from '@/lib/seo/jsonLd';
import { BRAND, canonicalUrl } from '@/lib/seo/site';

/**
 * SHIPPING POLICY — DRAFT.
 *
 * Merchant Center and the Consumer Protection (E-Commerce) Rules
 * both require a clearly stated shipping policy. Numbers below are
 * placeholders — align with your actual partner SLAs (Delhivery,
 * Shiprocket, Bluedart, etc.) before launch.
 */

export const metadata: Metadata = {
  title: 'Shipping',
  description: `Delivery timelines, charges, and tracking for ${BRAND.name} orders.`,
  alternates: { canonical: canonicalUrl('/legal/shipping') },
};

const UPDATED = 'January 2026';

export default function ShippingPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: 'Shipping', path: '/legal/shipping' },
        ])}
      />
      <LegalShell eyebrow="Legal" title="Shipping" updatedOn={UPDATED}>
        <p>
          Every order is prepared, inspected, and dispatched from our
          studio in India.
        </p>

        <h2>Timelines</h2>
        <p>
          Orders are typically dispatched within two working days. Metro
          destinations receive delivery in three to five working days;
          other destinations, five to eight.
        </p>

        <h2>Charges</h2>
        <p>
          Shipping charges are calculated at checkout based on destination
          pin code and order weight. Cash-on-delivery is available in
          selected pin codes and attracts a small processing fee,
          disclosed at checkout.
        </p>

        <h2>Tracking</h2>
        <p>
          You will receive a tracking reference by email once your order
          has been handed to the carrier. For any delivery question,
          please respond to that email and include your order number.
        </p>

        <h2>International</h2>
        <p>
          {BRAND.name} ships within India for now. International delivery
          is planned for a future release.
        </p>
      </LegalShell>
    </>
  );
}
