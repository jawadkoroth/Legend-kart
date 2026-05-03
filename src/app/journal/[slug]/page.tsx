import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { articleLd, breadcrumbLd } from '@/lib/seo/jsonLd';
import { BRAND, absoluteUrl, canonicalUrl } from '@/lib/seo/site';
import { getArticle, publishedArticles } from '../_articles';
import styles from './article.module.css';

/**
 * Journal article — server-rendered template.
 *
 * The article body itself lives in a separate module under
 * `./articles/<slug>` and is dynamically imported by slug. This
 * keeps the route file minimal and ensures each article's component
 * only ships in the bundle when its page is requested.
 *
 * If the registry has the slug but the body file is missing, we
 * 404 — better than rendering an empty article.
 */

export async function generateStaticParams() {
  // Pre-render every published article slug at build. Drafts are
  // excluded by `publishedArticles()`.
  return publishedArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  const url = canonicalUrl(`/journal/${slug}`);

  if (!article) {
    return {
      title: 'Not found',
      alternates: { canonical: url },
      robots: { index: false, follow: true },
    };
  }

  const ogImage = article.hero ? absoluteUrl(article.hero) : undefined;
  return {
    title: article.title,
    description: article.dek,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: article.title,
      description: article.dek,
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt || article.publishedAt,
      authors: [article.author || BRAND.name],
      images: ogImage ? [{ url: ogImage, alt: article.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.dek,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export default async function JournalArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  // Lazy-load the body component. Each article ships its own JSX in
  // `./articles/<slug>.tsx`. A missing body file is a soft 404.
  let Body: React.ComponentType | null = null;
  try {
    const mod = await import(`../articles/${slug}.tsx`);
    Body = mod.default as React.ComponentType;
  } catch {
    notFound();
  }

  const url = canonicalUrl(`/journal/${slug}`);

  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: 'Journal', path: '/journal' },
          { name: article.title, path: `/journal/${slug}` },
        ])}
      />
      <JsonLd
        data={articleLd({
          headline: article.title,
          description: article.dek,
          url,
          image: article.hero
            ? absoluteUrl(article.hero)
            : absoluteUrl('/og/default.png'),
          datePublished: article.publishedAt,
          dateModified: article.updatedAt || article.publishedAt,
          authorName: article.author || BRAND.name,
        })}
      />

      <article className={styles.article}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Journal</p>
          <h1 className={styles.title}>{article.title}</h1>
          <p className={styles.dek}>{article.dek}</p>
          <p className={styles.meta}>
            <time dateTime={article.publishedAt}>
              {dateFormatter.format(new Date(article.publishedAt))}
            </time>
            <span aria-hidden="true"> · </span>
            <span>{article.readingMinutes} min</span>
          </p>
        </header>

        <div className={styles.body}>
          {Body && <Body />}
        </div>

        <footer className={styles.footer}>
          <Link href="/journal" className={styles.back}>
            ← Back to Journal
          </Link>
        </footer>
      </article>
    </>
  );
}
