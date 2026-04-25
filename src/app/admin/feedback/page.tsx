'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/useToast';

interface Feedback {
  id: string;
  email: string;
  message: string;
  phone?: string;
  created_at: string;
  is_read: boolean;
}

export default function AdminFeedback() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  
  const { toast, showToast } = useToast();
  const PAGE_SIZE = 20;

  useEffect(() => {
    fetchFeedback(0, true);
  }, []);

  async function fetchFeedback(pageIndex: number, reset = false) {
    if (!reset) setLoadingMore(true);
    const supabase = createClient();
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Notice we gracefully order by created_at assuming standard insertions
    const { data, error } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      if (error.code === 'PGRST204') {
        showToast('System Notice: Ensure "is_read" boolean column exists in Supabase feedback table.', 'error');
      } else {
        showToast('Failed to load feedback: ' + error.message, 'error');
      }
    } else if (data) {
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

  const toggleReadStatus = async (id: string, currentStatus: boolean) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('feedback')
      .update({ is_read: !currentStatus })
      .eq('id', id);

    if (!error) {
      setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, is_read: !currentStatus } : f));
    } else {
      showToast('Failed to update status', 'error');
    }
  };

  const deleteFeedback = async (id: string) => {
    if (!confirm('Permanently delete this feedback?')) return;
    
    const supabase = createClient();
    const { error } = await supabase
      .from('feedback')
      .delete()
      .eq('id', id);

    if (!error) {
      setFeedbacks(prev => prev.filter(f => f.id !== id));
      showToast('Feedback deleted', 'success');
    } else {
      showToast('Failed to delete feedback', 'error');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', 
      hour: '2-digit', minute: '2-digit'
    });
  };

  if (loading) {
    return <div className="animate-pulse text-muted" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>Loading Feedback...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Customer Feedback</h1>
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {feedbacks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
            No feedback entries found.
          </div>
        ) : (
          feedbacks.map(fb => {
             const isUnread = !fb.is_read;
             const isExpanded = expandedIds.has(fb.id);
             
             return (
               <div 
                 key={fb.id} 
                 className="card" 
                 style={{ 
                   opacity: isUnread ? 1 : 0.65,
                   borderLeft: isUnread ? '3px solid var(--text-primary)' : '1px solid var(--border-color)',
                   transition: 'opacity 0.2s',
                   padding: 'var(--space-4) var(--space-5)'
                 }}
               >
                 <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(300px, 2fr) auto', gap: 'var(--space-4)', alignItems: 'start' }}>
                   
                   {/* Col 1: Identity & Date */}
                   <div>
                     <p style={{ fontWeight: isUnread ? 600 : 400, fontSize: '0.9375rem', marginBottom: '4px', wordBreak: 'break-all' }}>
                       {fb.email}
                     </p>
                     {fb.phone && (
                       <p className="text-xs text-muted" style={{ marginBottom: '4px' }}>📞 {fb.phone}</p>
                     )}
                     <p className="text-xs text-muted">
                       {formatDate(fb.created_at)}
                     </p>
                   </div>

                   {/* Col 2: Message Content */}
                   <div>
                     <div 
                       style={{ 
                         fontSize: '0.875rem', 
                         lineHeight: 1.6,
                         color: isUnread ? 'var(--text-primary)' : 'var(--text-secondary)',
                         display: isExpanded ? 'block' : '-webkit-box',
                         WebkitLineClamp: isExpanded ? 'unset' : 2,
                         WebkitBoxOrient: 'vertical',
                         overflow: isExpanded ? 'visible' : 'hidden',
                         whiteSpace: 'pre-wrap'
                       }}
                     >
                       {fb.message}
                     </div>
                     {fb.message.length > 120 && (
                       <button 
                         onClick={() => toggleExpand(fb.id)}
                         className="text-xs text-muted"
                         style={{ marginTop: 'var(--space-2)', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                       >
                         {isExpanded ? 'Show Less' : 'Read More'}
                       </button>
                     )}
                   </div>

                   {/* Col 3: Actions */}
                   <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
                     <button 
                       onClick={() => toggleReadStatus(fb.id, fb.is_read)}
                       className="btn btn-ghost btn-sm"
                       style={{ fontSize: '0.75rem', minWidth: '100px' }}
                     >
                       {isUnread ? '✓ Mark Read' : 'Mark Unread'}
                     </button>
                     <button 
                       onClick={() => deleteFeedback(fb.id)}
                       className="text-xs"
                       style={{ color: '#ff4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                     >
                       Delete
                     </button>
                   </div>
                 </div>
               </div>
             );
          })
        )}
      </div>

      {hasMore && feedbacks.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
          <button 
            onClick={loadMore} 
            disabled={loadingMore}
            className={`btn btn-ghost ${loadingMore ? 'btn-loading' : ''}`}
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
