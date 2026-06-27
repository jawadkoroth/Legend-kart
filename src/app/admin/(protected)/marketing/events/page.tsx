'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from '../marketing-admin.module.css';

interface MarketingEventRow {
  id: string;
  event_id: string;
  event_name: string;
  ts_client: string;
  ts_server: string;
  anonymous_id: string;
  user_id: string | null;
  session_id: string;
  correlation_id: string | null;
  properties: any;
  context: any;
  duration: number | null;
  provider_status: Record<string, string>;
  provider_errors: Record<string, string>;
  in_dlq: boolean;
  validation_errors: string[];
}

export default function EventInspectorPage() {
  const [events, setEvents] = useState<MarketingEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Views: 'list' or 'timeline'
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');

  // Filters
  const [searchName, setSearchName] = useState('all');
  const [searchStatus, setSearchStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCorrelation, setSearchCorrelation] = useState('');

  // Selected event for detail view
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Simulator running state
  const [simulating, setSimulating] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    fetchEvents();

    // Setup Supabase Realtime channel subscription
    const channel = supabase
      .channel('marketing-realtime-events')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'marketing_events' },
        (payload) => {
          const newEvent = payload.new as MarketingEventRow;
          setEvents((prev) => [newEvent, ...prev].slice(0, 150));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  async function fetchEvents() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('marketing_events')
        .select('*')
        .order('ts_server', { ascending: false })
        .limit(100);

      if (!error && data) {
        setEvents(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Event Simulator Action
  const handleSimulate = async (type: string) => {
    setSimulating(type);
    try {
      // Mock generate standard simulator request payloads
      let properties = {};
      let name = '';

      if (type === 'page') {
        name = 'page_viewed';
        properties = {
          url: 'https://panther-store.com/products/jacket',
          path: '/products/jacket',
          title: 'PANTHER Minimalist Leather Jacket',
        };
      } else if (type === 'cart') {
        name = 'product_added_to_cart';
        properties = {
          productId: 'prod_jacket_99',
          name: 'PANTHER Minimalist Leather Jacket',
          price: 4999,
          quantity: 1,
          currency: 'INR',
        };
      } else if (type === 'checkout') {
        name = 'checkout_started';
        properties = {
          cartId: 'cart_998877',
          value: 4999,
          currency: 'INR',
          itemsCount: 1,
        };
      } else if (type === 'purchase') {
        name = 'payment_success';
        properties = {
          orderId: `ord_${Math.floor(100000 + Math.random() * 900000)}`,
          value: 4999,
          currency: 'INR',
          paymentId: `pay_sim_${Math.random().toString(36).substring(7)}`,
        };
      } else if (type === 'invalid') {
        name = 'product_added_to_cart'; // missing currency type & price type validation trigger
        properties = {
          productId: 'prod_broken',
          price: 'FREE', // Expected number, triggers check error
          currency: 'INVALID_CURR', // Expected 3 letters ISO
        };
      }

      const simEvent = {
        eventId: '550e8400-e29b-41d4-a716-' + Math.floor(100000000000 + Math.random() * 900000000000),
        schemaVersion: '1.0.0',
        eventVersion: '1.0.0',
        providerMappingVersion: '1.0.0',
        eventName: name,
        timestamp: new Date().toISOString(),
        sessionId: 'sess_simulated_99',
        anonymousId: 'anon_simulated_99',
        userId: type === 'purchase' ? 'usr_simulated_99' : null,
        properties,
        correlationId: 'c0ffeec0-ffee-c0ff-eec0-ffeec0ffeec0', // Static correlation for journey simulator tests
        context: {
          page: {
            url: 'https://panther-store.com/products/jacket',
            path: '/products/jacket',
            referrer: '',
            title: 'Simulated Page',
          },
          device: { type: 'desktop', browser: 'Chrome' },
          consent: { functional: true, analytics: true, marketing: true, version: '1.0.0' },
        },
        source: 'client',
      };

      const res = await fetch('/api/marketing/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simEvent),
      });

      if (res.ok) {
        // Refresh event stream
        setTimeout(fetchEvents, 200);
      } else {
        alert('Simulation POST request failed.');
      }
    } catch (err: any) {
      alert(`Simulation failed: ${err.message}`);
    } finally {
      setSimulating(null);
    }
  };

  // Filtered lists
  const filteredEvents = events.filter((ev) => {
    // 1. Name match
    if (searchName !== 'all' && ev.event_name !== searchName) return false;
    
    // 2. Status match
    if (searchStatus === 'failed') {
      const failed = Object.values(ev.provider_status || {}).includes('failed');
      if (!failed && !ev.in_dlq) return false;
    } else if (searchStatus === 'dlq') {
      if (!ev.in_dlq) return false;
    } else if (searchStatus === 'sent') {
      const values = Object.values(ev.provider_status || {});
      if (values.length === 0 || values.includes('failed')) return false;
    }

    // 3. Correlation ID match
    if (searchCorrelation && ev.correlation_id !== searchCorrelation) return false;

    // 4. Query text search (searches ID, user_id, or properties string)
    if (searchQuery) {
      const match =
        ev.event_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ev.anonymous_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ev.user_id && ev.user_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
        JSON.stringify(ev.properties).toLowerCase().includes(searchQuery.toLowerCase());
      if (!match) return false;
    }

    return true;
  });

  // Group events by correlation_id for Journey Timeline
  const groupedJourneys: Record<string, MarketingEventRow[]> = {};
  filteredEvents.forEach((ev) => {
    const key = ev.correlation_id || 'unassigned_journey';
    if (!groupedJourneys[key]) {
      groupedJourneys[key] = [];
    }
    groupedJourneys[key].push(ev);
  });

  // Sort events in each journey ascending by time
  Object.keys(groupedJourneys).forEach((key) => {
    groupedJourneys[key].sort(
      (a, b) => new Date(a.ts_client).getTime() - new Date(b.ts_client).getTime()
    );
  });

  const selectedEvent = events.find((e) => e.event_id === selectedEventId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Dev Tools & Simulator Panel */}
      <div className={styles.card}>
        <h3 style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>
          🛠️ Developer Event Simulator
        </h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
          Pushes simulated mock events directly through the complete pipeline (Validation, Queue, Feature Flags, DB logs, and Realtime stream).
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button
            className={styles.btn}
            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
            onClick={() => handleSimulate('page')}
            disabled={simulating !== null}
          >
            {simulating === 'page' ? 'Firing...' : '🔗 Simulate Page View'}
          </button>
          <button
            className={styles.btn}
            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
            onClick={() => handleSimulate('cart')}
            disabled={simulating !== null}
          >
            {simulating === 'cart' ? 'Firing...' : '🛒 Simulate Add to Cart'}
          </button>
          <button
            className={styles.btn}
            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
            onClick={() => handleSimulate('checkout')}
            disabled={simulating !== null}
          >
            {simulating === 'checkout' ? 'Firing...' : '💳 Simulate Checkout'}
          </button>
          <button
            className={styles.btn}
            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
            onClick={() => handleSimulate('purchase')}
            disabled={simulating !== null}
          >
            {simulating === 'purchase' ? 'Firing...' : '💰 Simulate Purchase'}
          </button>
          <button
            className={styles.btn}
            style={{
              padding: '6px 12px',
              fontSize: '0.75rem',
              color: 'var(--error)',
              borderColor: 'rgba(229, 57, 53, 0.2)',
            }}
            onClick={() => handleSimulate('invalid')}
            disabled={simulating !== null}
          >
            {simulating === 'invalid' ? 'Firing...' : '💥 Simulate Invalid Event (DLQ test)'}
          </button>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className={styles.card} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            🔍 Advanced Inspector Search Filters
          </h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`${styles.btn} ${viewMode === 'list' ? styles.btnPrimary : ''}`}
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              onClick={() => setViewMode('list')}
            >
              📋 Flat List
            </button>
            <button
              className={`${styles.btn} ${viewMode === 'timeline' ? styles.btnPrimary : ''}`}
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              onClick={() => setViewMode('timeline')}
            >
              📊 Waterfall Journeys
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label className={styles.label} style={{ fontSize: '0.7rem' }}>Event Name</label>
            <select
              className={styles.input}
              style={{ fontSize: '0.8rem', padding: '6px' }}
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
            >
              <option value="all">All Events</option>
              <option value="page_viewed">page_viewed</option>
              <option value="product_viewed">product_viewed</option>
              <option value="product_added_to_cart">product_added_to_cart</option>
              <option value="checkout_started">checkout_started</option>
              <option value="payment_success">payment_success</option>
            </select>
          </div>

          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label className={styles.label} style={{ fontSize: '0.7rem' }}>Dispatch Status</label>
            <select
              className={styles.input}
              style={{ fontSize: '0.8rem', padding: '6px' }}
              value={searchStatus}
              onChange={(e) => setSearchStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="sent">Successful (No Failures)</option>
              <option value="failed">Failed Delivery</option>
              <option value="dlq">In Dead Letter Queue (DLQ)</option>
            </select>
          </div>

          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label className={styles.label} style={{ fontSize: '0.7rem' }}>Correlation Journey ID</label>
            <input
              type="text"
              className={styles.input}
              style={{ fontSize: '0.8rem', padding: '6px' }}
              placeholder="e.g. c0ffeec0-..."
              value={searchCorrelation}
              onChange={(e) => setSearchCorrelation(e.target.value)}
            />
          </div>

          <div className={styles.formGroup} style={{ marginBottom: 0 }}>
            <label className={styles.label} style={{ fontSize: '0.7rem' }}>Text / Property Match</label>
            <input
              type="text"
              className={styles.input}
              style={{ fontSize: '0.8rem', padding: '6px' }}
              placeholder="Search IDs, properties, traits..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Main Content Split: Stream & Inspector Details */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedEvent ? '1.2fr 1fr' : '1fr', gap: 'var(--space-4)', alignItems: 'flex-start' }}>
        {/* Stream List / Timeline Pane */}
        <div className={styles.card} style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h3 style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
            📡 Event Stream ({filteredEvents.length} logs matched)
          </h3>

          {loading ? (
            <div style={{ color: 'var(--text-secondary)' }}>Loading event logs...</div>
          ) : filteredEvents.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No events captured matching search query. Try triggering the simulator.</div>
          ) : viewMode === 'list' ? (
            /* Flat List view */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '600px', overflowY: 'auto', paddingRight: '4px' }}>
              {filteredEvents.map((ev) => {
                const isFailed = ev.in_dlq || Object.values(ev.provider_status || {}).includes('failed');
                return (
                  <div
                    key={ev.id}
                    onClick={() => setSelectedEventId(ev.event_id)}
                    className={`${styles.card} ${selectedEventId === ev.event_id ? styles.cardActive : ''}`}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      border: selectedEventId === ev.event_id ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                      background: 'rgba(255,255,255,0.01)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '600', fontSize: '0.85rem', color: isFailed ? 'var(--error)' : 'var(--text-primary)' }}>
                          {ev.event_name}
                        </span>
                        {ev.in_dlq && (
                          <span style={{ background: 'rgba(229,57,53,0.1)', color: 'var(--error)', padding: '2px 6px', borderRadius: '4px', fontSize: '8px', fontWeight: 'bold' }}>
                            DLQ
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        ID: {ev.event_id.substring(0, 8)}... • Session: {ev.session_id.substring(0, 6)} • Corr: {ev.correlation_id ? ev.correlation_id.substring(0, 8) : 'none'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {ev.duration ? `${ev.duration}ms` : '0ms'}
                      </span>
                      <span className={`${styles.indicator} ${isFailed ? styles.indicatorError : styles.indicatorSuccess}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Journey Timeline Waterfall view */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxHeight: '600px', overflowY: 'auto' }}>
              {Object.keys(groupedJourneys).map((journeyId) => {
                const journeyEvents = groupedJourneys[journeyId];
                const startTime = new Date(journeyEvents[0]?.ts_client).getTime();
                
                return (
                  <div
                    key={journeyId}
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-3)',
                      background: 'rgba(255,255,255,0.01)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)', borderBottom: '1px dashed var(--border-color)', paddingBottom: '6px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                        💼 Journey Correlation ID: <span style={{ fontFamily: 'monospace' }}>{journeyId.substring(0, 18)}...</span>
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {journeyEvents.length} events
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '8px', borderLeft: '2px solid rgba(255,255,255,0.05)' }}>
                      {journeyEvents.map((ev, index) => {
                        const evTime = new Date(ev.ts_client).getTime();
                        const delaySec = index === 0 ? 0 : ((evTime - startTime) / 1000).toFixed(1);
                        const isFailed = ev.in_dlq || Object.values(ev.provider_status || {}).includes('failed');

                        return (
                          <div
                            key={ev.id}
                            onClick={() => setSelectedEventId(ev.event_id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 10px',
                              borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer',
                              background: selectedEventId === ev.event_id ? 'rgba(255,255,255,0.04)' : 'transparent',
                              border: selectedEventId === ev.event_id ? '1px solid var(--primary)' : '1px solid transparent',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: '40px' }}>
                                {index === 0 ? 'Start' : `+${delaySec}s`}
                              </span>
                              <span style={{ fontSize: '0.8rem', fontWeight: '500', color: isFailed ? 'var(--error)' : 'var(--text-primary)' }}>
                                {ev.event_name}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {/* Provider delivery bubbles */}
                              {Object.entries(ev.provider_status || {}).map(([pId, status]) => (
                                <span
                                  key={pId}
                                  style={{
                                    fontSize: '8px',
                                    padding: '2px 4px',
                                    borderRadius: '3px',
                                    background: status === 'sent' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(229, 57, 53, 0.1)',
                                    color: status === 'sent' ? 'var(--success)' : 'var(--error)',
                                  }}
                                >
                                  {pId}
                                </span>
                              ))}
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {ev.duration ? `${ev.duration}ms` : '0ms'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Event Details panel */}
        {selectedEvent && (
          <div className={styles.card} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                🔬 Event Log Details
              </h3>
              <button
                className={styles.btn}
                style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                onClick={() => setSelectedEventId(null)}
              >
                Close
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.8rem' }}>
              <div>Event ID: <strong style={{ fontFamily: 'monospace' }}>{selectedEvent.event_id}</strong></div>
              <div>Event Name: <strong>{selectedEvent.event_name}</strong></div>
              <div>Correlation ID: <span style={{ fontFamily: 'monospace' }}>{selectedEvent.correlation_id || 'none'}</span></div>
              <div>Timestamp: <span style={{ color: 'var(--text-secondary)' }}>{new Date(selectedEvent.ts_client).toLocaleString()}</span></div>
              <div>Anonymous ID: <span style={{ fontFamily: 'monospace' }}>{selectedEvent.anonymous_id}</span></div>
              <div>User UID: <span>{selectedEvent.user_id || 'Guest'}</span></div>
            </div>

            {selectedEvent.in_dlq && (
              <div style={{ background: 'rgba(229, 57, 53, 0.08)', color: 'var(--error)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem' }}>
                <strong>Dead Letter Queue quarantined!</strong>
                {selectedEvent.validation_errors?.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    <strong>Validation errors:</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      {selectedEvent.validation_errors.map((e, idx) => <li key={idx}>{e}</li>)}
                    </ul>
                  </div>
                )}
                {Object.keys(selectedEvent.provider_errors || {}).length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    <strong>Provider errors:</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      {Object.entries(selectedEvent.provider_errors).map(([pId, err]) => (
                        <li key={pId}>{pId}: {err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>Properties</label>
              <pre style={{ background: 'rgba(0,0,0,0.1)', padding: '10px', borderRadius: '4px', overflowX: 'auto', margin: '4px 0 0 0', maxHeight: '180px', fontSize: '0.75rem' }}>
                {JSON.stringify(selectedEvent.properties, null, 2)}
              </pre>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>Context Envelope</label>
              <pre style={{ background: 'rgba(0,0,0,0.1)', padding: '10px', borderRadius: '4px', overflowX: 'auto', margin: '4px 0 0 0', maxHeight: '180px', fontSize: '0.75rem' }}>
                {JSON.stringify(selectedEvent.context, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
