'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface Product {
  id: string;
  name: string;
  slug: string;
  price_paise: number;
  sale_price_paise: number | null;
  is_active: boolean;
  inventory?: { size: string; stock: number }[];
}

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    const supabase = createClient();
    const { data } = await supabase
      .from('products')
      .select('id, name, slug, price_paise, sale_price_paise, is_active')
      .order('created_at', { ascending: false });

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
      setProducts(enriched);
    }
    setLoading(false);
  }

  async function toggleActive(id: string, isActive: boolean) {
    const supabase = createClient();
    await supabase.from('products').update({ is_active: !isActive }).eq('id', id);
    fetchProducts();
  }

  async function updateStock(productId: string, size: string, newStock: number) {
    const supabase = createClient();
    await supabase
      .from('inventory')
      .update({ stock: Math.max(0, newStock) })
      .eq('product_id', productId)
      .eq('size', size);
    fetchProducts();
  }

  const formatPrice = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN');
  const totalStock = (inv: { stock: number }[]) => inv.reduce((s, i) => s + i.stock, 0);

  if (loading) return <div className="animate-pulse text-muted" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Products</h1>
        <Link href="/admin/products/new" className="btn btn-primary btn-sm">
          + Add Product
        </Link>
      </div>

      {products.map(product => (
        <div key={product.id} className="card" style={{ marginBottom: 'var(--space-4)' }}>
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
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Link
                href={`/admin/products/${product.id}/edit`}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '0.75rem' }}
              >
                ✏️ Edit
              </Link>
              <button
                className={`btn btn-sm ${product.is_active ? 'btn-success' : 'btn-secondary'}`}
                onClick={() => toggleActive(product.id, product.is_active)}
              >
                {product.is_active ? 'Active' : 'Off'}
              </button>
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
          <p>No products yet</p>
          <Link href="/admin/products/new" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-4)', width: 'auto' }}>
            Add Your First Product
          </Link>
        </div>
      )}
    </div>
  );
}
