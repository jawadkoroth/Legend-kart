import type { Metadata } from 'next';
import LegalShell from '../_components/LegalShell';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbLd } from '@/lib/seo/jsonLd';
import { BRAND, CONTACT, canonicalUrl } from '@/lib/seo/site';

/**
 * TERMS OF SERVICE — DRAFT.
 *
 * The copy below is a working scaffold. Before production launch,
 * have a qualified Indian ecommerce counsel review and replace it.
 * Indian obligations to keep in mind (non-exhaustive):
 *
 *   - Consumer Protection (E-Commerce) Rules, 2020 mandatory
 *     disclosures (seller identity, grievance officer, return
 *     policy, country of origin, etc.)
 *   - IT Act, 2000 — acceptable use + intermediary liability
 *   - Legal Metrology (Packaged Commodities) Rules
 *   - GST invoicing obligations (if applicable)
 */

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: `Terms governing the use of the ${BRAND.name} website and the purchase of ${BRAND.name} goods.`,
  alternates: { canonical: canonicalUrl('/legal/terms') },
};

const UPDATED = 'January 2026';

export default function TermsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: 'Terms', path: '/legal/terms' },
        ])}
      />
      <LegalShell eyebrow="Legal" title="Terms of Service" updatedOn={UPDATED}>
        <p>
          These terms govern your use of the {BRAND.name} website and the
          purchase of any {BRAND.name} goods. By placing an order you accept
          them.
        </p>

        <h2>Orders and payment</h2>
        <p>
          An order is an offer to purchase. {BRAND.name} reserves the right
          to accept or decline any order, including where a product is
          unexpectedly out of stock or where a pricing error is identified.
          Payment is processed via authorised payment partners; full
          payment is required prior to dispatch for prepaid orders.
        </p>

        <h2>Shipping and delivery</h2>
        <p>
          Delivery timelines are indicative. Risk of loss passes on
          handover to the shipping partner. Any delivery-related concerns
          must be raised within seven days of receipt. See our{' '}
          <a href="/legal/shipping">Shipping Policy</a> for details.
        </p>

        <h2>Returns and refunds</h2>
        <p>
          Our return and refund practice is set out in the{' '}
          <a href="/legal/returns">Returns Policy</a>. Where a refund is
          due, it is processed to the original mode of payment.
        </p>

        <h2>Intellectual property</h2>
        <p>
          All content on this site — imagery, copy, product design —
          belongs to {BRAND.legalName}. Reproduction without written
          permission is not permitted.
        </p>

        <h2>Governing law</h2>
        <p>
          These terms are governed by the laws of India. Any dispute
          arising under them is subject to the exclusive jurisdiction of
          the courts at the place of our registered office.
        </p>

        <h2>Contact</h2>
        <p>
          Grievances may be addressed to {CONTACT.email || 'our contact address'}.
          We aim to acknowledge every written concern within three working
          days.
        </p>
      </LegalShell>
    </>
  );
}
