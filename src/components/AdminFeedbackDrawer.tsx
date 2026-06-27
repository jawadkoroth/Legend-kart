'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Feedback {
  id: string;
  email: string;
  message: string;
  phone?: string;
  created_at: string;
  is_read: boolean;
}

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Called with a signed delta to apply to the unread badge.
   * `-1` when a message has been successfully marked read,
   * `+1` when a previously-applied optimistic mark must be reverted.
   */
  onUnreadDelta: (delta: -1 | 1) => void;
}

export default function AdminFeedbackDrawer({ isOpen, onClose, onUnreadDelta }: DrawerProps) {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // Tracks ids whose mark-as-read request is in flight, so a fast
  // double-click on the same item never produces two UPDATEs.
  const pendingReadIds = useRef<Set<string>>(new Set());

  const PAGE_SIZE = 20;

  // Handle Resize for Mobile Sliding Overlay
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch when opened
  useEffect(() => {
    if (isOpen) fetchFeedback(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  async function fetchFeedback(pageIndex: number, reset = false) {
    if (!reset) setLoadingMore(true);
    const supabase = createClient();
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('feedback')
      .select('*')
      .order('is_read', { ascending: true }) // Unread floats to top
      .order('created_at', { ascending: false })
      .range(from, to);

    if (!error && data) {
      setFeedbacks(prev => reset ? data : [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoading(false);
    setLoadingMore(false);
  }

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchFeedback(next);
  };

  const handleSelect = async (id: string) => {
    setSelectedId(id);

    const fb = feedbacks.find(f => f.id === id);
    if (!fb || fb.is_read) return;
    if (pendingReadIds.current.has(id)) return;
    pendingReadIds.current.add(id);

    // 1. Optimistic UI: flip the row to read immediately and re-sort
    //    in place so it slides under the unread bucket without needing
    //    a refetch.
    setFeedbacks(prev =>
      prev
        .map(f => (f.id === id ? { ...f, is_read: true } : f))
        .sort((a, b) => {
          if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }),
    );
    onUnreadDelta(-1);

    // 2. Persist. On failure, revert state and badge, surface a toast.
    const supabase = createClient();
    const { error } = await supabase
      .from('feedback')
      .update({ is_read: true })
      .eq('id', id);

    pendingReadIds.current.delete(id);

    if (error) {
      setFeedbacks(prev => prev.map(f => (f.id === id ? { ...f, is_read: false } : f)));
      onUnreadDelta(1);
      setErrorToast('Could not mark message as read. Try again.');
      // Auto-dismiss the inline error after a few seconds.
      setTimeout(() => setErrorToast(null), 4000);
    }
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const selectedFeedback = feedbacks.find(f => f.id === selectedId);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(11, 11, 11, 0.4)',
            backdropFilter: 'blur(4px)',
            zIndex: 290,
            transition: 'opacity 0.3s'
          }}
        />
      )}

      {/* Drawer Panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '100%', maxWidth: '900px',
          backgroundColor: 'var(--bg-primary)',
          borderLeft: '1px solid var(--border-color)',
          zIndex: 300,
          boxShadow: '-8px 0 30px rgba(0,0,0,0.5)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
          display: 'flex', flexDirection: 'column'
        }}
      >
        {/* Drawer Header */}
        <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Support Inbox</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
        </div>

        {errorToast && (
          <div
            role="alert"
            style={{
              padding: 'var(--space-2) var(--space-5)',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: 'var(--error)',
              borderBottom: '1px solid var(--border-color)',
              fontSize: '0.8125rem',
            }}
          >
            {errorToast}
          </div>
        )}

        {/* Content Region */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

          {/* LEFT: Inbox List */}
          <div
            style={{
              width: isMobile ? '100%' : '350px',
              borderRight: isMobile ? 'none' : '1px solid var(--border-color)',
              overflowY: 'auto',
              display: 'flex', flexDirection: 'column'
            }}
          >
            {loading ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>Loading Inbox...</div>
            ) : feedbacks.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>Inbox is empty.</div>
            ) : (
              feedbacks.map(fb => {
                const isSelected = selectedId === fb.id;
                return (
                  <div
                    key={fb.id}
                    onClick={() => handleSelect(fb.id)}
                    style={{
                      padding: 'var(--space-4)',
                      borderBottom: '1px solid var(--border-light)',
                      backgroundColor: isSelected && !isMobile ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: !fb.is_read ? 600 : 400, color: !fb.is_read ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {fb.email}
                      </span>
                      {!fb.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--text-primary)', marginTop: 6 }} />}
                    </div>
                    <p
                      style={{
                        fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '8px',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                      }}
                    >
                      {fb.message}
                    </p>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{formatDate(fb.created_at)}</span>
                  </div>
                );
              })
            )}

            {hasMore && feedbacks.length > 0 && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="btn btn-ghost"
                style={{ margin: 'var(--space-4)', fontSize: '0.75rem' }}
              >
                {loadingMore ? 'Loading...' : 'Load Older Messages'}
              </button>
            )}
          </div>

          {/* RIGHT: Detailed Context */}
          <div
            style={{
              flex: 1,
              backgroundColor: 'var(--bg-secondary)',
              display: 'flex', flexDirection: 'column',
              position: isMobile ? 'absolute' : 'relative',
              inset: 0,
              transform: isMobile && !selectedId ? 'translateX(100%)' : 'translateX(0)',
              transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)'
            }}
          >
            {selectedFeedback ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Right Header */}
                <div style={{ padding: 'var(--space-3) var(--space-5)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center' }}>
                  {isMobile && (
                    <button
                      onClick={() => setSelectedId(null)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-primary)', marginRight: 'var(--space-4)', fontSize: '1.25rem', cursor: 'pointer' }}
                    >
                      ←
                    </button>
                  )}
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{selectedFeedback.email}</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDate(selectedFeedback.created_at)}</p>
                  </div>
                </div>

                {/* Right Body */}
                <div style={{ padding: 'var(--space-6) var(--space-5)', flex: 1, overflowY: 'auto' }}>
                  {selectedFeedback.phone && (
                    <p style={{ fontSize: '0.875rem', marginBottom: 'var(--space-6)', padding: 'var(--space-3)', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                      <strong>Phone Contact:</strong> <br /> {selectedFeedback.phone}
                    </p>
                  )}
                  <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                    {selectedFeedback.message}
                  </p>
                </div>

                {/* Right Footer (Future Reply Action) */}
                <div style={{ padding: 'var(--space-4) var(--space-5)', borderTop: '1px solid var(--border-color)' }}>
                  <button className="btn btn-primary" style={{ width: '100%' }}>
                    Reply via Email (Integration Pending)
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                Select a message to view the full context
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
