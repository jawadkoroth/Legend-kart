'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminFeedbackDrawer from '@/components/AdminFeedbackDrawer';
import AdminRealtimeProvider from '@/components/admin/AdminRealtimeProvider';
import AdminPushPrompt from '@/components/admin/AdminPushPrompt';
import AdminReturnsBadge from '@/components/admin/AdminReturnsBadge';
import { useAuth } from '@/lib/auth/AuthProvider';
import { createClient } from '@/lib/supabase/client';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Home', icon: '📊' },
  { href: '/admin/orders', label: 'Orders', icon: '📦' },
  { href: '/admin/products', label: 'Products', icon: '👕' },
  { href: '/admin/coupons', label: 'Coupons', icon: '🏷️' },
  { href: '/admin/shipping', label: 'Shipping', icon: '🚚' },
  { href: '/admin/diagnostics', label: 'Diag', icon: '🩺' },
  { href: '/admin/settings', label: 'Settings', icon: '⚙️' },
];

export default function AdminShell({
  initialUnreadCount,
  children,
}: {
  initialUnreadCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const handleLogout = async () => {
    if (confirm('Are you sure you want to log out?')) {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace('/admin');
    }
  };

  useEffect(() => {
    const isMobileApp = typeof navigator !== 'undefined' && navigator.userAgent.includes('PANTHER_MOBILE');
    if (isMobileApp && !loading && !user) {
      router.replace('/admin');
    }
  }, [user, loading, router]);

  const isMobileApp = typeof navigator !== 'undefined' && navigator.userAgent.includes('PANTHER_MOBILE');
  if (isMobileApp && loading) {
    return (
      <div style={{
        display: 'flex',
        height: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0B0B0B',
        color: '#8A8A8A',
        fontFamily: 'monospace',
        fontSize: '0.8rem',
        letterSpacing: '0.1em'
      }}>
        RESTORING SESSION...
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <div className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: 600, letterSpacing: '0.1em' }}>NOIR</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.15em' }}>ADMIN</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <AdminReturnsBadge />
          <AdminPushPrompt />
          <button
            onClick={() => setIsFeedbackOpen(true)}
            className="admin-header-btn"
            title="Feedback & Support"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: '2px', right: '2px', background: 'var(--error)', color: 'white', fontSize: '9px', fontWeight: 'bold', padding: '1px 5px', borderRadius: '10px', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={handleLogout}
            className="admin-header-btn"
            title="Logout"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      <AdminRealtimeProvider />

      <div className="admin-content">{children}</div>

      <AdminFeedbackDrawer
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        onUnreadDelta={delta =>
          setUnreadCount(prev => Math.max(0, prev + delta))
        }
      />

      <nav className="admin-nav">
        {NAV_ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`admin-nav-item ${pathname === item.href || pathname.startsWith(item.href + '/') ? 'admin-nav-item-active' : ''}`}
          >
            <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div style={{ height: '70px' }} />

    </div>
  );
}
