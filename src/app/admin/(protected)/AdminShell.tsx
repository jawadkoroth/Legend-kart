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
            style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: '1.25rem' }}>💬</span>
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: '-4px', right: '-8px', background: 'var(--error)', color: 'white', fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px' }}>
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={handleLogout}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
            title="Logout"
          >
            <span style={{ fontSize: '1.25rem' }}>🚪</span>
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
