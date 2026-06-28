'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/useToast';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import styles from './products.module.css';

/**
 * /admin/products — luxury inventory surface.
 *
 * Architecture preserved verbatim from the previous iteration:
 *   - Loads products + inventory in two queries (no schema/RLS change).
 *   - Archive / restore go through /api/admin/products/[id] so server
 *     authorisation, RLS, and audit logging keep working unchanged.
 *   - is_active toggle and per-size stock writes go direct via the
 *     RLS-enforced client.
 *
 * Visual layer is owned entirely by `products.module.css`. The page
 * is a calm row list with a sticky toolbar (search · status filter ·
 * sort · count · +Add). Stock-by-size editing is preserved but
 * collapsed by default behind an expand chevron, so the catalogue
 * scans cleanly at rest.
 */

interface InventoryRow { size: string; stock: number }

interface Product {
  id: string;
  name: string;
  slug: string;
  price_paise: number;
  sale_price_paise: number | null;
  is_active: boolean;
  archived_at: string | null;
  category: string | null;
  images: string[] | null;
  created_at: string;
  inventory?: InventoryRow[];
}

type StatusFilter = 'all' | 'live' | 'inactive' | 'archived';
type SortKey =
  | 'newest'
  | 'oldest'
  | 'price_asc'
  | 'price_desc'
  | 'stock_desc';

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('live');
  const [sort, setSort] = useState<SortKey>('newest');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [archiving, setArchiving] = useState<Product | null>(null);
  const [archivePending, setArchivePending] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const { toast, showToast } = useToast();
  const searchParams = useSearchParams();

  // Pagination states
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Debounced search query
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page to 1 on filter/search/sort change
  useEffect(() => {
    setPage(1);
  }, [status, debouncedSearch, sort]);

  const includeArchivedInFetch = status === 'all' || status === 'archived';

  const fetchProducts = useCallback(async (includeArchived: boolean, currentPage: number, searchQuery: string, currentSort: SortKey) => {
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from('products')
      .select(
        'id, name, slug, price_paise, sale_price_paise, is_active, archived_at, category, images, created_at',
        { count: 'exact' }
      );

    // Status filtering on server
    if (status === 'live') {
      query = query.is('archived_at', null).eq('is_active', true);
    } else if (status === 'inactive') {
      query = query.is('archived_at', null).eq('is_active', false);
    } else if (status === 'archived') {
      query = query.not('archived_at', 'is', null);
    } else {
      if (!includeArchived) query = query.is('archived_at', null);
    }

    // Search filtering on server
    const trimmed = searchQuery.trim();
    if (trimmed) {
      query = query.or(
        `name.ilike.%${trimmed}%,slug.ilike.%${trimmed}%,category.ilike.%${trimmed}%`
      );
    }

    // Sorting on server
    if (currentSort === 'oldest') {
      query = query.order('created_at', { ascending: true });
    } else if (currentSort === 'price_asc') {
      query = query.order('price_paise', { ascending: true });
    } else if (currentSort === 'price_desc') {
      query = query.order('price_paise', { ascending: false });
    } else {
      // newest and stock_desc fallback (we sort stock_desc in memory after fetch)
      query = query.order('created_at', { ascending: false });
    }

    // Range pagination
    const offset = (currentPage - 1) * pageSize;
    query = query.range(offset, offset + pageSize - 1);

    const { data, count } = await query;
    if (!data) {
      showToast('Failed to load products', 'error');
      setLoading(false);
      return;
    }

    setTotalCount(count ?? 0);

    const ids = data.map((p) => p.id);
    let inv: { product_id: string; size: string; stock: number }[] = [];
    if (ids.length > 0) {
      const { data: invRows } = await supabase
        .from('inventory')
        .select('product_id, size, stock')
        .in('product_id', ids);
      inv = invRows ?? [];
    }

    let enriched: Product[] = data.map((p) => ({
      ...p,
      images: Array.isArray(p.images) ? (p.images as string[]) : null,
      inventory: inv
        .filter((i) => i.product_id === p.id)
        .sort((a, b) => a.size.localeCompare(b.size)),
    }));

    if (currentSort === 'stock_desc') {
      const totalStock = (p: Product) => (p.inventory ?? []).reduce((s, i) => s + i.stock, 0);
      enriched = enriched.sort((a, b) => totalStock(b) - totalStock(a));
    }

    setProducts(enriched);
    setLoading(false);
  }, [status, pageSize, showToast]);

  useEffect(() => {
    fetchProducts(includeArchivedInFetch, page, debouncedSearch, sort);
  }, [fetchProducts, includeArchivedInFetch, page, debouncedSearch, sort]);

  useEffect(() => {
    if (searchParams.get('saved') === '1') {
      showToast('Product saved', 'success');
      window.history.replaceState({}, '', '/admin/products');
    }
  }, [searchParams, showToast]);

  // -------- Actions ----------------------------------------------
  async function confirmArchive() {
    if (!archiving || archivePending) return;
    setArchivePending(true);
    setArchiveError('');
    try {
      const res = await fetch(`/api/admin/products/${archiving.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) {
        setArchiveError(data.error || 'Failed to archive product');
        setArchivePending(false);
        return;
      }
      setArchiving(null);
      setArchivePending(false);
      showToast('Product archived', 'success');
      await fetchProducts(includeArchivedInFetch, page, debouncedSearch, sort);
    } catch (err) {
      console.error('[PRODUCT_ARCHIVE]', err);
      setArchiveError('Network error. Please try again.');
      setArchivePending(false);
    }
  }

  async function restoreProduct(product: Product) {
    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'restore' }),
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.error || 'Failed to restore', 'error');
        return;
      }
      showToast('Product restored', 'success');
      await fetchProducts(includeArchivedInFetch, page, debouncedSearch, sort);
    } catch (err) {
      console.error('[PRODUCT_RESTORE]', err);
      showToast('Network error', 'error');
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    const supabase = createClient();
    const { error } = await supabase
      .from('products')
      .update({ is_active: !isActive })
      .eq('id', id);
    if (error) {
      showToast('Failed to toggle status', 'error');
      return;
    }
    showToast(`Product ${!isActive ? 'activated' : 'deactivated'}`, 'success');
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, is_active: !isActive } : p)),
    );
  }

  async function updateStock(productId: string, size: string, newStock: number) {
    const clamped = Math.max(0, newStock);
    const supabase = createClient();
    const { error } = await supabase
      .from('inventory')
      .update({ stock: clamped })
      .eq('product_id', productId)
      .eq('size', size);
    if (error) {
      showToast('Failed to update stock', 'error');
      return;
    }
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? {
              ...p,
              inventory: (p.inventory ?? []).map((i) =>
                i.size === size ? { ...i, stock: clamped } : i,
              ),
            }
          : p,
      ),
    );
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // -------- Helpers ----------------------------------------------
  const formatPrice = (paise: number) =>
    '₹' + (paise / 100).toLocaleString('en-IN');
  const totalStock = (inv: InventoryRow[] | undefined) =>
    (inv ?? []).reduce((s, i) => s + i.stock, 0);
  const stockClass = (n: number) =>
    n === 0 ? styles.stockOut : n <= 10 ? styles.stockLow : styles.stockHigh;


  // -------- Render -----------------------------------------------
  const columns: AdminTableColumn<Product>[] = [
    {
      key: 'images',
      label: 'Image',
      sortable: false,
      width: 80,
      render: (row) => {
        const firstImage = row.images && row.images.length > 0 ? row.images[0] : null;
        return (
          <div style={{ position: 'relative', width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
            {firstImage ? (
              <Image src={firstImage} alt={row.name} fill sizes="40px" style={{ objectFit: 'cover' }} />
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', fontSize: '8px', color: 'var(--text-muted)' }}>NO IMG</div>
            )}
          </div>
        );
      }
    },
    {
      key: 'name',
      label: 'Product Details',
      sortable: true,
      width: 220,
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Link href={`/admin/products/${row.id}/edit`} style={{ fontWeight: 600, textDecoration: 'underline', color: 'var(--accent-gold)' }}>
            {row.name}
          </Link>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/{row.slug}</span>
          {row.category && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '4px', width: 'fit-content', marginTop: '2px' }}>{row.category}</span>}
        </div>
      )
    },
    {
      key: 'price_paise',
      label: 'Pricing',
      sortable: true,
      width: 140,
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {row.sale_price_paise ? (
            <>
              <span style={{ color: 'var(--accent-gold)', fontWeight: 'bold' }}>{formatPrice(row.sale_price_paise)}</span>
              <span style={{ textDecoration: 'line-through', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatPrice(row.price_paise)}</span>
            </>
          ) : (
            <span>{formatPrice(row.price_paise)}</span>
          )}
        </div>
      )
    },
    {
      key: 'inventory',
      label: 'Inventory & Sizes',
      sortable: false,
      width: 240,
      render: (row) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {(row.inventory ?? []).map((inv) => (
            <div
              key={inv.size}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                padding: '2px 6px',
                borderRadius: '6px',
                fontSize: '0.7rem',
                gap: '4px'
              }}
            >
              <span style={{ fontWeight: 600 }}>{inv.size}</span>:
              <button
                onClick={() => updateStock(row.id, inv.size, inv.stock - 1)}
                disabled={inv.stock === 0}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px' }}
              >
                -
              </button>
              <span style={{ color: inv.stock === 0 ? 'var(--error)' : 'var(--text-primary)', fontWeight: 'bold' }}>
                {inv.stock}
              </span>
              <button
                onClick={() => updateStock(row.id, inv.size, inv.stock + 1)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px' }}
              >
                +
              </button>
            </div>
          ))}
        </div>
      )
    }
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Products</h1>
          <span className={styles.count}>
            {totalCount} {totalCount === 1 ? 'item' : 'items'}
          </span>
        </div>
        <Link href="/admin/products/new" className={`btn btn-primary btn-sm ${styles.addCta}`}>
          + Add Product
        </Link>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <span className={styles.searchIcon} aria-hidden>⌕</span>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search name, slug or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search products"
          />
          {search && (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className={styles.segmented} role="tablist" aria-label="Filter by status">
          {(
            [
              ['live', 'Live'],
              ['inactive', 'Inactive'],
              ['archived', 'Archived'],
              ['all', 'All'],
            ] as [StatusFilter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={status === key}
              onClick={() => setStatus(key)}
              className={`${styles.segmentedBtn} ${
                status === key ? styles.segmentedBtnActive : ''
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          className={styles.sort}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort products"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="price_desc">Price · high → low</option>
          <option value="price_asc">Price · low → high</option>
          <option value="stock_desc">Stock · high → low</option>
        </select>
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      {loading ? (
        <div className={styles.list}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.skeleton} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {search
              ? 'No matches'
              : status === 'archived'
                ? 'No archived products'
                : 'No products yet'}
          </p>
          <p className={styles.emptyHint}>
            {search
              ? 'Try a different search term or clear filters.'
              : 'Add your first product to start selling.'}
          </p>
          {!search && status !== 'archived' && (
            <Link
              href="/admin/products/new"
              className="btn btn-primary btn-sm"
              style={{ width: 'auto' }}
            >
              + Add Product
            </Link>
          )}
        </div>
      ) : (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '20px' }}>
        <AdminTable
          columns={columns}
          data={products}
          total={totalCount}
          limit={pageSize}
          offset={(page - 1) * pageSize}
          onPageChange={(newOffset) => setPage(Math.floor(newOffset / pageSize) + 1)}
          loading={loading}
          emptyMessage={search ? 'No matches found.' : status === 'archived' ? 'No archived products.' : 'No products catalogued.'}
        />
      </div>
      )}

      {archiving && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-archive-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !archivePending) {
              setArchiving(null);
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-5)',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-6)',
              maxWidth: 460,
              width: '100%',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.45)',
            }}
          >
            <h2
              id="product-archive-title"
              style={{
                fontSize: '1.0625rem',
                fontWeight: 600,
                marginBottom: 'var(--space-3)',
              }}
            >
              Archive “{archiving.name}”?
            </h2>
            <p
              className="text-sm text-muted"
              style={{ lineHeight: 1.55, marginBottom: 'var(--space-3)' }}
            >
              This hides the product from the storefront and cart, and marks it
              inactive. Historical orders, invoices and order detail pages keep
              their reference intact.
            </p>
            <p
              className="text-sm text-muted"
              style={{ lineHeight: 1.55, marginBottom: 'var(--space-5)' }}
            >
              Archiving is reversible — use the “Archived” filter and click
              Restore to bring the product back.
            </p>
            {archiveError && (
              <p
                className="input-error-text"
                style={{ marginBottom: 'var(--space-3)' }}
              >
                {archiveError}
              </p>
            )}
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setArchiving(null)}
                disabled={archivePending}
                style={{ width: 'auto' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn btn-primary btn-sm ${
                  archivePending ? 'btn-loading' : ''
                }`}
                onClick={confirmArchive}
                disabled={archivePending}
                style={{
                  width: 'auto',
                  background: 'var(--error)',
                  borderColor: 'var(--error)',
                }}
              >
                {archivePending ? 'ARCHIVING…' : 'ARCHIVE PRODUCT'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
