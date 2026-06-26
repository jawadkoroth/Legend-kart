'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatPaise } from '@/lib/format';
import { getPublicUrl } from '@/lib/media';
import styles from './SearchOverlay.module.css';

interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_paise: number;
  sale_price_paise: number | null;
  images: string[];
  media?: any;
  category: string;
  tags?: string[];
  is_active: boolean;
}

interface SearchOverlayProps {
  onClose: () => void;
}

function getLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export default function SearchOverlay({ onClose }: SearchOverlayProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  // Fetch product list
  useEffect(() => {
    async function fetchProducts() {
      try {
        const res = await fetch('/api/products');
        const data = await res.json();
        if (data.success && data.products) {
          setProducts(data.products);
          // Extract unique categories
          const cats: string[] = Array.from(new Set(data.products.map((p: Product) => p.category).filter(Boolean) as string[]));
          setCategories(cats);
        }
      } catch (err) {
        console.error('Failed to load products for search', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchProducts();
    inputRef.current?.focus();

    // Disable scrolling behind overlay
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  // Handle Search Input & Typo Tolerance logic
  useEffect(() => {
    if (!query.trim()) {
      setFilteredProducts([]);
      setSuggestions([]);
      setActiveIdx(-1);
      return;
    }

    startTransition(() => {
      const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const scored = products
        .map(product => {
          let score = 0;
          const nameLower = product.name.toLowerCase();
          const descLower = (product.description || '').toLowerCase();
          const catLower = (product.category || '').toLowerCase();
          const tagsLower = (product.tags || []).map(t => t.toLowerCase());

          // 1. Exact match boosts
          if (nameLower === query.toLowerCase()) score += 150;
          if (nameLower.includes(query.toLowerCase())) score += 80;

          // 2. Term checks with typo tolerance
          for (const term of searchTerms) {
            // Substring checks
            if (nameLower.includes(term)) score += 40;
            if (descLower.includes(term)) score += 15;
            if (catLower.includes(term)) score += 20;
            if (tagsLower.some(t => t.includes(term))) score += 25;

            // Fuzzy/Typo check per word
            const nameWords = nameLower.split(/\s+/);
            for (const word of nameWords) {
              if (word.length >= 3) {
                const distance = getLevenshteinDistance(term, word);
                if (distance === 1) score += 15;
                else if (distance === 2 && word.length > 5) score += 8;
              }
            }
          }
          return { product, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);

      setFilteredProducts(scored.map(item => item.product));

      // Generate keyword suggestions
      const keywordSuggestions = new Set<string>();
      products.forEach(p => {
        const words = p.name.split(/\s+/);
        words.forEach(w => {
          const cleanWord = w.replace(/[^a-zA-Z]/g, '');
          if (cleanWord.toLowerCase().startsWith(query.toLowerCase()) && cleanWord.length > query.length) {
            keywordSuggestions.add(cleanWord);
          }
        });
      });
      setSuggestions(Array.from(keywordSuggestions).slice(0, 5));
      setActiveIdx(-1);
    });
  }, [query, products]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(prev => Math.min(prev + 1, filteredProducts.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && filteredProducts[activeIdx]) {
        router.push(`/product/${filteredProducts[activeIdx].slug}`);
        onClose();
      }
    }
  };

  // Text highlighting helper
  const highlightText = (text: string, highlightQuery: string) => {
    if (!highlightQuery.trim()) return text;
    const parts = highlightQuery.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return text;

    const escapedParts = parts.map(p => p.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
    const regex = new RegExp(`(${escapedParts.join('|')})`, 'gi');
    const textParts = text.split(regex);

    return (
      <>
        {textParts.map((part, idx) =>
          regex.test(part) ? (
            <mark key={idx} className={styles.highlight}>{part}</mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <div className={styles.overlay} onKeyDown={handleKeyDown}>
      <header className={styles.header}>
        <div className={styles.searchContainer}>
          <svg className={styles.searchIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            placeholder="Search luxury products, collections..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close search">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      <main className={styles.content}>
        <aside className={styles.sidebar}>
          {suggestions.length > 0 && (
            <div>
              <h3 className={styles.sectionTitle}>Suggestions</h3>
              <ul className={styles.suggestionsList}>
                {suggestions.map((suggestion, index) => (
                  <li
                    key={index}
                    className={styles.suggestionItem}
                    onClick={() => setQuery(suggestion)}
                  >
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className={styles.sectionTitle}>Shop by Category</h3>
            <ul className={styles.categoriesList}>
              {categories.map((cat, index) => (
                <li
                  key={index}
                  className={styles.categoryItem}
                  onClick={() => {
                    setQuery(cat);
                    inputRef.current?.focus();
                  }}
                >
                  {cat}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className={styles.resultsArea}>
          <h3 className={styles.sectionTitle}>Products</h3>
          {isLoading ? (
            <div className={styles.loader}>
              <svg width="30" height="30" viewBox="0 0 38 38" stroke="currentColor" style={{ animation: 'spin 1s linear infinite' }}>
                <defs>
                  <linearGradient x1="8.042%" y1="0%" x2="65.682%" y2="23.865%" id="a">
                    <stop stopColor="currentColor" stopOpacity="0" offset="0%"/>
                    <stop stopColor="currentColor" stopOpacity=".631" offset="63.146%"/>
                    <stop stopColor="currentColor" offset="100%"/>
                  </linearGradient>
                </defs>
                <g fill="none" fillRule="evenodd">
                  <g transform="translate(1 1)">
                    <path d="M36 18c0-9.94-8.06-18-18-18" id="Oval-2" stroke="url(#a)" strokeWidth="2">
                      <animateTransform attributeName="transform" type="rotate" from="0 18 18" to="360 18 18" dur="0.9s" repeatCount="indefinite" />
                    </path>
                    <circle fill="currentColor" cx="36" cy="18" r="1">
                      <animateTransform attributeName="transform" type="rotate" from="0 18 18" to="360 18 18" dur="0.9s" repeatCount="indefinite" />
                    </circle>
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
          ) : filteredProducts.length > 0 ? (
            <div className={styles.productResults}>
              {filteredProducts.map((p, idx) => {
                const cover = getPublicUrl(p.images?.[0]) || '/product-1.png';
                return (
                  <Link
                    key={p.id}
                    href={`/product/${p.slug}`}
                    className={`${styles.productCard} ${idx === activeIdx ? styles.activeProductCard : ''}`}
                    onClick={onClose}
                  >
                    <div className={styles.productImage}>
                      <img src={cover} alt={p.name} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                    </div>
                    <div className={styles.productInfo}>
                      <span className={styles.productName}>{highlightText(p.name, query)}</span>
                      <span className={styles.productMeta}>{p.category}</span>
                    </div>
                    <span className={styles.productPrice}>
                      {p.sale_price_paise ? (
                        <>
                          <span style={{ marginRight: '8px' }}>{formatPaise(p.sale_price_paise)}</span>
                          <span style={{ textDecoration: 'line-through', opacity: 0.5, fontSize: '0.75rem' }}>{formatPaise(p.price_paise)}</span>
                        </>
                      ) : (
                        formatPaise(p.price_paise)
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : query.trim() ? (
            <div className={styles.emptyState}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p>No luxury products match &ldquo;{query}&rdquo;.</p>
              <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Try checking your spelling or looking for categories like Linen.</span>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>Type above to instantly discover the catalogue.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
