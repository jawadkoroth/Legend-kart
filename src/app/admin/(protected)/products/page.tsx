'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/useToast';
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
        <>
          <div className={styles.list}>
            {products.map((product) => {
              const isOpen = expanded.has(product.id);
              const stock = totalStock(product.inventory);
              const firstImage =
                product.images && product.images.length > 0
                  ? product.images[0]
                  : null;
              const archived = product.archived_at !== null;
              return (
                <div
                  key={product.id}
                  className={`${styles.row} ${archived ? styles.rowArchived : ''}`}
                >
                  {/* Thumb */}
                  <div className={styles.thumb}>
                    {firstImage ? (
                      <Image
                        src={firstImage}
                        alt={product.name}
                        fill
                        sizes="64px"
                        style={{ objectFit: 'cover' }}
                      />
                    ) : (
                      <div className={styles.thumbPlaceholder}>NO IMG</div>
                    )}
                  </div>

                  {/* Identity */}
                  <div className={styles.identity}>
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className={styles.name}
                    >
                      {product.name}
                    </Link>
                    <div className={styles.metaLine}>
                      <span className={styles.slug}>/{product.slug}</span>
                      {product.category && (
                        <span className={styles.category}>{product.category}</span>
                      )}
                    </div>
                  </div>

                  {/* Price */}
                  <div className={styles.priceBlock}>
                    {product.sale_price_paise ? (
                      <>
                        <span className={styles.priceLive}>
                          {formatPrice(product.sale_price_paise)}
                        </span>
                        <span className={styles.priceStrike}>
                          {formatPrice(product.price_paise)}
                        </span>
                        <span className={styles.priceSaleHint}>On sale</span>
                      </>
                    ) : (
                      <span className={styles.priceLive}>
                        {formatPrice(product.price_paise)}
                      </span>
                    )}
                  </div>

                  {/* Stock chip */}
                  <span className={`${styles.stockChip} ${stockClass(stock)}`}>
                    <span className={styles.stockDot} />
                    {stock} in stock
                  </span>

                  {/* Status pill */}
                  <span
                    className={`${styles.statusPill} ${
                      archived
                        ? styles.statusArchived
                        : product.is_active
                          ? styles.statusActive
                          : styles.statusInactive
                    }`}
                  >
                    {archived ? 'Archived' : product.is_active ? 'Live' : 'Inactive'}
                  </span>

                  {/* Actions */}
                  <div className={styles.actions}>
                    {archived ? (
                      <button
                        type="button"
                        onClick={() => restoreProduct(product)}
                        className={styles.iconBtn}
                      >
                        Restore
                      </button>
                    ) : (
                      <>
                        <label
                          className={styles.toggle}
                          title={product.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <input
                            type="checkbox"
                            checked={product.is_active}
                            onChange={() =>
                              toggleActive(product.id, product.is_active)
                            }
                            aria-label={`Toggle active for ${product.name}`}
                          />
                        </label>
                        <Link
                          href={`/admin/products/${product.id}/edit`}
                          className={styles.iconBtn}
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setArchiving(product);
                            setArchiveError('');
                          }}
                          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                          aria-label={`Archive ${product.name}`}
                        >
                          Archive
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className={`${styles.expandBtn} ${
                        isOpen ? styles.expandBtnOpen : ''
                      }`}
                      onClick={() => toggleExpand(product.id)}
                      aria-expanded={isOpen}
                      aria-label={
                        isOpen ? 'Collapse stock detail' : 'Expand stock detail'
                      }
                    >
                      ⌄
                    </button>
                  </div>

                  {/* Expanded stock grid */}
                  {isOpen && (
                    <div className={styles.expand}>
                      {(product.inventory ?? []).length === 0 ? (
                        <p className="text-xs text-muted">
                          No size inventory rows. Add sizes in the edit screen.
                        </p>
                      ) : (
                        (product.inventory ?? []).map((inv) => (
                          <div key={inv.size} className={styles.sizeCell}>
                            <span className={styles.sizeLabel}>{inv.size}</span>
                            <div className={styles.stepper}>
                              <button
                                type="button"
                                className={styles.stepperBtn}
                                onClick={() =>
                                  updateStock(product.id, inv.size, inv.stock - 1)
                                }
                                aria-label={`Decrease ${inv.size} stock`}
                                disabled={inv.stock === 0}
                              >
                                −
                              </button>
                              <span
                                className={`${styles.stepperVal} ${
                                  inv.stock === 0 ? styles.stepperValZero : ''
                                }`}
                              >
                                {inv.stock}
                              </span>
                              <button
                                type="button"
                                className={styles.stepperBtn}
                                onClick={() =>
                                  updateStock(product.id, inv.size, inv.stock + 1)
                                }
                                aria-label={`Increase ${inv.size} stock`}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination Navigation */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 'var(--space-5, 24px)',
                padding: '16px 24px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-lg, 12px)',
                gap: 'var(--space-2)'
              }}
            >
              {page > 1 ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ width: 'auto' }}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Prev
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ width: 'auto', opacity: 0.4, cursor: 'not-allowed' }}
                  disabled
                >
                  ← Prev
                </button>
              )}
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ width: 'auto' }}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next →
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ width: 'auto', opacity: 0.4, cursor: 'not-allowed' }}
                  disabled
                >
                  Next →
                </button>
              )}
            </div>
          )}
        </>
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
