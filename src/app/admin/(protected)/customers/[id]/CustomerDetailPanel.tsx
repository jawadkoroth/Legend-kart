'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  User,
  Mail,
  Phone,
  Tag,
  Clock,
  ShoppingCart,
  RefreshCw,
  MessageSquare,
  Search,
  ChevronRight,
  TrendingUp,
  Laptop,
  CheckCircle2,
  Calendar,
  AlertOctagon,
  Heart,
  Eye,
  Key,
  Shield,
  Layers,
  Save,
  BookOpen
} from 'lucide-react';

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
  const [saveSuccess, setSaveSuccess] = useState(false);

  // CRM States
  const [commMessages, setCommMessages] = useState<any[]>([]);
  const [commPreferences, setCommPreferences] = useState<any>(null);
  const [loadingComm, setLoadingComm] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    if (!customer.id) return;
    async function loadCommunicationDetails() {
      setLoadingComm(true);
      try {
        const { data: msgs } = await supabase
          .from('communication_messages')
          .select('*')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false });
        setCommMessages(msgs || []);

        const { data: prefs } = await supabase
          .from('communication_preferences')
          .select('*')
          .eq('customer_id', customer.id)
          .maybeSingle();
        setCommPreferences(prefs);
      } catch (err) {
        console.error('Error loading communication details:', err);
      } finally {
        setLoadingComm(false);
      }
    }
    loadCommunicationDetails();
  }, [customer.id]);

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    setSaveSuccess(false);
    try {
      const { error } = await supabase
        .from('customer_profiles')
        .update({ notes: notesText, updated_at: new Date().toISOString() })
        .eq('id', customer.id);

      if (error) {
        alert(`Error saving notes: ${error.message}`);
      } else {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingNotes(false);
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'G';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Compile stitched timeline
  const timelineItems: Array<{ id: string; name: string; type: string; date: string; icon: any; detail?: string }> = [];

  // 1. Orders
  orders.forEach((o) => {
    timelineItems.push({
      id: `order-${o.id}`,
      name: `Placed Order #${o.order_number}`,
      type: 'order',
      date: o.created_at,
      icon: ShoppingCart,
      detail: `Total Amount: ₹${(o.total_paise / 100).toLocaleString('en-IN')} (Payment: ${o.payment_method.toUpperCase()}, Status: ${o.order_status})`,
    });
  });

  // 2. Returns
  returns.forEach((r) => {
    timelineItems.push({
      id: `return-${r.id}`,
      name: `Requested Return / Exchange`,
      type: 'return',
      date: r.created_at,
      icon: RefreshCw,
      detail: `Reason: ${r.reason || 'Not specified'}`,
    });
  });

  // 3. Marketing Events
  marketingEvents.forEach((e) => {
    let icon = Search;
    let name = e.event_name;
    let detail = '';

    if (e.event_name === 'page_viewed') {
      icon = Laptop;
      name = 'Page Visited';
      detail = e.payload?.properties?.path || e.payload?.properties?.url || '';
    } else if (e.event_name === 'product_viewed') {
      icon = Eye;
      name = 'Viewed Product';
      detail = e.payload?.properties?.name || '';
    } else if (e.event_name === 'product_added_to_cart') {
      icon = ShoppingCart;
      name = 'Added to Cart';
      detail = e.payload?.properties?.name || '';
    } else if (e.event_name === 'wishlist_added') {
      icon = Heart;
      name = 'Added to Wishlist';
      detail = e.payload?.properties?.name || '';
    } else if (e.event_name === 'checkout_started') {
      icon = Key;
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

  // 4. Communication outreach messages
  commMessages.forEach((m) => {
    timelineItems.push({
      id: `comm-${m.id}`,
      name: `Sent ${m.channel.toUpperCase()} Outreach`,
      type: 'communication',
      date: m.created_at,
      icon: Mail,
      detail: `${m.subject || m.body.slice(0, 50)}... (Status: ${m.status})`
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* 1. Shopify-Style Profile Identity Card */}
      <div className="card" style={{ display: 'flex', gap: '20px', alignItems: 'center', padding: '24px' }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent-gold) 0%, #B8860B 100%)',
          color: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: '1.5rem',
          boxShadow: 'var(--shadow-md)',
          textShadow: '0 1px 1px rgba(255,255,255,0.2)'
        }}>
          {getInitials(customer.name)}
        </div>
        
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {customer.name || 'Anonymous Guest'}
            </h2>
            
            <div style={{ display: 'flex', gap: '4px' }}>
              {segments.map((seg: any) => (
                <span
                  key={seg.segment_name}
                  style={{
                    background: seg.segment_name === 'VIP' ? 'rgba(201,168,106,0.1)' : 'var(--bg-tertiary)',
                    color: seg.segment_name === 'VIP' ? 'var(--accent-gold)' : 'var(--text-secondary)',
                    borderColor: seg.segment_name === 'VIP' ? 'var(--accent-gold)' : 'var(--border-color)',
                    border: '1px solid',
                    fontSize: '10px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '10px'
                  }}
                >
                  {seg.segment_name}
                </span>
              ))}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={12} /> {customer.email || 'no-email'}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={12} /> {customer.phone || 'no-phone'}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> Joined: {formatDate(customer.created_at)}</span>
          </div>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        {[
          { id: 'overview', label: 'Overview Profile', icon: User },
          { id: 'timeline', label: 'Attribution & Timeline', icon: Clock },
          { id: 'orders', label: 'Order History', icon: ShoppingCart },
          { id: 'wishlist', label: 'Wishlist & Views', icon: Heart },
          { id: 'communication', label: 'Communication Hub', icon: Mail }
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                padding: '8px 12px',
                fontSize: '0.85rem',
                color: activeTab === tab.id ? 'var(--accent-gold)' : 'var(--text-muted)',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent-gold)' : 'none',
                cursor: 'pointer',
                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab panel body content */}
      <div style={{ minHeight: '380px' }}>
        
        {/* Tab 1: Shopify-Style Overview */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
            
            {/* Left column: Metrics + Recent Orders + Timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Lifetime Value</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--accent-gold)', marginTop: '6px' }}>{formatPrice(scores.ltv_paise || 0)}</div>
                </div>
                <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Average Order</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '6px' }}>{formatPrice(scores.aov_paise || 0)}</div>
                </div>
                <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Orders</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '6px' }}>{scores.total_orders || 0}</div>
                </div>
                <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Engagement</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '6px' }}>{scores.engagement_score || 0} pts</div>
                </div>
              </div>

              {/* Recent Orders */}
              <div className="card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '14px' }}>Recent Orders</h3>
                
                {orders.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No orders placed yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {orders.slice(0, 3).map((o) => (
                      <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-tertiary)' }}>
                        <div style={{ fontSize: '0.8rem' }}>
                          <div style={{ fontWeight: 600, color: 'var(--accent-gold)' }}>Order #{o.order_number}</div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{formatDate(o.created_at)}</span>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span className={`badge badge-${o.order_status}`} style={{ fontSize: '10px', height: '20px', padding: '0 8px' }}>{o.order_status}</span>
                          <strong style={{ fontSize: '0.85rem' }}>{formatPrice(o.total_paise)}</strong>
                          <Link href={`/admin/orders/${o.id}`} style={{ color: 'var(--text-muted)' }}><ChevronRight size={14} /></Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Timeline preview snippet */}
              <div className="card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '14px' }}>Stitched Event Timeline</h3>
                
                <div style={{ borderLeft: '1px solid var(--border-color)', marginLeft: '8px', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {timelineItems.slice(0, 5).map((item) => {
                    const IconComp = item.icon;
                    return (
                      <div key={item.id} style={{ position: 'relative' }}>
                        <span style={{
                          position: 'absolute',
                          left: '-24px',
                          top: '2px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <IconComp size={10} style={{ color: 'var(--accent-gold)' }} />
                        </span>
                        
                        <div style={{ fontSize: '0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{item.name}</strong>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{formatRelative(item.date)}</span>
                          </div>
                          {item.detail && <p style={{ color: 'var(--text-secondary)', margin: '2px 0 0 0', fontSize: '0.7rem' }}>{item.detail}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right column: Internal Notes + Identity links + Marketing */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Internal Notes card */}
              <div className="card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0 }}>Internal Notes</h3>
                  {saveSuccess && <span style={{ fontSize: '0.7rem', color: 'var(--success)' }}>Saved ✓</span>}
                </div>
                <textarea
                  className="admin-form-input"
                  style={{ width: '100%', minHeight: '120px', fontSize: '0.8rem', resize: 'vertical', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px', color: 'var(--text-primary)' }}
                  placeholder="Record customer preferences, delivery remarks, special notes..."
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                />
                <button
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '34px', fontSize: '0.8rem' }}
                >
                  <Save size={12} />
                  {savingNotes ? 'Saving...' : 'Save internal notes'}
                </button>
              </div>

              {/* Linked stitched identities */}
              <div className="card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>Stitched Identities</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {links.map((link) => (
                    <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem' }}>
                      <span style={{ fontSize: '9px', fontWeight: 600, background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-color)', textTransform: 'uppercase' }}>
                        {link.identity_type}
                      </span>
                      <code style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{link.identity_value.slice(0, 16)}...</code>
                    </div>
                  ))}
                </div>
              </div>

              {/* Marketing channel attribution */}
              <div className="card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>Traffic Attribution</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>UTM Source:</span>
                    <strong>{scores.utm_source || 'Direct / Organic'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Campaign:</span>
                    <strong>{scores.utm_campaign || 'n/a'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Google ID:</span>
                    <strong style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{orders[0]?.gclid ? 'Yes' : 'None'}</strong>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Tab 2: Stitched Activity Timeline */}
        {activeTab === 'timeline' && (
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '20px' }}>Stitched Customer Timeline</h3>
            
            <div style={{ borderLeft: '1px solid var(--border-color)', marginLeft: '12px', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {timelineItems.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No events recorded.</div>
              ) : (
                timelineItems.map((item) => {
                  const IconComp = item.icon;
                  return (
                    <div key={item.id} style={{ position: 'relative' }}>
                      <span style={{
                        position: 'absolute',
                        left: '-28px',
                        top: '2px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <IconComp size={12} style={{ color: 'var(--accent-gold)' }} />
                      </span>
                      
                      <div style={{ fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{item.name}</strong>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{formatDate(item.date)}</span>
                        </div>
                        {item.detail && <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0 0', fontSize: '0.75rem' }}>{item.detail}</p>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Order History */}
        {activeTab === 'orders' && (
          <div className="card" style={{ padding: '20px', overflowX: 'auto' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '14px' }}>Order Records ({orders.length})</h3>
            
            {orders.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No orders placed.</p>
            ) : (
              <table style={{ width: '100%', fontSize: '0.8rem', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '10px 8px' }}>Order Number</th>
                    <th style={{ padding: '10px 8px' }}>Order Status</th>
                    <th style={{ padding: '10px 8px' }}>Payment</th>
                    <th style={{ padding: '10px 8px' }}>Total Amount</th>
                    <th style={{ padding: '10px 8px' }}>Date</th>
                    <th style={{ padding: '10px 8px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '12px 8px', fontWeight: 'bold', fontFamily: 'monospace' }}>{o.order_number}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <span className={`badge badge-${o.order_status}`} style={{ fontSize: '9px' }}>{o.order_status}</span>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span className={`badge badge-${o.payment_status === 'paid' ? 'paid' : 'cancelled'}`} style={{ fontSize: '9px' }}>{o.payment_status}</span>
                      </td>
                      <td style={{ padding: '12px 8px', fontWeight: 600 }}>{formatPrice(o.total_paise)}</td>
                      <td style={{ padding: '12px 8px' }}>{formatDate(o.created_at)}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <Link href={`/admin/orders/${o.id}`} style={{ color: 'var(--accent-gold)', fontWeight: 600 }}>
                          Open Detail ↗
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 4: Wishlist & Views */}
        {activeTab === 'wishlist' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            
            {/* Wishlist Items */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '14px' }}>Active Wishlist ({wishlist.length})</h3>
              
              {wishlist.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No items in wishlist.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {wishlist.map((item) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-tertiary)' }}>
                      <div>
                        <strong style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{item.products?.name}</strong>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.products?.category}</div>
                      </div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, alignSelf: 'center' }}>
                        ₹{(item.products?.price_paise / 100).toLocaleString('en-IN')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recently Viewed */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '14px' }}>Recently Viewed ({recentlyViewed.length})</h3>
              
              {recentlyViewed.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No recently viewed items.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {recentlyViewed.slice(0, 5).map((item) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-tertiary)' }}>
                      <div>
                        <strong style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{item.products?.name}</strong>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.products?.category}</div>
                      </div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, alignSelf: 'center' }}>
                        ₹{(item.products?.price_paise / 100).toLocaleString('en-IN')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* Tab 5: Communication Outreach */}
        {activeTab === 'communication' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
            {/* Outreach Ledger */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '14px' }}>Customer Outreach Ledger ({commMessages.length})</h3>
              
              {loadingComm ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading outreach logs...</div>
              ) : commMessages.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No outreach messages dispatched to this customer.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {commMessages.map((msg) => (
                    <div key={msg.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', background: 'var(--bg-tertiary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-gold)', textTransform: 'uppercase' }}>{msg.channel} message</span>
                        <span className={`badge badge-${msg.status === 'sent' || msg.status === 'delivered' ? 'paid' : (msg.status === 'queued' ? 'pending' : 'failed')}`} style={{ fontSize: '9px' }}>{msg.status}</span>
                      </div>
                      {msg.subject && <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '4px', color: 'var(--text-primary)' }}>{msg.subject}</div>}
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap' }}>{msg.body}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        <span>Provider: {msg.provider}</span>
                        <span>{formatDate(msg.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Preference Choices */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '16px' }}>Opt-in Choices</h3>
              
              {commPreferences ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Email Outreach</span>
                    <span className={`badge badge-${commPreferences.email_opt_in ? 'paid' : 'cancelled'}`} style={{ fontSize: '9px' }}>{commPreferences.email_opt_in ? 'OPT-IN' : 'OPT-OUT'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>WhatsApp Outreach</span>
                    <span className={`badge badge-${commPreferences.whatsapp_opt_in ? 'paid' : 'cancelled'}`} style={{ fontSize: '9px' }}>{commPreferences.whatsapp_opt_in ? 'OPT-IN' : 'OPT-OUT'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Push Alerts</span>
                    <span className={`badge badge-${commPreferences.push_opt_in ? 'paid' : 'cancelled'}`} style={{ fontSize: '9px' }}>{commPreferences.push_opt_in ? 'OPT-IN' : 'OPT-OUT'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>SMS Outreach</span>
                    <span className={`badge badge-${commPreferences.sms_opt_in ? 'paid' : 'cancelled'}`} style={{ fontSize: '9px' }}>{commPreferences.sms_opt_in ? 'OPT-IN' : 'OPT-OUT'}</span>
                  </div>
                  <hr style={{ border: 'none', borderBottom: '1px solid var(--border-color)', margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Transactional Only</span>
                    <span className="badge badge-secondary" style={{ fontSize: '9px' }}>{commPreferences.transactional_only ? 'YES' : 'NO'}</span>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No preferences recorded.</p>
              )}
            </div>
          </div>
        )}

      </div>

    </div>
  );
}

// Relative date helper
function formatRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
