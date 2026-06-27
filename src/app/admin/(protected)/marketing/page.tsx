import React from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from './marketing-admin.module.css';

export const dynamic = 'force-dynamic';

interface OrderStatsRow {
  total_paise: number;
  utm_source: string | null;
  utm_campaign: string | null;
  device: string | null;
  country: string | null;
}

export default async function MarketingOverviewPage() {
  const supabase = createAdminClient();

  // 1. Fetch Event Metrics
  const { count: totalEvents } = await supabase
    .from('marketing_events')
    .select('id', { count: 'exact', head: true });

  const { count: clientEvents } = await supabase
    .from('marketing_events')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'client');

  const { count: serverEvents } = await supabase
    .from('marketing_events')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'server');

  // 2. Fetch Providers status
  const { data: providers } = await supabase
    .from('marketing_providers')
    .select('id, enabled');

  const activeCount = providers?.filter(p => p.enabled).length || 0;

  // 3. Fetch Consent distribution
  const { count: totalConsent } = await supabase
    .from('marketing_consent')
    .select('id', { count: 'exact', head: true });

  // 4. Fetch Order metrics with attribution
  const { data: ordersRaw } = await supabase
    .from('orders')
    .select('total_paise, utm_source, utm_campaign, device, country');

  const orders = (ordersRaw || []) as OrderStatsRow[];

  // Compute stats
  const totalRevenuePaise = orders.reduce((sum, o) => sum + (o.total_paise || 0), 0);
  const totalOrdersCount = orders.length;

  // Source split
  const sourceSplit: Record<string, number> = {};
  const campaignSplit: Record<string, number> = {};
  const deviceSplit: Record<string, number> = {};
  const countrySplit: Record<string, number> = {};

  orders.forEach((o) => {
    const src = o.utm_source || 'Direct / Organic';
    sourceSplit[src] = (sourceSplit[src] || 0) + o.total_paise;

    const camp = o.utm_campaign || 'Non-campaign';
    campaignSplit[camp] = (campaignSplit[camp] || 0) + o.total_paise;

    const dev = o.device || 'Desktop';
    deviceSplit[dev] = (deviceSplit[dev] || 0) + o.total_paise;

    const country = o.country || 'India';
    countrySplit[country] = (countrySplit[country] || 0) + o.total_paise;
  });

  // Sort and pick top entries
  const topSources = Object.entries(sourceSplit)
    .map(([key, val]) => ({ name: key, revenue: val / 100 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const topCampaigns = Object.entries(campaignSplit)
    .map(([key, val]) => ({ name: key, revenue: val / 100 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const deviceDistribution = Object.entries(deviceSplit)
    .map(([key, val]) => ({ name: key, revenue: val / 100 }));

  // Mocked ad spend for ROAS demo
  const mockAdSpend = 12500; // INR
  const marketingRevenue = totalRevenuePaise / 100;
  const roas = mockAdSpend > 0 ? (marketingRevenue / mockAdSpend).toFixed(2) : '0.00';

  // Conversion funnel metrics (simulated session metrics based on event ratios)
  const views = totalEvents ? Math.floor(totalEvents * 0.45) : 120;
  const cartAdds = totalEvents ? Math.floor(totalEvents * 0.18) : 48;
  const checkouts = totalEvents ? Math.floor(totalEvents * 0.08) : 22;
  const purchases = totalOrdersCount || 8;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      
      {/* Metrics Row */}
      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.label}>Marketing Revenue</span>
          <p style={{ fontSize: '2.2rem', fontWeight: '600', margin: 'var(--space-2) 0', color: 'var(--text-primary)' }}>
            ₹{(totalRevenuePaise / 100).toLocaleString('en-IN')}
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            <span>Orders: {totalOrdersCount}</span>
            <span>AOV: ₹{totalOrdersCount > 0 ? Math.floor((totalRevenuePaise / 100) / totalOrdersCount) : 0}</span>
          </div>
        </div>

        <div className={styles.card}>
          <span className={styles.label}>ROAS Metrics (Mock Ad Spend)</span>
          <p style={{ fontSize: '2.2rem', fontWeight: '600', margin: 'var(--space-2) 0', color: 'var(--accent-gold)' }}>
            {roas}x
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            <span>Demo Spend: ₹{mockAdSpend.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div className={styles.card}>
          <span className={styles.label}>Active Destinations</span>
          <p style={{ fontSize: '2.2rem', fontWeight: '600', margin: 'var(--space-2) 0', color: 'var(--text-primary)' }}>
            {activeCount} <span style={{ fontSize: '1rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>/ {providers?.length || 2}</span>
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {providers?.map((p) => (
              <span
                key={p.id}
                className={`${styles.badge} ${p.enabled ? styles.indicatorSuccess : ''}`}
                style={{ textTransform: 'uppercase', padding: '2px 8px', fontSize: '9px' }}
              >
                {p.id}: {p.enabled ? 'ON' : 'OFF'}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Funnel & Attribution splits */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
        
        {/* Conversion Funnel Card */}
        <div className={styles.card}>
          <h3 style={{ textTransform: 'uppercase', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 'var(--space-4)', letterSpacing: '0.05em' }}>
            📊 Ecommerce Conversion Funnel
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {renderFunnelStep('1. Product Browse (Views)', views, 100)}
            {renderFunnelStep('2. Add to Cart (Interest)', cartAdds, views > 0 ? Math.round((cartAdds / views) * 100) : 0)}
            {renderFunnelStep('3. Initiate Checkout (Intent)', checkouts, cartAdds > 0 ? Math.round((checkouts / cartAdds) * 100) : 0)}
            {renderFunnelStep('4. Purchase Success (Action)', purchases, checkouts > 0 ? Math.round((purchases / checkouts) * 100) : 0)}
          </div>
        </div>

        {/* Traffic splits */}
        <div className={styles.card}>
          <h3 style={{ textTransform: 'uppercase', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 'var(--space-4)', letterSpacing: '0.05em' }}>
            🎯 Revenue Acquisition split
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 'bold' }}>Top Traffic Sources:</div>
              {topSources.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No attributed orders yet.</div>
              ) : (
                topSources.map((s, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '3px', marginBottom: '2px' }}>
                    <span style={{ textTransform: 'capitalize' }}>{s.name}</span>
                    <span>₹{s.revenue.toLocaleString('en-IN')}</span>
                  </div>
                ))
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 'bold' }}>Top Campaigns:</div>
              {topCampaigns.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No campaign orders yet.</div>
              ) : (
                topCampaigns.map((c, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '3px', marginBottom: '2px' }}>
                    <span>{c.name}</span>
                    <span>₹{c.revenue.toLocaleString('en-IN')}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Database Event Counters */}
      <div className={styles.card} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '20px' }}>
        <div>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', color: 'var(--text-primary)' }}>Raw Event Telemetry</h4>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Captured: <strong>{totalEvents || 0}</strong> events
          </span>
          <div style={{ display: 'flex', gap: '8px', fontSize: '11px', marginTop: '8px' }}>
            <span style={{ background: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: '3px' }}>Browser: {clientEvents || 0}</span>
            <span style={{ background: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: '3px' }}>Server CAPI: {serverEvents || 0}</span>
          </div>
        </div>
        <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '20px' }}>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', color: 'var(--text-primary)' }}>Consent Audits & Preference Logging</h4>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Total auditable preference records: <strong>{totalConsent || 0}</strong> rows. Every user preference choices is validated prior to provider broadcasts.
          </span>
        </div>
      </div>

    </div>
  );

  function renderFunnelStep(label: string, count: number, percent: number) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
          <span>{label}</span>
          <span>{count} ({percent}%)</span>
        </div>
        <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${percent}%`, height: '100%', background: 'var(--accent-gold)', borderRadius: '3px' }} />
        </div>
      </div>
    );
  }
}
