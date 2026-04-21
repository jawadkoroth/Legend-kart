'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        if (pathname !== '/admin') router.push('/admin');
        setChecking(false);
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
        setChecking(false);
        return;
      }

      setAuthed(true);
      setChecking(false);
    }
    checkAuth();
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
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: 600, letterSpacing: '0.1em' }}>NOIR</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.15em' }}>ADMIN</span>
      </div>

      <div className="admin-content">
        {children}
      </div>

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
