'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatPaise } from '@/lib/format';
import styles from './AdminSearchOverlay.module.css';

interface SearchResultItem {
  id: string;
  title: string;
  category: 'Order' | 'Customer' | 'Product' | 'Coupon' | 'Page';
  href: string;
  subtitle?: string;
  badge?: string;
}

interface SearchPageResult {
  title: string;
  category: 'Page';
  href: string;
  description: string;
}

const ADMIN_PAGES: SearchPageResult[] = [
  { title: 'Dashboard Home', category: 'Page', href: '/admin/dashboard', description: 'Overview of business stats and sales' },
  { title: 'Analytics Dashboard', category: 'Page', href: '/admin/dashboard#analytics', description: 'Deep-dive metrics and reports' },
  { title: 'Orders Directory', category: 'Page', href: '/admin/orders', description: 'Manage customer orders, billing, and fulfillment' },
  { title: 'Returns Center', category: 'Page', href: '/admin/orders#returns', description: 'Handle product returns and processing' },
  { title: 'Exchanges Center', category: 'Page', href: '/admin/orders#exchanges', description: 'Handle size/product exchanges' },
  { title: 'Products Catalogue', category: 'Page', href: '/admin/products', description: 'Inventory management and items list' },
  { title: 'Create New Product', category: 'Page', href: '/admin/products/new', description: 'Shortcut: Add a new apparel product to the catalog' },
  { title: 'Catalog Quality Diagnostics', category: 'Page', href: '/admin/marketing/catalog-health', description: 'Audit product feeds, missing descriptions, or brand data' },
  { title: 'Customer Directory', category: 'Page', href: '/admin/customers', description: 'Customer profiles and lifetimes values' },
  { title: 'Customer Segments', category: 'Page', href: '/admin/marketing/audiences', description: 'Target segments, VIP lists, and filter rules' },
  { title: 'Marketing Overview', category: 'Page', href: '/admin/marketing', description: 'Acquisition splits, revenue attribution, conversion funnels' },
  { title: 'Marketing Connections', category: 'Page', href: '/admin/marketing/providers', description: 'Destinations dispatcher (Meta pixel, Google setup)' },
  { title: 'Automation Flows', category: 'Page', href: '/admin/automation', description: 'Workflows, triggers, and condition engines' },
  { title: 'Automation Templates', category: 'Page', href: '/admin/automation/templates', description: 'Prebuilt blueprints (Cart Abandonment, VIP Welcome)' },
  { title: 'Automation History', category: 'Page', href: '/admin/automation/executions', description: 'Logs, status reports, and execution reruns' },
  { title: 'Automation Settings', category: 'Page', href: '/admin/automation/settings', description: 'Runner worker options' },
  { title: 'Shipping Configurations', category: 'Page', href: '/admin/shipping', description: 'Delhivery provider rules and parameters' },
  { title: 'Coupons Manager', category: 'Page', href: '/admin/coupons', description: 'Discount codes and usage campaigns' },
  { title: 'Create New Coupon', category: 'Page', href: '/admin/coupons', description: 'Shortcut: Set up a new discount promo campaign code' },
  { title: 'System Settings', category: 'Page', href: '/admin/settings', description: 'Store configs, users & roles, payments, integrations' },
  { title: 'Database Health Diagnostics', category: 'Page', href: '/admin/settings/developer/database-health', description: 'Developer DB diagnostics & health logs' }
];

interface AdminSearchOverlayProps {
  onClose: () => void;
}

