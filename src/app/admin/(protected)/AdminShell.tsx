'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminFeedbackDrawer from '@/components/AdminFeedbackDrawer';
import AdminRealtimeProvider from '@/components/admin/AdminRealtimeProvider';
import AdminPushPrompt from '@/components/admin/AdminPushPrompt';
import AdminReturnsBadge from '@/components/admin/AdminReturnsBadge';
import { useAuth } from '@/lib/auth/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import styles from './AdminShell.module.css';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: '🏠',
    items: [
      { href: '/admin/dashboard', label: 'Home', icon: '📊' }
    ]
  },
  {
    id: 'commerce',
    label: 'Commerce',
    icon: '🛒',
    items: [
      { href: '/admin/products', label: 'Products', icon: '👕' },
      { href: '/admin/orders', label: 'Orders', icon: '📦' },
      { href: '/admin/orders#customers', label: 'Customers', icon: '👥' },
      { href: '/admin/coupons', label: 'Coupons', icon: '🏷️' }
    ]
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: '⚙️',
    items: [
      { href: '/admin/shipping', label: 'Shipping', icon: '🚚' },
      { href: '/admin/orders#returns', label: 'Returns', icon: '🔄' },
      { href: '/admin/orders#exchanges', label: 'Exchanges', icon: '🔀' }
    ]
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: '📈',
    items: [
      { href: '/admin/marketing', label: 'Overview', icon: '📣' },
      { href: '/admin/marketing/providers', label: 'Meta', icon: '🔌' },
      { href: '/admin/marketing/providers#google', label: 'Google', icon: '🔌' },
      { href: '/admin/marketing/settings#crm', label: 'CRM', icon: '👤' },
      { href: '/admin/marketing/events', label: 'Events', icon: '🔍' },
      { href: '/admin/marketing/diagnostics', label: 'Diagnostics', icon: '🩺' }
    ]
  },
  {
    id: 'system',
    label: 'System',
    icon: '🖥️',
    items: [
      { href: '/admin/dashboard#analytics', label: 'Analytics', icon: '📈' },
      { href: '/admin/settings/developer/database-health', label: 'Database Health', icon: '🗄️' },
      { href: '/admin/settings', label: 'Developer', icon: '🛠️' },
      { href: '/admin/settings#general', label: 'Settings', icon: '⚙️' }
    ]
  }
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
  
  // Responsive States
  const [windowWidth, setWindowWidth] = useState(1200);
  const [isCollapsed, setIsCollapsed] = useState(false); // Desktop Manual Collapse
  const [isHovered, setIsHovered] = useState(false); // Tablet/Collapsed hover state
  const [isPinned, setIsPinned] = useState(false); // Tablet manual pin lock
  const [isMobileOpen, setIsMobileOpen] = useState(false); // Mobile Drawer open state
  
  // Accordion state
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Resize Listener
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;
  const isDesktop = windowWidth >= 1024;

  // Restore Desktop collapse and Pinned state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedCollapsed = localStorage.getItem('admin_sidebar_collapsed') === 'true';
      setIsCollapsed(savedCollapsed);

      const savedPinned = localStorage.getItem('admin_sidebar_pinned') === 'true';
      setIsPinned(savedPinned);

      const savedGroup = localStorage.getItem('admin_nav_expanded_group');
      if (savedGroup) {
        setExpandedGroup(savedGroup);
      } else {
        // Default expand active group
        const activeGroup = NAV_GROUPS.find(g =>
          g.items.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))
        );
        setExpandedGroup(activeGroup ? activeGroup.id : 'dashboard');
      }
    }
  }, [pathname]);

  // Mobile Back Button Popstate handling
  useEffect(() => {
    if (isMobileOpen) {
      window.history.pushState({ drawerOpen: true }, '');
    }
  }, [isMobileOpen]);

  useEffect(() => {
    if (isFeedbackOpen) {
      window.history.pushState({ feedbackOpen: true }, '');
    }
  }, [isFeedbackOpen]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (isMobileOpen) {
        setIsMobileOpen(false);
      }
      if (isFeedbackOpen) {
        setIsFeedbackOpen(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isMobileOpen, isFeedbackOpen]);

  const closeMobileDrawer = (isNavigating = false) => {
    setIsMobileOpen(false);
    if (!isNavigating && window.history.state?.drawerOpen) {
      window.history.back();
    }
  };

  const closeFeedbackDrawer = () => {
    setIsFeedbackOpen(false);
    if (window.history.state?.feedbackOpen) {
      window.history.back();
    }
  };

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('admin_sidebar_collapsed', String(next));
      return next;
    });
  };

  const togglePin = () => {
    setIsPinned((prev) => {
      const next = !prev;
      localStorage.setItem('admin_sidebar_pinned', String(next));
      return next;
    });
  };

  const toggleGroup = (groupId: string) => {
    // If sidebar is collapsed, expand it
    if (isDesktop && isCollapsed) {
      setIsCollapsed(false);
      localStorage.setItem('admin_sidebar_collapsed', 'false');
    } else if (isTablet && !isPinned && !isHovered) {
      setIsPinned(true);
      localStorage.setItem('admin_sidebar_pinned', 'true');
    }

    setExpandedGroup((prev) => {
      const next = prev === groupId ? null : groupId;
      if (next) {
        localStorage.setItem('admin_nav_expanded_group', next);
      } else {
        localStorage.removeItem('admin_nav_expanded_group');
      }
      return next;
    });
  };

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

  // Derive final expanded sidebar state for Hover/Tablet Vercel style
  const shouldBeExpanded = isDesktop
    ? !isCollapsed
    : isTablet
    ? (isHovered || isPinned)
    : false;

  return (
    <div className={styles.adminLayout}>
      
      {/* 1. Collapsible Grouped Sidebar (Desktop & Tablet) */}
      {!isMobile && (
        <aside
          className={`${styles.sidebar} ${!shouldBeExpanded ? styles.sidebarCollapsed : ''} ${isHovered && !isPinned ? styles.sidebarHoverExpanded : ''}`}
          onMouseEnter={() => isTablet && setIsHovered(true)}
          onMouseLeave={() => isTablet && setIsHovered(false)}
        >
          <div className={styles.sidebarHeader}>
            <div className={styles.logoArea}>
              <span className={styles.brandText}>NOIR</span>
              <span className={styles.brandSub}>ADMIN</span>
            </div>
            
            {/* Action buttons based on viewport */}
            {isDesktop ? (
              <button onClick={toggleSidebar} className={styles.toggleBtn} aria-label="Toggle Sidebar">
                {isCollapsed ? '⮕' : '⬅'}
              </button>
            ) : isTablet ? (
              <button onClick={togglePin} className={styles.toggleBtn} title={isPinned ? 'Unpin Sidebar' : 'Pin Sidebar'}>
                {isPinned ? '📌' : '📍'}
              </button>
            ) : null}
          </div>

          <nav className={styles.sidebarNav}>
            {NAV_GROUPS.map((group) => {
              const isGroupExpanded = expandedGroup === group.id;
              
              return (
                <div key={group.id} className={styles.navGroupContainer}>
                  {/* Group Header Trigger */}
                  <button
                    className={styles.groupHeader}
                    onClick={() => toggleGroup(group.id)}
                    title={group.label}
                  >
                    <span className={styles.navIcon}>{group.icon}</span>
                    {shouldBeExpanded && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span className={styles.groupText}>{group.label}</span>
                        <span className={styles.groupArrow}>{isGroupExpanded ? '▼' : '▶'}</span>
                      </div>
                    )}
                  </button>

                  {/* Sub items */}
                  {shouldBeExpanded && isGroupExpanded && (
                    <div className={styles.groupItems}>
                      {group.items.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                          >
                            <span className={styles.navIcon} style={{ fontSize: '1rem' }}>{item.icon}</span>
                            <span className={styles.navText}>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className={styles.sidebarFooter}>
            <button onClick={() => setIsFeedbackOpen(true)} className={styles.navLink} title="Feedback">
              <span className={styles.navIcon}>💬</span>
              <span className={styles.navText}>Feedback</span>
            </button>
            <button onClick={handleLogout} className={styles.navLink} title="Logout">
              <span className={styles.navIcon}>🚪</span>
              <span className={styles.navText}>Logout</span>
            </button>
          </div>
        </aside>
      )}

      {/* 2. Mobile Drawer Navigation Panel */}
      {isMobile && isMobileOpen && (
        <>
          {/* Backdrop Overlay with Blur */}
          <div className={styles.drawerOverlay} onClick={() => closeMobileDrawer()} />

          {/* Slide Drawer Content */}
          <div className={styles.drawerContent}>
            <div className={styles.drawerHeader}>
              <div className={styles.logoArea}>
                <span className={styles.brandText} style={{ opacity: 1 }}>NOIR</span>
                <span className={styles.brandSub} style={{ opacity: 1 }}>ADMIN</span>
              </div>
              <button className={styles.closeBtn} onClick={() => closeMobileDrawer()} aria-label="Close Menu">✕</button>
            </div>

            <nav className={styles.drawerNav}>
              {/* Primary Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <Link href="/admin/dashboard" onClick={() => closeMobileDrawer(true)} className={`${styles.navLink} ${pathname === '/admin/dashboard' ? styles.navLinkActive : ''}`}>
                  <span className={styles.navIcon}>🏠</span> <span className={styles.navText}>Dashboard</span>
                </Link>
                <Link href="/admin/orders" onClick={() => closeMobileDrawer(true)} className={`${styles.navLink} ${pathname === '/admin/orders' ? styles.navLinkActive : ''}`}>
                  <span className={styles.navIcon}>📦</span> <span className={styles.navText}>Orders</span>
                </Link>
                <Link href="/admin/products" onClick={() => closeMobileDrawer(true)} className={`${styles.navLink} ${pathname === '/admin/products' ? styles.navLinkActive : ''}`}>
                  <span className={styles.navIcon}>👕</span> <span className={styles.navText}>Products</span>
                </Link>
                <Link href="/admin/orders#customers" onClick={() => closeMobileDrawer(true)} className={styles.navLink}>
                  <span className={styles.navIcon}>👥</span> <span className={styles.navText}>Customers</span>
                </Link>
                <Link href="/admin/coupons" onClick={() => closeMobileDrawer(true)} className={`${styles.navLink} ${pathname === '/admin/coupons' ? styles.navLinkActive : ''}`}>
                  <span className={styles.navIcon}>🏷️</span> <span className={styles.navText}>Coupons</span>
                </Link>
                <Link href="/admin/shipping" onClick={() => closeMobileDrawer(true)} className={`${styles.navLink} ${pathname === '/admin/shipping' ? styles.navLinkActive : ''}`}>
                  <span className={styles.navIcon}>🚚</span> <span className={styles.navText}>Shipping</span>
                </Link>
                <Link href="/admin/marketing" onClick={() => closeMobileDrawer(true)} className={`${styles.navLink} ${pathname.startsWith('/admin/marketing') ? styles.navLinkActive : ''}`}>
                  <span className={styles.navIcon}>📈</span> <span className={styles.navText}>Marketing</span>
                </Link>
                <Link href="/admin/settings" onClick={() => closeMobileDrawer(true)} className={`${styles.navLink} ${pathname === '/admin/settings' ? styles.navLinkActive : ''}`}>
                  <span className={styles.navIcon}>⚙️</span> <span className={styles.navText}>Settings</span>
                </Link>
              </div>

              <div className={styles.drawerDivider} />

              {/* Secondary Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <Link href="/admin/settings" onClick={() => closeMobileDrawer(true)} className={styles.navLink}>
                  🛠️ Developer Tools
                </Link>
                <Link href="/admin/marketing/diagnostics" onClick={() => closeMobileDrawer(true)} className={styles.navLink}>
                  🩺 Diagnostics
                </Link>
                <Link href="/admin/settings/developer/database-health" onClick={() => closeMobileDrawer(true)} className={styles.navLink}>
                  🗄️ Database Health
                </Link>
                <Link href="/admin/marketing/events" onClick={() => closeMobileDrawer(true)} className={styles.navLink}>
                  🔍 System Logs
                </Link>
                <Link href="/admin/marketing/settings" onClick={() => closeMobileDrawer(true)} className={styles.navLink}>
                  🚩 Feature Flags
                </Link>
              </div>
            </nav>
            
            <div className={styles.drawerFooter}>
              <button onClick={() => { closeMobileDrawer(true); setIsFeedbackOpen(true); }} className={styles.navLink}>
                <span className={styles.navIcon}>💬</span> Feedback
              </button>
              <button onClick={() => { closeMobileDrawer(true); handleLogout(); }} className={styles.navLink}>
                <span className={styles.navIcon}>🚪</span> Logout
              </button>
            </div>
          </div>
        </>
      )}

      {/* 3. Main Content Area */}
      <div className={`${styles.mainContent} ${isCollapsed && isDesktop ? styles.mainContentCollapsed : isTablet && !isPinned ? styles.mainContentTabletCollapsed : ''}`}>
        
        {/* Dynamic Responsive Header */}
        <header className="admin-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            {/* Hamburger Button for Mobile */}
            {isMobile && (
              <button onClick={() => setIsMobileOpen(true)} className={styles.hamburgerBtn} aria-label="Open Navigation Drawer">
                ☰
              </button>
            )}

            {/* Title / Brand details */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: 600, letterSpacing: '0.1em' }}>NOIR</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.15em' }}>ADMIN</span>
            </div>
          </div>

          {/* Top Right Utility Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            
            {/* Search Placeholder Trigger */}
            <button className="admin-header-btn" title="Search catalog" onClick={() => alert('Search functionality initialized.')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>

            {/* Notifications / Support Feedback */}
            <button
              onClick={() => setIsFeedbackOpen(true)}
              className="admin-header-btn"
              title="Notifications & Feedback"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: '2px', right: '2px', background: 'var(--accent-gold)', color: '#000', fontSize: '9px', fontWeight: 'bold', padding: '1px 5px', borderRadius: '10px', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Returns and Push Notifications config badges */}
            <AdminReturnsBadge />
            <AdminPushPrompt />

            {/* Profile Avatar Badge */}
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'rgba(212,175,55,0.1)',
                border: '1px solid var(--accent-gold)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                color: 'var(--accent-gold)',
                cursor: 'pointer'
              }}
              title={user?.email || 'Admin Profile'}
            >
              A
            </div>

            {/* Logout button */}
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
        </header>

        <AdminRealtimeProvider />

        <div className="admin-content">{children}</div>
      </div>

      <AdminFeedbackDrawer
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        onUnreadDelta={delta =>
          setUnreadCount(prev => Math.max(0, prev + delta))
        }
      />
    </div>
  );
}
