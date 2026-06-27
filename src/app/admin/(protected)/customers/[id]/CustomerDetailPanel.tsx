'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import styles from '../customers.module.css';

interface CustomerDetailPanelProps {
  customer: any;
  links: any[];
  orders: any[];
  returns: any[];
  wishlist: any[];
  recentlyViewed: any[];
  marketingEvents: any[];
}

export default function CustomerDetailPanel({
  customer,
  links,
  orders,
  returns,
  wishlist,
  recentlyViewed,
  marketingEvents,
}: CustomerDetailPanelProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [notesText, setNotesText] = useState(customer.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);

  const supabase = createClient();

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from('customer_profiles')
        .update({ notes: notesText, updated_at: new Date().toISOString() })
        .eq('id', customer.id);

      if (error) {
        alert(`Error saving notes: ${error.message}`);
      } else {
        alert('Internal notes updated successfully.');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingNotes(false);
    }
  };

  // Compile stitched timeline
  const timelineItems: Array<{ id: string; name: string; type: string; date: string; icon: string; detail?: string }> = [];

  // 1. Orders
  orders.forEach((o) => {
    timelineItems.push({
      id: `order-${o.id}`,
      name: `Placed Order ${o.order_number}`,
      type: 'order',
      date: o.created_at,
      icon: '🛍️',
      detail: `Total Amount: ₹${(o.total_paise / 100).toLocaleString('en-IN')} (Payment: ${o.payment_method.toUpperCase()})`,
    });
  });

  // 2. Returns
  returns.forEach((r) => {
    timelineItems.push({
      id: `return-${r.id}`,
      name: `Requested Return for Order`,
      type: 'return',
      date: r.created_at,
      icon: '🔄',
      detail: `Reason: ${r.reason || 'Not specified'}`,
    });
  });

  // 3. Marketing Events
  marketingEvents.forEach((e) => {
    let icon = '🔎';
    let name = e.event_name;
    let detail = '';

    if (e.event_name === 'page_viewed') {
      icon = '💻';
      name = 'Page Visited';
      detail = e.payload?.properties?.path || e.payload?.properties?.url || '';
    } else if (e.event_name === 'product_viewed') {
      icon = '👁️';
      name = 'Viewed Product';
      detail = e.payload?.properties?.name || '';
    } else if (e.event_name === 'product_added_to_cart') {
      icon = '🛒';
      name = 'Added to Cart';
      detail = e.payload?.properties?.name || '';
    } else if (e.event_name === 'wishlist_added') {
      icon = '💖';
      name = 'Added to Wishlist';
      detail = e.payload?.properties?.name || '';
    } else if (e.event_name === 'checkout_started') {
      icon = '🔑';
      name = 'Checkout Started';
      detail = `Items: ${e.payload?.properties?.items?.length || 1}`;
    }

    timelineItems.push({
      id: `event-${e.id}`,
      name,
      type: 'event',
      date: e.created_at,
      icon,
      detail,
    });
  });

  // Sort chronologically (newest first)
  timelineItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPrice = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN');

  const scores = customer.scores?.[0] || customer.scores || {};
  const segments = customer.segments || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      
      {/* Customer Header summary */}
      <div className={styles.card} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)', margin: 0 }}>
            👤 {customer.name || 'Anonymous Guest'}
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            ID: <code style={{ fontFamily: 'monospace' }}>{customer.id}</code>
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '6px' }}>
          {segments.map((seg: any) => (
            <span
              key={seg.segment_name}
              className={styles.badge}
              style={{
                background: seg.segment_name === 'VIP' ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.03)',
                color: seg.segment_name === 'VIP' ? 'var(--accent-gold)' : 'var(--text-secondary)',
                borderColor: seg.segment_name === 'VIP' ? 'var(--accent-gold)' : 'var(--border-color)',
                fontSize: '11px',
                padding: '4px 10px',
              }}
            >
              {seg.segment_name}
            </span>
          ))}
        </div>
      </div>

      {/* Tabs list navigation row */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '15px', overflowX: 'auto', paddingBottom: '4px' }}>
        {['overview', 'timeline', 'orders', 'returns', 'marketing', 'devices', 'wishlist', 'recently_viewed', 'analytics', 'notes'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 12px',
              fontSize: '0.85rem',
              color: activeTab === tab ? 'var(--accent-gold)' : 'var(--text-muted)',
              borderBottom: activeTab === tab ? '2px solid var(--accent-gold)' : 'none',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? 'bold' : 'normal',
              textTransform: 'capitalize',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Tab panel body */}
      <div className={styles.card} style={{ minHeight: '300px' }}>
        
        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
            <div>
              <h4 style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: '12px' }}>
                Profile Identity
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                <div><strong>Email:</strong> {customer.email || 'n/a'}</div>
                <div><strong>Phone:</strong> {customer.phone || 'n/a'}</div>
                <div><strong>Created:</strong> {formatDate(customer.created_at)}</div>
                <div><strong>Last Active:</strong> {scores.last_active ? formatDate(scores.last_active) : 'n/a'}</div>
              </div>
            </div>

            <div>
              <h4 style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: '12px' }}>
                Summary Scores
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                <div><strong>Lifetime Revenue (LTV):</strong> {formatPrice(scores.ltv_paise || 0)}</div>
                <div><strong>Average Order Value (AOV):</strong> {formatPrice(scores.aov_paise || 0)}</div>
                <div><strong>Total Orders:</strong> {scores.total_orders || 0}</div>
                <div><strong>Engagement Score:</strong> {scores.engagement_score || 0} pts</div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Timeline */}
        {activeTab === 'timeline' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h4 style={{ color: 'var(--text-primary)', margin: 0 }}>Stitched Customer Timeline</h4>
            <div style={{ borderLeft: '2px solid var(--border-color)', marginLeft: '12px', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {timelineItems.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No activity records recorded on timeline.</div>
              ) : (
                timelineItems.map((item, idx) => (
                  <div key={item.id} style={{ position: 'relative' }}>
                    {/* Circle icon marker */}
                    <span style={{
                      position: 'absolute',
                      left: '-28px',
                      top: '0px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                    }}>
                      {item.icon}
                    </span>
                    
                    <div style={{ fontSize: '0.85rem' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{item.name}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '10px' }}>{formatDate(item.date)}</span>
                      {item.detail && <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>{item.detail}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Orders */}
        {activeTab === 'orders' && (
          <div style={{ overflowX: 'auto' }}>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px' }}>Order Records ({orders.length})</h4>
            <table style={{ width: '100%', fontSize: '0.85rem', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '8px' }}>Order Number</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}>Payment</th>
                  <th style={{ padding: '8px' }}>Total Amount</th>
                  <th style={{ padding: '8px' }}>Date Placed</th>
                  <th style={{ padding: '8px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>{o.order_number}</td>
                    <td style={{ padding: '8px' }}>{o.order_status}</td>
                    <td style={{ padding: '8px' }}>{o.payment_status}</td>
                    <td style={{ padding: '8px' }}>{formatPrice(o.total_paise)}</td>
                    <td style={{ padding: '8px' }}>{formatDate(o.created_at)}</td>
                    <td style={{ padding: '8px' }}>
                      <Link href={`/admin/orders/${o.id}`} className={styles.btnLink}>
                        Open Order Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 4: Returns */}
        {activeTab === 'returns' && (
          <div style={{ overflowX: 'auto' }}>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px' }}>Return Requests ({returns.length})</h4>
            <table style={{ width: '100%', fontSize: '0.85rem', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '8px' }}>Return ID</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}>Reason</th>
                  <th style={{ padding: '8px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>{r.id.slice(0, 8)}</td>
                    <td style={{ padding: '8px' }}>{r.status}</td>
                    <td style={{ padding: '8px' }}>{r.reason}</td>
                    <td style={{ padding: '8px' }}>{formatDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 5: Marketing */}
        {activeTab === 'marketing' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
            <div>
              <h4 style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: '12px' }}>
                Traffic Referrers & Attribution
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                <div><strong>UTM Source:</strong> {scores.utm_source || 'Direct / Organic'}</div>
                <div><strong>UTM Campaign:</strong> {scores.utm_campaign || 'n/a'}</div>
                <div><strong>UTM Medium:</strong> {orders[0]?.utm_medium || 'n/a'}</div>
                <div><strong>First Touch:</strong> {orders[0]?.first_touch || 'n/a'}</div>
                <div><strong>Last Touch:</strong> {orders[0]?.last_touch || 'n/a'}</div>
              </div>
            </div>

            <div>
              <h4 style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: '12px' }}>
                Landing & Click Identifiers
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                <div><strong>Referrer Host:</strong> {orders[0]?.referrer || 'Direct'}</div>
                <div style={{ wordBreak: 'break-all' }}><strong>Landing URL:</strong> {orders[0]?.landing_page || 'n/a'}</div>
                <div><strong>Google Click ID (gclid):</strong> {orders[0]?.gclid || 'n/a'}</div>
                <div><strong>Facebook Click ID (fbclid):</strong> {orders[0]?.fbclid || 'n/a'}</div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Devices */}
        {activeTab === 'devices' && (
          <div>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px' }}>Linked Device Fingerprints & Identifiers</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Stitched Identity Value Locks:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {links.map((link) => (
                    <div key={link.id} style={{ fontSize: '0.75rem', display: 'flex', gap: '10px' }}>
                      <span className={styles.badge} style={{ textTransform: 'uppercase', fontSize: '9px' }}>{link.identity_type}</span>
                      <code style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{link.identity_value}</code>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 7: Wishlist */}
        {activeTab === 'wishlist' && (
          <div>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px' }}>Active Wishlist Items ({wishlist.length})</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              {wishlist.map((item) => (
                <div key={item.id} style={{ border: '1px solid var(--border-color)', padding: '10px', borderRadius: '6px' }}>
                  <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)', display: 'block' }}>{item.products?.name}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.products?.category}</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.8rem' }}>
                    <span>₹{(item.products?.price_paise / 100).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 8: Recently Viewed */}
        {activeTab === 'recently_viewed' && (
          <div>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px' }}>Recently Viewed Products ({recentlyViewed.length})</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              {recentlyViewed.map((item) => (
                <div key={item.id} style={{ border: '1px solid var(--border-color)', padding: '10px', borderRadius: '6px' }}>
                  <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)', display: 'block' }}>{item.products?.name}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Viewed at: {formatDate(item.viewed_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 9: Analytics */}
        {activeTab === 'analytics' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <h4 style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', margin: 0 }}>
                Engagement Matrix
              </h4>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                  <span>User Engagement points score</span>
                  <strong>{scores.engagement_score || 0} pts</strong>
                </div>
                <div style={{ height: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, (scores.engagement_score || 0) * 2)}%`, height: '100%', background: 'var(--accent-gold)' }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <h4 style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', margin: 0 }}>
                Predictive Analytics (Placeholders)
              </h4>
              <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div><strong>Predicted Lifetime Value (CLTV):</strong> ₹12,500.00</div>
                <div><strong>Churn Risk Probability:</strong> <span style={{ color: 'var(--success)' }}>Low Risk (14%)</span></div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 10: Notes */}
        {activeTab === 'notes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ color: 'var(--text-primary)', margin: 0 }}>Internal Support Notes</h4>
            <textarea
              className={styles.inputField}
              style={{ height: '120px', resize: 'vertical' }}
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Enter internal customer annotation notes..."
            />
            <button
              onClick={handleSaveNotes}
              className={styles.btnPrimary}
              style={{ alignSelf: 'flex-start', padding: '6px 16px', fontSize: '0.8rem' }}
              disabled={savingNotes}
            >
              {savingNotes ? 'Saving Notes...' : '💾 Update Profile Notes'}
            </button>
          </div>
        )}

      </div>

    </div>
  );
}
