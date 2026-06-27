'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './marketing-admin.module.css';

export default function MarketingAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function fetchHealth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || '';

        const res = await fetch('/api/admin/marketing/health', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setHealthScore(data.healthScore);
        }
      } catch (err) {
        console.error('Failed to load marketing health score:', err);
      }
    }

    void fetchHealth();
    // Refresh health score every 10 seconds
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const TABS = [
    { id: 'overview', label: 'Overview', href: '/admin/marketing' },
    { id: 'providers', label: 'Connections', href: '/admin/marketing/providers' },
    { id: 'events', label: 'Event Library', href: '/admin/marketing/events' },
    { id: 'diagnostics', label: 'Diagnostics', href: '/admin/marketing/diagnostics' },
    { id: 'settings', label: 'Settings', href: '/admin/marketing/settings' },
  ];

  // Colors based on health score
  const isHealthy = healthScore !== null && healthScore >= 90;
  const isWarning = healthScore !== null && healthScore < 90 && healthScore >= 70;
  const healthBadgeStyle = isHealthy
    ? styles.indicatorSuccess
    : isWarning
    ? styles.indicatorWarning
    : styles.indicatorError;

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.title}>PANTHER Marketing Platform</h1>
          <p className={styles.subtitle}>
            Centralized first-party event spine, identity resolution, and destination dispatcher.
          </p>
        </div>

        {/* Dynamic Health Score Indicator */}
        {healthScore !== null && (
          <Link href="/admin/marketing/diagnostics">
            <div
              className={`${styles.card} ${healthBadgeStyle}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-4)',
                cursor: 'pointer',
                transition: 'all var(--duration-fast) var(--ease-out)',
                border: '1px solid rgba(255,255,255,0.08)'
              }}
              title="Click to view detailed diagnostics"
            >
              <span style={{ fontSize: '0.75rem', fontWeight: '500', color: 'var(--text-muted)' }}>
                Platform Health Score:
              </span>
              <strong style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                {healthScore}%
              </strong>
            </div>
          </Link>
        )}
      </div>

      <nav className={styles.navTabs}>
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`${styles.tabLink} ${isActive ? styles.tabLinkActive : ''}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}
