import Link from 'next/link';
import styles from './LegalShell.module.css';

/**
 * Shared shell for legal pages. Wraps body copy in an editorial
 * column with deliberate whitespace — the tone is "quiet statutory,"
 * not "wall of microtype."
 *
 * Every legal page is indexable (these are some of the most-landed
 * pages for brand-name + "returns" / "shipping" queries). Keep the
 * copy short, accurate, and human.
 */
export default function LegalShell({
  title,
  eyebrow,
  updatedOn,
  children,
}: {
  title: string;
  eyebrow?: string;
  updatedOn?: string;
  children: React.ReactNode;
}) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1 className={styles.title}>{title}</h1>
        {updatedOn && (
          <p className={styles.meta}>Last updated — {updatedOn}</p>
        )}
      </header>

      <article className={styles.body}>{children}</article>

      <nav aria-label="Legal" className={styles.siblings}>
        <Link href="/legal/terms">Terms</Link>
        <Link href="/legal/privacy">Privacy</Link>
        <Link href="/legal/returns">Returns</Link>
        <Link href="/legal/shipping">Shipping</Link>
      </nav>
    </main>
  );
}
