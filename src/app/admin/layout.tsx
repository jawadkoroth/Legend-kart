'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import AdminFeedbackDrawer from '@/components/AdminFeedbackDrawer';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
        if (pathname !== '/admin') router.push('/admin');
        if (mounted) setChecking(false);
        return;
      }

      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!adminUser) {
        await supabase.auth.signOut();
        router.push('/admin');
        if (mounted) setChecking(false);
        return;
      }

      if (mounted) {
        setAuthed(true);
        setChecking(false);
        fetchUnreadCount();
      }
    }
    
    async function fetchUnreadCount() {
      const { count } = await supabase.from('feedback').select('*', { count: 'exact', head: true }).eq('is_read', false);
      if (mounted && count !== null) setUnreadCount(count);
    }
    
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
       if (event === 'SIGNED_OUT' || !session) {
          if (mounted) setAuthed(false);
          if (pathname !== '/admin') router.push('/admin');
       } else if (event === 'SIGNED_IN') {
          checkAuth();
       }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  // Login page — no layout needed
  if (pathname === '/admin') {
    return <>{children}</>;
  }

  if (checking) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-pulse text-muted">Verifying access...</div>
      </div>
    );
  }

  if (!authed) return null;

  const navItems = [
    { href: '/admin/dashboard', label: 'Home', icon: '📊' },
    { href: '/admin/orders', label: 'Orders', icon: '📦' },
    { href: '/admin/products', label: 'Products', icon: '👕' },
    { href: '/admin/coupons', label: 'Coupons', icon: '🏷️' },
    { href: '/admin/shipping', label: 'Shipping', icon: '🚚' },
  ];

  return (
    <div className="admin-layout">
      <div className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: 600, letterSpacing: '0.1em' }}>NOIR</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.15em' }}>ADMIN</span>
        </div>
        
        <button 
          onClick={() => setIsFeedbackOpen(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center' }}
        >
          <span style={{ fontSize: '1.25rem' }}>💬</span>
          {unreadCount > 0 && (
            <span style={{ position: 'absolute', top: '-4px', right: '-8px', background: 'var(--error)', color: 'white', fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px' }}>
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      <div className="admin-content">
        {children}
      </div>
      
      <AdminFeedbackDrawer 
        isOpen={isFeedbackOpen} 
        onClose={() => setIsFeedbackOpen(false)} 
        onReadUpdate={() => setUnreadCount(prev => Math.max(0, prev - 1))} 
      />

      <nav className="admin-nav">
        {navItems.map(item => (
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

      {/* Spacer for fixed bottom nav */}
      <div style={{ height: '70px' }} />
    </div>
  );
}
