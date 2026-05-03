import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbLd } from '@/lib/seo/jsonLd';
import { BRAND, CONTACT, SOCIAL, canonicalUrl } from '@/lib/seo/site';
import styles from './about.module.css';

/**
 * About — server component, typography-led editorial.
 *
 * Five quiet sections, in order:
 *
 *   1. Opening statement — single line, breathing space.
 *   2. Standards — material, tone, and silhouette discipline.
 *   3. Editorial caesura — vertical rule + a single fragment.
 *   4. Philosophy — four short rules, rhythmic.
 *   5. Closing — emblem and a single email.
 *
 * No team grid, no founder story, no founding year, no "our
 * journey." If you ever feel the urge to add a numbered list of
 * "values," do not. The section already exists and is kept short
 * for a reason.
 *
 * Photography is intentionally absent in v1. The editorial layout
 * is designed to look complete without imagery; image slots can be
 * added later by replacing the `.standardsArt` and `.fragmentArt`
 * blocks with `<Image>` components.
 *
 * Indexable. Quiet structured-data: a `BreadcrumbList` and the
 * page-level metadata. No FAQ, no Article, no aggressive schema
 * cascade — that's deliberate per the brand brief.
 */

export const metadata: Metadata = {
  title: 'About',
  description:
    `${BRAND.name} is a monochrome menswear house, built around black. ` +
    `Linen, cotton, and wool, cut for repetition and made in India.`,
  alternates: { canonical: canonicalUrl('/about') },
  openGraph: {
    type: 'website',
    url: canonicalUrl('/about'),
    title: `About — ${BRAND.name}`,
    description:
      `Monochrome menswear, built around black. Made in India.`,
  },
};

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: 'About', path: '/about' },
        ])}
      />

      <main className={styles.page}>
        {/* 1 — Opening statement */}
        <section className={styles.opening} aria-labelledby="about-heading">
          <p className={styles.openingEyebrow}>The House</p>
          <h1 id="about-heading" className={styles.openingTitle}>
            Black is not a colour.
            <br />
            It is a decision.
          </h1>
          <p className={styles.openingSub}>
            We make one thing — quiet menswear in permanent black. Cut to
            be worn often, and for years.
          </p>
        </section>

        {/* 2 — Standards */}
        <section className={styles.standards} aria-labelledby="standards-heading">
          <div className={styles.standardsArt} aria-hidden="true" />

          <div className={styles.standardsBody}>
            <p className={styles.eyebrow}>Standards</p>
            <h2 id="standards-heading" className={styles.sectionHeading}>
              The same piece, made well, again.
            </h2>

            <dl className={styles.standardsList}>
              <div className={styles.standard}>
                <dt>Tone</dt>
                <dd>
                  A single black across every piece. Reactive-dyed,
                  set deep, and tested for long-term resistance to
                  greying.
                </dd>
              </div>
              <div className={styles.standard}>
                <dt>Cloth</dt>
                <dd>
                  Long-staple linen, mid-weight cotton, wool worsteds.
                  Mills are chosen for consistency over volume.
                </dd>
              </div>
              <div className={styles.standard}>
                <dt>Silhouette</dt>
                <dd>
                  Cut to the body without stricture. Shapes are
                  refined across seasons rather than replaced.
                </dd>
              </div>
              <div className={styles.standard}>
                <dt>Edition</dt>
                <dd>
                  Each piece is made in limited runs and re-issued
                  when the cloth allows.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* 3 — Editorial caesura */}
        <section className={styles.fragment} aria-hidden="false">
          <span className={styles.fragmentRule} aria-hidden="true" />
          <p className={styles.fragmentText}>
            Cut in single runs.
            <br />
            Finished by hand at the collar.
          </p>
        </section>

        {/* 4 — Philosophy */}
        <section className={styles.philosophy} aria-labelledby="philosophy-heading">
          <p className={styles.eyebrow}>Notes</p>
          <h2 id="philosophy-heading" className={styles.sectionHeading}>
            How we think about clothes.
          </h2>
          <ul className={styles.notes}>
            <li>Less, kept longer.</li>
            <li>Built around black.</li>
            <li>Silhouette before trend.</li>
            <li>Quiet garments, for repeated wear.</li>
          </ul>
        </section>

        {/* 5 — Closing / contact */}
        <section className={styles.closing} aria-labelledby="contact-heading" id="contact">
          <span className={styles.emblem} aria-hidden="true">
            {BRAND.name}
          </span>
          <h2 id="contact-heading" className={styles.closingHeading}>
            Write to us.
          </h2>
          <ul className={styles.contactList}>
            {CONTACT.email && (
              <li>
                <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
                <span className={styles.contactNote}>General &amp; editorial</span>
              </li>
            )}
            {SOCIAL.instagram && (
              <li>
                <a href={SOCIAL.instagram} target="_blank" rel="noopener noreferrer">
                  Instagram
                </a>
                <span className={styles.contactNote}>Latest releases</span>
              </li>
            )}
            <li>
              <Link href="/journal">Journal</Link>
              <span className={styles.contactNote}>Editorial</span>
            </li>
          </ul>
        </section>
      </main>
    </>
  );
}
