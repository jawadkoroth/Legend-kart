'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/useToast';

interface Product {
  id: string;
  name: string;
  slug: string;
  price_paise: number;
  sale_price_paise: number | null;
  is_active: boolean;
  archived_at: string | null;
  inventory?: { size: string; stock: number }[];
}

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  // When true, the list includes archived products. Archived rows
  // are soft-deleted: archived_at IS NOT NULL AND is_active=false.
  const [showArchived, setShowArchived] = useState(false);
  const [archiving, setArchiving] = useState<Product | null>(null);
  const [archivePending, setArchivePending] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const { toast, showToast } = useToast();
  const searchParams = useSearchParams();

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  // Show success toast when redirected from create/edit
  useEffect(() => {
    if (searchParams.get('saved') === '1') {
      showToast('Product saved successfully', 'success');
      // Clean the URL so refreshing doesn't re-show the toast
      window.history.replaceState({}, '', '/admin/products');
    }
  }, [searchParams, showToast]);

  async function fetchProducts() {
    const supabase = createClient();
    let query = supabase
      .from('products')
      .select('id, name, slug, price_paise, sale_price_paise, is_active, archived_at')
      .order('created_at', { ascending: false });
    // Default admin view hides archived rows so the live catalogue
    // is the first thing an operator sees. Toggle flips to all.
    if (!showArchived) {
      query = query.is('archived_at', null);
    }
    const { data } = await query;

    if (data) {
      const ids = data.map(p => p.id);
      const { data: inv } = await supabase
        .from('inventory')
        .select('product_id, size, stock')
        .in('product_id', ids);

      const enriched = data.map(p => ({
        ...p,
        inventory: (inv || []).filter(i => i.product_id === p.id),
      }));
      setProducts(enriched as Product[]);
    } else {
      showToast('Failed to load products', 'error');
    }
    setLoading(false);
  }

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
      await fetchProducts();
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
      await fetchProducts();
    } catch (err) {
      console.error('[PRODUCT_RESTORE]', err);
      showToast('Network error', 'error');
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    const supabase = createClient();
    const { error } = await supabase.from('products').update({ is_active: !isActive }).eq('id', id);
    if (!error) {
      showToast(`Product ${!isActive ? 'activated' : 'deactivated'}`, 'success');
      fetchProducts();
    } else {
      showToast('Failed to toggle status', 'error');
    }
  }

  async function updateStock(productId: string, size: string, newStock: number) {
    const supabase = createClient();
    const { error } = await supabase
      .from('inventory')
      .update({ stock: Math.max(0, newStock) })
      .eq('product_id', productId)
      .eq('size', size);

    if (!error) fetchProducts();
    else showToast('Failed to update stock', 'error');
  }

  const formatPrice = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN');
  const totalStock = (inv: { stock: number }[]) => inv.reduce((s, i) => s + i.stock, 0);

  if (loading) return <div className="animate-pulse text-muted" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Products</h1>
        <Link href="/admin/products/new" className="btn btn-primary btn-sm">
          + Add Product
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <button
          type="button"
          onClick={() => setShowArchived(false)}
          className={`btn btn-sm ${!showArchived ? 'btn-primary' : 'btn-ghost'}`}
          style={{ width: 'auto' }}
        >
          Live
        </button>
        <button
          type="button"
          onClick={() => setShowArchived(true)}
          className={`btn btn-sm ${showArchived ? 'btn-primary' : 'btn-ghost'}`}
          style={{ width: 'auto' }}
        >
          Include archived
        </button>
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      {products.map(product => (
        <div key={product.id} className="card" style={{ marginBottom: 'var(--space-4)', opacity: product.is_active ? 1 : 0.6, filter: product.is_active ? 'none' : 'grayscale(0.5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
            <div>
              <p style={{ fontWeight: 600 }}>{product.name}</p>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginTop: '2px' }}>
                <span className="text-sm text-muted">{formatPrice(product.price_paise)}</span>
                {product.sale_price_paise && (
                  <span className="text-sm" style={{ color: 'var(--success)' }}>
                    Sale: {formatPrice(product.sale_price_paise)}
                  </span>
                )}
                <span className="text-xs text-muted">
                  Stock: {totalStock(product.inventory || [])}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              {product.archived_at ? (
                <>
                  <span
                    style={{
                      fontSize: '0.625rem',
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      padding: '2px 8px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 999,
                    }}
                  >
                    Archived
                  </span>
                  <button
                    type="button"
                    onClick={() => restoreProduct(product)}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '0.75rem' }}
                  >
                    Restore
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href={`/admin/products/${product.id}/edit`}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '0.75rem' }}
                  >
                    ✏️ Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setArchiving(product);
                      setArchiveError('');
                    }}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '0.75rem', color: 'var(--error)' }}
                    aria-label={`Archive product ${product.name}`}
                  >
                    Archive
                  </button>
                  <label className="premium-toggle" title="Toggle active status">
                    <input
                      type="checkbox"
                      checked={product.is_active}
                      onChange={() => toggleActive(product.id, product.is_active)}
                    />
                    <span className="premium-toggle-slider" />
                  </label>
                </>
              )}
            </div>
          </div>

          <p className="input-label" style={{ marginBottom: 'var(--space-2)' }}>Stock by Size</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-2)' }}>
            {(product.inventory || []).map(inv => (
              <div key={inv.size} style={{ textAlign: 'center' }}>
                <p className="text-xs text-muted">{inv.size}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px', marginTop: '4px' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '2px 6px', minHeight: 'auto', width: 'auto', fontSize: '0.75rem' }}
                    onClick={() => updateStock(product.id, inv.size, inv.stock - 1)}
                  >−</button>
                  <span style={{ minWidth: '20px', textAlign: 'center', fontWeight: 600, fontSize: '0.875rem', color: inv.stock === 0 ? 'var(--error)' : 'inherit' }}>
                    {inv.stock}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '2px 6px', minHeight: 'auto', width: 'auto', fontSize: '0.75rem' }}
                    onClick={() => updateStock(product.id, inv.size, inv.stock + 1)}
                  >+</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {products.length === 0 && (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          <p>{showArchived ? 'No archived products' : 'No products yet'}</p>
          {!showArchived && (
            <Link href="/admin/products/new" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-4)', width: 'auto' }}>
              Add Your First Product
            </Link>
          )}
        </div>
      )}

      {archiving && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-archive-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !archivePending) setArchiving(null);
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
              style={{ fontSize: '1.0625rem', fontWeight: 600, marginBottom: 'var(--space-3)' }}
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
              Archiving is reversible — use “Include archived” in the list and
              click Restore to bring the product back.
            </p>
            {archiveError && (
              <p className="input-error-text" style={{ marginBottom: 'var(--space-3)' }}>
                {archiveError}
              </p>
            )}
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
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
                className={`btn btn-primary btn-sm ${archivePending ? 'btn-loading' : ''}`}
                onClick={confirmArchive}
                disabled={archivePending}
                style={{ width: 'auto', background: 'var(--error)', borderColor: 'var(--error)' }}
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