export default function AdminSearchOverlay({ onClose }: AdminSearchOverlayProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    inputRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  // Search logic
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      // Default show pages that match or default pages
      setResults(
        ADMIN_PAGES.slice(0, 8).map((p, idx) => ({
          id: `page-${idx}`,
          title: p.title,
          category: 'Page',
          href: p.href,
          subtitle: p.description
        }))
      );
      setActiveIndex(0);
      setLoading(false);
      return;
    }

    setLoading(true);

    const delayDebounce = setTimeout(() => {
      startTransition(async () => {
        try {
          const supabase = createClient();
          const cleanTerm = term.replace(/[%_]/g, '\\$&');

          // Match static pages
          const pageMatches = ADMIN_PAGES.filter(
            p =>
              p.title.toLowerCase().includes(term.toLowerCase()) ||
              p.description.toLowerCase().includes(term.toLowerCase())
          ).map((p, idx) => ({
            id: `page-${idx}`,
            title: p.title,
            category: 'Page' as const,
            href: p.href,
            subtitle: p.description
          }));

          // DB parallel queries
          const [prodRes, custRes, orderRes, coupRes] = await Promise.all([
            supabase
              .from('products')
              .select('id, name, slug, price_paise, category')
              .ilike('name', `%${cleanTerm}%`)
              .limit(4),
            supabase
              .from('customer_profiles')
              .select('id, name, email, phone')
              .or(`name.ilike.%${cleanTerm}%,email.ilike.%${cleanTerm}%,phone.ilike.%${cleanTerm}%`)
              .limit(4),
            supabase
              .from('orders')
              .select('id, order_number, total_paise, customer')
              .or(`order_number.ilike.%${cleanTerm}%,customer->>name.ilike.%${cleanTerm}%`)
              .limit(4),
            supabase
              .from('coupons')
              .select('id, code, discount_percent, is_active')
              .ilike('code', `%${cleanTerm}%`)
              .limit(4)
          ]);

          const prodItems = (prodRes.data || []).map(p => ({
            id: `prod-${p.id}`,
            title: p.name,
            category: 'Product' as const,
            href: `/admin/products/${p.id}/edit`,
            subtitle: `${p.category || 'General'} • ${formatPaise(p.price_paise)}`
          }));

          const custItems = (custRes.data || []).map(c => ({
            id: `cust-${c.id}`,
            title: c.name || 'Unnamed Customer',
            category: 'Customer' as const,
            href: `/admin/customers/${c.id}`,
            subtitle: `${c.email || ''} ${c.phone ? `• ${c.phone}` : ''}`
          }));

          const orderItems = (orderRes.data || []).map(o => {
            const customerObj = typeof o.customer === 'string' ? JSON.parse(o.customer) : o.customer;
            const customerName = customerObj?.name || 'Guest Customer';
            return {
              id: `order-${o.id}`,
              title: `Order #${o.order_number}`,
              category: 'Order' as const,
              href: `/admin/orders/${o.id}`,
              subtitle: `Customer: ${customerName} • Total: ${formatPaise(o.total_paise)}`
            };
          });

          const coupItems = (coupRes.data || []).map(c => ({
            id: `coup-${c.id}`,
            title: `Coupon: ${c.code}`,
            category: 'Coupon' as const,
            href: `/admin/coupons`,
            subtitle: `${c.discount_percent}% off • Status: ${c.is_active ? 'Active' : 'Inactive'}`,
            badge: c.is_active ? 'ACTIVE' : 'INACTIVE'
          }));

          const combined = [
            ...pageMatches,
            ...orderItems,
            ...custItems,
            ...prodItems,
            ...coupItems
          ];

          setResults(combined);
          setActiveIndex(0);
        } catch (err) {
          console.error('[ADMIN_GLOBAL_SEARCH]', err);
        } finally {
          setLoading(false);
        }
      });
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIndex]) {
        router.push(results[activeIndex].href);
        onClose();
      }
    }
  };

  const handleSelectIndex = (index: number) => {
    if (results[index]) {
      router.push(results[index].href);
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onKeyDown={handleKeyDown} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        
        {/* Search Input field */}
        <div className={styles.searchHeader}>
          <svg className={styles.searchIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Search orders, customers, products, coupons or admin pages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className={styles.closeBtn} onClick={onClose} title="Close search (Esc)">
            ✕
          </button>
        </div>

        {/* Results panel */}
        <div className={styles.resultsBody}>
          {loading && (
            <div className={styles.spinnerArea}>
              <div className={styles.spinner} />
              <span>Scanning databases...</span>
            </div>
          )}

          {!loading && results.length === 0 && query.trim() && (
            <div className={styles.emptyState}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <h3>No administrative records found</h3>
              <p>No orders, customers, products, coupons, or admin pages match &ldquo;{query}&rdquo;.</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className={styles.resultsList}>
              <div className={styles.resultsHeader}>
                <span>Search results ({results.length})</span>
                <span className={styles.shortcutsHelp}>Use ↑↓ to navigate, Enter to select</span>
              </div>
              {results.map((item, idx) => (
                <div
                  key={item.id}
                  className={`${styles.resultRow} ${idx === activeIndex ? styles.activeRow : ''}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => handleSelectIndex(idx)}
                >
                  <div className={styles.rowInfo}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={styles.itemTitle}>{item.title}</span>
                      {item.badge && (
                        <span className={styles.badge}>{item.badge}</span>
                      )}
                    </div>
                    {item.subtitle && (
                      <span className={styles.itemSubtitle}>{item.subtitle}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={styles.categoryLabel}>{item.category}</span>
                    <span className={styles.arrow}>→</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions helper */}
        <div className={styles.searchFooter}>
          <div className={styles.shortcutGroup}>
            <kbd className={styles.kbd}>Esc</kbd> <span>to close</span>
          </div>
          <div className={styles.shortcutGroup}>
            <kbd className={styles.kbd}>↑↓</kbd> <span>to browse</span>
          </div>
          <div className={styles.shortcutGroup}>
            <kbd className={styles.kbd}>Enter</kbd> <span>to select</span>
          </div>
        </div>

      </div>
    </div>
  );
}
