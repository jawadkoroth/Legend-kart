'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminBreadcrumbs() {
  const pathname = usePathname();
  if (!pathname) return null;

  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'admin' || segments.length <= 1) return null;

  const breadcrumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');
    
    // Nice business labeling translations
    let label = segment.replace(/-/g, ' ');
    label = label.charAt(0).toUpperCase() + label.slice(1);
    
    const lower = segment.toLowerCase();
    if (lower === 'admin') {
      label = 'Noir Admin';
    } else if (lower === 'catalog-health') {
      label = 'Catalog Quality';
    } else if (lower === 'executions') {
      label = 'Automation History';
    } else if (lower === 'providers') {
      label = 'Connections';
    } else if (lower === 'events') {
      label = 'Event Library';
    } else if (lower === 'settings') {
      label = 'Settings';
    } else if (lower === 'developer') {
      label = 'Developer Tools';
    } else if (lower === 'database-health') {
      label = 'System Status';
    } else if (segment.length > 20) {
      // Looks like a UUID or numeric ID
      label = 'Details';
    }

    return { label, href, isLast: index === segments.length - 1 };
  });

  return (
    <nav 
      aria-label="Breadcrumb" 
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        fontSize: '0.75rem', 
        color: 'var(--text-muted)', 
        marginBottom: '16px',
        fontFamily: 'inherit'
      }}
    >
      {breadcrumbs.map((bc, idx) => {
        if (bc.isLast) {
          return (
            <span key={idx} style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
              {bc.label}
            </span>
          );
        }
        return (
          <React.Fragment key={idx}>
            <Link 
              href={bc.href} 
              className="breadcrumb-link"
              style={{ 
                color: 'var(--text-muted)', 
                textDecoration: 'none', 
                transition: 'color 0.15s ease' 
              }}
            >
              {bc.label}
            </Link>
            <span style={{ opacity: 0.3 }}>/</span>
          </React.Fragment>
        );
      })}
      <style>{`
        .breadcrumb-link:hover {
          color: var(--accent-gold) !important;
        }
      `}</style>
    </nav>
  );
}
