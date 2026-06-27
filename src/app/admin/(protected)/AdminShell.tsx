'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminFeedbackDrawer from '@/components/AdminFeedbackDrawer';
import AdminRealtimeProvider from '@/components/admin/AdminRealtimeProvider';
import AdminPushPrompt from '@/components/admin/AdminPushPrompt';
import AdminReturnsBadge from '@/components/admin/AdminReturnsBadge';
import { useAuth } from '@/lib/auth/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import styles from './AdminShell.module.css';
import AdminSearchOverlay from '@/components/admin/AdminSearchOverlay';
import AdminBreadcrumbs from '@/components/admin/AdminBreadcrumbs';

// Import Lucide Icons
import {
  Home,
  ShoppingCart,
  Tag,
  Users,
  Megaphone,
  Zap,
  Truck,
  Ticket,
  BarChart3,
  Settings,
  LayoutDashboard,
  HelpCircle,
  LogOut,
  Star,
  Search,
  ChevronDown,
  ChevronRight,
  Menu,
  X
} from 'lucide-react';

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

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Home,
  ShoppingCart,
  Tag,
  Users,
  Megaphone,
  Zap,
  Truck,
  Ticket,
  BarChart3,
  Settings,
  LayoutDashboard,
  HelpCircle,
  LogOut
};

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'Home',
    items: [
      { href: '/admin/dashboard', label: 'Home', icon: 'LayoutDashboard' }
    ]
  },
  {
    id: 'orders',
    label: 'Orders',
    icon: 'ShoppingCart',
    items: [
      { href: '/admin/orders', label: 'All Orders', icon: 'ShoppingCart' },
      { href: '/admin/orders#returns', label: 'Returns', icon: 'HelpCircle' },
      { href: '/admin/orders#exchanges', label: 'Exchanges', icon: 'HelpCircle' }
    ]
  },
  {
    id: 'products',
    label: 'Products',
    icon: 'Tag',
    items: [
      { href: '/admin/products', label: 'Inventory', icon: 'Tag' },
      { href: '/admin/marketing/catalog-health', label: 'Catalog Quality', icon: 'HelpCircle' }
    ]
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: 'Users',
    items: [
      { href: '/admin/customers', label: 'Customer Profiles', icon: 'Users' },
      { href: '/admin/marketing/audiences', label: 'Segments', icon: 'Users' }
    ]
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: 'Megaphone',
    items: [
      { href: '/admin/marketing', label: 'Overview', icon: 'Megaphone' },
      { href: '/admin/marketing/providers', label: 'Connections', icon: 'Megaphone' },
      { href: '/admin/marketing/settings', label: 'Settings', icon: 'Settings' }
    ]
  },
  {
    id: 'automation',
    label: 'Automation',
    icon: 'Zap',
    items: [
      { href: '/admin/automation', label: 'Flows', icon: 'Zap' },
      { href: '/admin/automation/templates', label: 'Templates', icon: 'Zap' },
      { href: '/admin/automation/executions', label: 'Automation History', icon: 'Zap' }
    ]
  },
  {
    id: 'shipping',
    label: 'Shipping',
    icon: 'Truck',
    items: [
      { href: '/admin/shipping', label: 'Overview', icon: 'Truck' }
    ]
  },
  {
    id: 'coupons',
    label: 'Coupons',
    icon: 'Ticket',
    items: [
      { href: '/admin/coupons', label: 'Overview', icon: 'Ticket' }
    ]
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: 'BarChart3',
    items: [
      { href: '/admin/dashboard#analytics', label: 'Overview', icon: 'BarChart3' }
    ]
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'Settings',
    items: [
      { href: '/admin/settings', label: 'System Settings', icon: 'Settings' }
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
  
  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Favorites state
  const [favorites, setFavorites] = useState<string[]>([]);

  // Role permissions state
  const [role, setRole] = useState<string | null>(null);

  // Responsive States
  const [windowWidth, setWindowWidth] = useState(1200);
  const [isCollapsed, setIsCollapsed] = useState(false); // Desktop Manual Collapse
  const [isHovered, setIsHovered] = useState(false); // Tablet/Collapsed hover state
  const [isPinned, setIsPinned] = useState(false); // Tablet manual pin lock
  const [isMobileOpen, setIsMobileOpen] = useState(false); // Mobile Drawer open state
  
  // Accordion state
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Load favorites & responsive triggers
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedFavs = localStorage.getItem('admin_sidebar_favorites');
      if (savedFavs) {
        try {
          setFavorites(JSON.parse(savedFavs));
        } catch {}
      }
    }
  }, []);

  // Fetch admin role & react to role updates (supporting developers overrides)
  useEffect(() => {
    const fetchRole = () => {
      if (user) {
        const mocked = localStorage.getItem('panther_mock_role');
        if (mocked) {
          setRole(mocked);
          return;
        }
        const supabase = createClient();
        supabase
          .from('admin_users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data) {
              setRole(data.role || 'admin');
            }
          });
      } else {
        setRole(null);
      }
    };

    fetchRole();
    window.addEventListener('storage', fetchRole);
    return () => window.removeEventListener('storage', fetchRole);
  }, [user]);

  // Command palette listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  const toggleFavorite = (href: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const next = favorites.includes(href)
      ? favorites.filter(x => x !== href)
      : [...favorites, href];
    setFavorites(next);
    localStorage.setItem('admin_sidebar_favorites', JSON.stringify(next));
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

  // Role permissions menu filtering
  const visibleGroups = NAV_GROUPS.filter((group) => {
    if (!role) return true; // Default show all until loaded
    const lowerRole = role.toLowerCase();
    if (lowerRole === 'owner' || lowerRole === 'admin') return true;

    if (lowerRole === 'marketing') {
      return ['dashboard', 'customers', 'marketing', 'automation', 'coupons', 'analytics'].includes(group.id);
    }
    if (lowerRole === 'support') {
      return ['dashboard', 'orders', 'customers'].includes(group.id);
    }
    if (lowerRole === 'warehouse') {
      return ['orders', 'products', 'shipping'].includes(group.id);
    }
    if (lowerRole === 'developer') {
      return ['dashboard', 'settings'].includes(group.id);
    }
    return true;
  });

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
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} style={{ transform: 'rotate(90deg)' }} />}
              </button>
            ) : isTablet ? (
              <button onClick={togglePin} className={styles.toggleBtn} title={isPinned ? 'Unpin Sidebar' : 'Pin Sidebar'}>
                📌
              </button>
            ) : null}
          </div>

          <nav className={styles.sidebarNav}>
            
            {/* Favorites Category Header */}
            {favorites.length > 0 && (
              <div className={styles.navGroupContainer} style={{ marginBottom: 'var(--space-2)' }}>
                <div className={styles.groupHeader} style={{ cursor: 'default', color: 'var(--accent-gold)' }}>
                  <Star size={16} fill="var(--accent-gold)" style={{ color: 'var(--accent-gold)' }} />
                  {shouldBeExpanded && (
                    <span className={styles.groupText} style={{ fontSize: '0.75rem', fontWeight: 700 }}>Favorites</span>
                  )}
                </div>
                {shouldBeExpanded && (
                  <div className={styles.groupItems} style={{ borderLeft: '1px solid rgba(201,168,106,0.15)', paddingLeft: '12px' }}>
                    {visibleGroups
                      .flatMap(g => g.items)
                      .filter(item => favorites.includes(item.href))
                      .map((item) => {
                        const Icon = ICON_MAP[item.icon] || HelpCircle;
                        const isActive = pathname === item.href;
                        return (
                          <div key={`fav-${item.href}`} className={styles.navLinkWrapper}>
                            <Link
                              href={item.href}
                              className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                            >
                              <Icon size={14} />
                              <span className={styles.navText}>{item.label}</span>
                            </Link>
                            <button
                              onClick={(e) => toggleFavorite(item.href, e)}
                              className={styles.favBtn}
                              title="Unfavorite"
                            >
                              <Star size={11} fill="var(--accent-gold)" style={{ color: 'var(--accent-gold)' }} />
                            </button>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* Normal Categories List */}
            {visibleGroups.map((group) => {
              const isGroupExpanded = expandedGroup === group.id;
              const GroupIcon = ICON_MAP[group.icon] || HelpCircle;
              const hasSingleItem = group.items.length === 1;

              if (hasSingleItem) {
                const singleItem = group.items[0];
                const isActive = pathname === singleItem.href || pathname.startsWith(singleItem.href + '/');
                return (
                  <div key={group.id} className={styles.navGroupContainer}>
                    <Link
                      href={singleItem.href}
                      className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                      title={group.label}
                      style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center' }}
                    >
                      <span className={styles.navIcon} style={{ display: 'flex', alignItems: 'center' }}>
                        <GroupIcon size={18} />
                      </span>
                      {shouldBeExpanded && (
                        <span className={styles.navText} style={{ fontWeight: 600, fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: '12px' }}>
                          {group.label}
                        </span>
                      )}
                    </Link>
                  </div>
                );
              }

              return (
                <div key={group.id} className={styles.navGroupContainer}>
                  {/* Group Header Trigger */}
                  <button
                    className={styles.groupHeader}
                    onClick={() => toggleGroup(group.id)}
                    title={group.label}
                  >
                    <span className={styles.navIcon} style={{ display: 'flex', alignItems: 'center' }}>
                      <GroupIcon size={18} />
                    </span>
                    {shouldBeExpanded && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span className={styles.groupText}>{group.label}</span>
                        <span className={styles.groupArrow}>
                          {isGroupExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </span>
                      </div>
                    )}
                  </button>

                  {/* Sub items */}
                  {shouldBeExpanded && isGroupExpanded && (
                    <div className={styles.groupItems}>
                      {group.items.map((item) => {
                        const ItemIcon = ICON_MAP[item.icon] || HelpCircle;
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        const isFav = favorites.includes(item.href);
                        return (
                          <div key={item.href} className={styles.navLinkWrapper}>
                            <Link
                              href={item.href}
                              className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                            >
                              <ItemIcon size={14} />
                              <span className={styles.navText}>{item.label}</span>
                            </Link>
                            <button
                              onClick={(e) => toggleFavorite(item.href, e)}
                              className={styles.favBtn}
                              title={isFav ? "Remove from favorites" : "Pin to favorites"}
                            >
                              <Star 
                                size={11} 
                                fill={isFav ? 'var(--accent-gold)' : 'none'} 
                                style={{ color: isFav ? 'var(--accent-gold)' : 'var(--text-muted)' }} 
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className={styles.sidebarFooter}>
            <button onClick={() => setIsFeedbackOpen(true)} className={styles.navLink} title="Feedback" style={{ width: '100%' }}>
              <HelpCircle size={16} />
              <span className={styles.navText}>Feedback</span>
            </button>
            <button onClick={handleLogout} className={styles.navLink} title="Logout" style={{ width: '100%', marginTop: '4px' }}>
              <LogOut size={16} />
              <span className={styles.navText}>Logout</span>
            </button>
          </div>
        </aside>
      )}

      {/* 2. Mobile Drawer Navigation Panel */}
      {isMobile && isMobileOpen && (
        <>
          <div className={styles.drawerOverlay} onClick={() => closeMobileDrawer()} />

          <div className={styles.drawerContent}>
            <div className={styles.drawerHeader}>
              <div className={styles.logoArea}>
                <span className={styles.brandText} style={{ opacity: 1 }}>NOIR</span>
                <span className={styles.brandSub} style={{ opacity: 1 }}>ADMIN</span>
              </div>
              <button className={styles.closeBtn} onClick={() => closeMobileDrawer()} aria-label="Close Menu">
                <X size={20} />
              </button>
            </div>

            <nav className={styles.drawerNav} style={{ flex: 1, overflowY: 'auto', padding: '16px 8px' }}>
              {visibleGroups.map((group) => {
                const isGroupExpanded = expandedGroup === `mobile-${group.id}`;
                const GroupIcon = ICON_MAP[group.icon] || HelpCircle;
                const hasSingleItem = group.items.length === 1;

                if (hasSingleItem) {
                  const singleItem = group.items[0];
                  const isActive = pathname === singleItem.href || pathname.startsWith(singleItem.href + '/');
                  return (
                    <div key={`mob-${group.id}`} className={styles.navGroupContainer} style={{ marginBottom: '8px' }}>
                      <Link
                        href={singleItem.href}
                        onClick={() => closeMobileDrawer(true)}
                        className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                        style={{ display: 'flex', alignItems: 'center', padding: 'var(--space-3) var(--space-4)' }}
                      >
                        <GroupIcon size={18} />
                        <span className={styles.navText} style={{ marginLeft: '12px', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group.label}</span>
                      </Link>
                    </div>
                  );
                }

                return (
                  <div key={`mob-${group.id}`} className={styles.navGroupContainer} style={{ marginBottom: '8px' }}>
                    <button
                      className={styles.groupHeader}
                      onClick={() => setExpandedGroup(isGroupExpanded ? null : `mobile-${group.id}`)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.01)' }}
                    >
                      <GroupIcon size={18} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginLeft: '12px' }}>
                        <span className={styles.groupText} style={{ fontSize: '0.85rem' }}>{group.label}</span>
                        <span>{isGroupExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                      </div>
                    </button>
                    {isGroupExpanded && (
                      <div className={styles.groupItems} style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {group.items.map((item) => {
                          const ItemIcon = ICON_MAP[item.icon] || HelpCircle;
                          const isActive = pathname === item.href;
                          return (
                            <Link
                              key={`mob-item-${item.href}`}
                              href={item.href}
                              onClick={() => closeMobileDrawer(true)}
                              className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                            >
                              <ItemIcon size={14} />
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
            
            <div className={styles.drawerFooter} style={{ borderTop: '1px solid var(--border-color)', padding: '12px 16px' }}>
              <button onClick={() => { closeMobileDrawer(true); setIsFeedbackOpen(true); }} className={styles.navLink} style={{ width: '100%' }}>
                <HelpCircle size={16} /> <span className={styles.navText}>Feedback</span>
              </button>
              <button onClick={() => { closeMobileDrawer(true); handleLogout(); }} className={styles.navLink} style={{ width: '100%', marginTop: '6px' }}>
                <LogOut size={16} /> <span className={styles.navText}>Logout</span>
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
            {isMobile && (
              <button onClick={() => setIsMobileOpen(true)} className={styles.hamburgerBtn} aria-label="Open Navigation Drawer">
                <Menu size={20} />
              </button>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: 600, letterSpacing: '0.1em' }}>NOIR</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.15em' }}>ADMIN</span>
            </div>
          </div>

          {/* Top Right Utility Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            
            {/* Global Search command trigger button */}
            <button className="admin-header-btn" title="Global Search (Ctrl+K)" onClick={() => setIsSearchOpen(true)}>
              <Search size={18} />
            </button>

            {/* Notifications & support requests feedback */}
            <button
              onClick={() => setIsFeedbackOpen(true)}
              className="admin-header-btn"
              title="Notifications & Feedback"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: '2px', right: '2px', background: 'var(--accent-gold)', color: '#000', fontSize: '9px', fontWeight: 'bold', padding: '1px 5px', borderRadius: '10px', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={handleLogout}
              className="admin-header-btn"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <AdminRealtimeProvider />

        <div className="admin-content">
          {/* Breadcrumb Rail rendered on all child pages */}
          <AdminBreadcrumbs />
          {children}
        </div>
      </div>

      <AdminFeedbackDrawer
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        onUnreadDelta={delta =>
          setUnreadCount(prev => Math.max(0, prev + delta))
        }
      />

      {/* Ctrl+K Search Overlay */}
      {isSearchOpen && (
        <AdminSearchOverlay onClose={() => setIsSearchOpen(false)} />
      )}
    </div>
  );
}
