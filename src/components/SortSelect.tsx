'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

const OPTIONS = [
  { value: 'latest', label: 'Latest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
] as const;

export type SortValue = (typeof OPTIONS)[number]['value'];

/**
 * Tiny client widget that updates `?sort=` on the products listing.
 *
 * Uses `router.replace` (not `push`) so the back button doesn't fill
 * up with sort permutations, and wraps the navigation in a transition
 * so the page stays interactive while RSC re-renders.
 */
export default function SortSelect({ current }: { current: SortValue }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(searchParams.toString());
    if (e.target.value === 'latest') {
      next.delete('sort');
    } else {
      next.set('sort', e.target.value);
    }
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `/products?${qs}` : '/products');
    });
  }

  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        fontSize: '0.8125rem',
        color: 'var(--text-muted)',
        opacity: isPending ? 0.6 : 1,
        transition: 'opacity 0.2s ease',
      }}
    >
      <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Sort</span>
      <select
        value={current}
        onChange={onChange}
        disabled={isPending}
        style={{
          background: 'var(--bg-input, transparent)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-color)',
          padding: '6px 10px',
          fontSize: '0.8125rem',
          borderRadius: 'var(--radius-sm, 4px)',
          cursor: 'pointer',
        }}
      >
        {OPTIONS.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
