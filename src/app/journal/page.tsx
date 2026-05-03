import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbLd } from '@/lib/seo/jsonLd';
import { BRAND, canonicalUrl } from '@/lib/seo/site';
import { publishedArticles } from './_articles';
import styles from './journal.module.css';

/**
 * Journal — index.
 *
 * A typographic editorial index. Each article is a long row, not a
 * grid card. Cards on a luxury journal index read as Medium; rows
 * read as a contents page in a printed magazine.
 *
 * When the registry is empty, the page renders a quiet "Editorial —
 * coming" state — still indexable, no 404, just sparse.
 */

export const metadata: Metadata = {
  title: 'Journal',
  description:
    `Editorial from the ${BRAND.name} house — material studies, ` +
    `silhouette notes, and the occasional essay on black.`,
  alternates: { canonical: canonicalUrl('/journal') },
  openGraph: {
    type: 'website',
    url: canonicalUrl('/journal'),
    title: `Journal — ${BRAND.name}`,
    description: 'Editorial from the house. Material, silhouette, and black.',
  },
};

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export default function JournalIndex() {
  const items = publishedArticles();

  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: 'Journal', path: '/journal' },
        ])}
      />

      <main className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Editorial</p>
          <h1 className={styles.title}>Journal</h1>
          <p className={styles.dek}>
            Notes on material, silhouette, and the colour we have chosen
            to keep.
          </p>
        </header>

        {items.length === 0 ? (
          <section className={styles.empty} aria-live="polite">
            <p className={styles.emptyText}>Editorial — coming.</p>
          </section>
        ) : (
          <ol className={styles.list}>
            {items.map((article) => (
              <li key={article.slug} className={styles.row}>
                <Link href={`/journal/${article.slug}`} className={styles.rowLink}>
                  <p className={styles.rowMeta}>
                    <time dateTime={article.publishedAt}>
                      {dateFormatter.format(new Date(article.publishedAt))}
                    </time>
                    <span aria-hidden="true">·</span>
                    <span>{article.readingMinutes} min</span>
                  </p>
                  <h2 className={styles.rowTitle}>{article.title}</h2>
                  <p className={styles.rowDek}>{article.dek}</p>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </main>
    </>
  );
}
