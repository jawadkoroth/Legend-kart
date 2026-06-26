'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWishlist } from '@/lib/wishlist';
import { formatPaise } from '@/lib/format';
import { getPublicUrl } from '@/lib/media';
import styles from './wishlist.module.css';

interface Product {
  id: string;
  slug: string;
  name: string;
  category: string;
  price_paise: number;
  sale_price_paise: number | null;
  images: string[];
}

export default function WishlistPage() {
  const { wishlistProductIds, toggleWishlist, loading: wishlistLoading } = useWishlist();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load all products to filter
  useEffect(() => {
    async function loadProducts() {
      try {
        const res = await fetch('/api/products');
        const data = await res.json();
        if (data.success && data.products) {
          setProducts(data.products);
        }
      } catch (err) {
        console.error('Failed to load products for wishlist', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadProducts();
  }, []);

  const wishlistedItems = products.filter(p => wishlistProductIds.includes(p.id));

  // SEO Breadcrumb Schema
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      {
        '@type': 'ListItem',
        'position': 1,
        'name': 'Home',
        'item': typeof window !== 'undefined' ? window.location.origin : '',
      },
      {
        '@type': 'ListItem',
        'position': 2,
        'name': 'Wishlist',
        'item': typeof window !== 'undefined' ? window.location.href : '',
      }
    ]
  };

  const isPageLoading = wishlistLoading || isLoading;

  return (
    <div className={styles.container}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <div className={styles.titleSection}>
        <h1 className={styles.title}>Your Wishlist</h1>
        <p className={styles.subtitle}>SAVED LUXURY PIECES</p>
      </div>

      {isPageLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0', color: 'var(--accent-gold)' }}>
          <svg width="40" height="40" viewBox="0 0 38 38" stroke="currentColor" style={{ animation: 'spin 1s linear infinite' }}>
            <g fill="none" fillRule="evenodd">
              <g transform="translate(1 1)" strokeWidth="2">
                <circle strokeOpacity=".5" cx="18" cy="18" r="18"/>
                <path d="M36 18c0-9.94-8.06-18-18-18" />
              </g>
            </g>
          </svg>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      ) : wishlistedItems.length > 0 ? (
        <div className={styles.grid}>
          {wishlistedItems.map(p => {
            const cover = getPublicUrl(p.images?.[0]) || '/product-1.png';
            return (
              <div key={p.id} className={styles.card}>
                <button
                  className={styles.removeBtn}
                  onClick={() => toggleWishlist(p.id)}
                  aria-label={`Remove ${p.name} from wishlist`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                </button>
                <div className={styles.imageWrap}>
                  <img src={cover} alt={p.name} className={styles.image} loading="lazy" />
                </div>
                <div className={styles.body}>
                  <Link href={`/product/${p.slug}`} className={styles.name}>
                    {p.name}
                  </Link>
                  <span className={styles.category}>{p.category}</span>
                  <div className={styles.priceRow}>
                    {p.sale_price_paise ? (
                      <>
                        <span className={styles.price}>{formatPaise(p.sale_price_paise)}</span>
                        <span className={styles.priceStrike}>{formatPaise(p.price_paise)}</span>
                      </>
                    ) : (
                      <span className={styles.price}>{formatPaise(p.price_paise)}</span>
                    )}
                  </div>
                  <Link href={`/product/${p.slug}`} className={styles.actionBtn} style={{ textAlign: 'center', textDecoration: 'none' }}>
                    View Product
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--accent-gold)' }}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <h2 className={styles.emptyTitle}>Your Wishlist is Empty</h2>
          <p>Explore our exclusive collection and save your favorite monochrome items for later.</p>
          <Link href="/products" className={styles.discoverBtn}>
            Discover Collection
          </Link>
        </div>
      )}
    </div>
  );
}
