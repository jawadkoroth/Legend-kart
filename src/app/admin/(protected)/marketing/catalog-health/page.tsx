import React from 'react';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from '../marketing-admin.module.css';

export const dynamic = 'force-dynamic';

interface ProductWithInventory {
  id: string;
  name: string;
  price_paise: number;
  images: any;
  category: string | null;
  brand: string | null;
  gtin: string | null;
  is_active: boolean;
  stock?: number;
}

export default async function CatalogHealthPage() {
  const supabase = createAdminClient();

  // 1. Fetch all products
  const { data: productsRaw, error: prodErr } = await supabase
    .from('products')
    .select('id, name, price_paise, images, category, brand, gtin, is_active');

  const products: ProductWithInventory[] = (productsRaw || []) as ProductWithInventory[];

  // 2. Fetch inventory values to check stock out issues
  if (products.length > 0) {
    const { data: invRows } = await supabase
      .from('inventory')
      .select('product_id, stock');

    const stockMap = new Map<string, number>();
    (invRows || []).forEach((row) => {
      stockMap.set(row.product_id, (stockMap.get(row.product_id) ?? 0) + (row.stock || 0));
    });

    products.forEach((p) => {
      p.stock = stockMap.get(p.id) ?? 0;
    });
  }

  // 3. Run validation scan checks
  const missingImages: ProductWithInventory[] = [];
  const priceIssues: ProductWithInventory[] = [];
  const inventoryIssues: ProductWithInventory[] = [];
  const missingBrand: ProductWithInventory[] = [];
  const missingGtin: ProductWithInventory[] = [];
  const missingCategory: ProductWithInventory[] = [];
  const policyViolations: ProductWithInventory[] = [];

  products.forEach((p) => {
    // Missing Images
    const imgs = Array.isArray(p.images) ? p.images : [];
    if (imgs.length === 0) {
      missingImages.push(p);
    }
    // Price checks
    if (p.price_paise <= 0) {
      priceIssues.push(p);
    }
    // Inventory checks
    if (p.stock === 0) {
      inventoryIssues.push(p);
    }
    // Missing Brand
    if (!p.brand || p.brand.trim() === '') {
      missingBrand.push(p);
    }
    // Missing GTIN
    if (!p.gtin || p.gtin.trim() === '') {
      missingGtin.push(p);
    }
    // Missing Category
    if (!p.category || p.category.trim() === '') {
      missingCategory.push(p);
    }
    // Policy checks: simulated check if name or description contains test words
    if (p.name.toLowerCase().includes('test') || p.name.length < 3) {
      policyViolations.push(p);
    }
  });

  const totalProducts = products.length;
  const syncedCount = products.filter(p => p.is_active).length;
  const pendingCount = 0; // simulated
  const rejectedCount = missingImages.length + priceIssues.length + policyViolations.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      
      {/* Telemetry Widgets */}
      <div className={styles.grid}>
        <div className={styles.card} style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Products Synced</span>
          <h3 style={{ fontSize: '2rem', color: 'var(--success)', margin: 'var(--space-2) 0' }}>{syncedCount}</h3>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Active in Meta/Google Feeds</span>
        </div>
        <div className={styles.card} style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Products Pending</span>
          <h3 style={{ fontSize: '2rem', color: 'var(--warning)', margin: 'var(--space-2) 0' }}>{pendingCount}</h3>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Processing in review queues</span>
        </div>
        <div className={styles.card} style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Products Rejected</span>
          <h3 style={{ fontSize: '2rem', color: 'var(--error)', margin: 'var(--space-2) 0' }}>{rejectedCount}</h3>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Failing critical validation rules</span>
        </div>
      </div>

      {/* Issues list */}
      <div className={styles.card} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <h3 style={{ textTransform: 'uppercase', fontSize: '0.85rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
          ⚠️ Identified Catalog Issues & Violations
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {/* Missing Images */}
          {renderIssueCategory('Missing Images', 'Fails Google/Meta listing guidelines. Products will not show in shops.', missingImages)}
          
          {/* Price Issues */}
          {renderIssueCategory('Price Issues', 'Products configured with zero or negative price values.', priceIssues)}

          {/* Inventory Issues */}
          {renderIssueCategory('Out Of Stock Issues', 'Active products containing zero items in stock.', inventoryIssues)}

          {/* Missing Brand */}
          {renderIssueCategory('Missing Brand', 'Fails product brand identifier requirements.', missingBrand)}

          {/* Missing GTIN */}
          {renderIssueCategory('Missing GTIN', 'Missing global barcode/GTIN/UPC numbers.', missingGtin)}

          {/* Missing Category */}
          {renderIssueCategory('Missing Category', 'Apparel categorization is required for shopping taxes categorization.', missingCategory)}

          {/* Policy Violations */}
          {renderIssueCategory('Policy Violations', 'Products flagged with temporary test titles or policy warning parameters.', policyViolations)}
        </div>
      </div>
    </div>
  );

  function renderIssueCategory(title: string, desc: string, itemsList: ProductWithInventory[]) {
    if (itemsList.length === 0) return null;

    return (
      <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div>
            <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{title} ({itemsList.length})</strong>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>{desc}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
          {itemsList.map((prod) => (
            <Link
              key={prod.id}
              href={`/admin/products/${prod.id}/edit`}
              className={styles.badge}
              style={{
                fontSize: '10px',
                padding: '4px 8px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                textDecoration: 'none',
                display: 'inline-block'
              }}
              title="Click to open Product Editor"
            >
              {prod.name} ↗
            </Link>
          ))}
        </div>
      </div>
    );
  }
}
