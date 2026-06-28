'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Bell,
  CheckCircle,
  X,
  Search,
  ShoppingCart,
  RefreshCw,
  Zap,
  TriangleAlert,
  AlertOctagon,
  MessageSquare,
  FileText,
  Clock,
  ArrowRight
} from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  priority: 'critical' | 'warning' | 'info' | 'low';
  metadata: {
    orderId?: string;
    [key: string]: any;
  };
  created_at: string;
}

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onUnreadCountChange: (count: number) => void;
}

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All Alerts', icon: Bell },
  { id: 'order', label: 'Orders', icon: ShoppingCart },
  { id: 'return_exchange', label: 'Returns & Exchanges', icon: RefreshCw },
  { id: 'failure', label: 'Failures', icon: AlertOctagon },
  { id: 'system_alert', label: 'System', icon: TriangleAlert },
  { id: 'feedback', label: 'Feedback', icon: MessageSquare }
];

export default function AdminNotificationCenter({
  isOpen,
  onClose,
  onUnreadCountChange
}: NotificationCenterProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);

  // Fetch initial notifications
  const fetchNotifications = async () => {
    try {
      const url = new URL('/api/admin/notifications', window.location.origin);
      url.searchParams.set('limit', '100');
      const res = await fetch(url.toString());
      const json = await res.json();
      if (json.success) {
        setNotifications(json.data.notifications);
        const unread = json.data.notifications.filter((n: Notification) => !n.is_read).length;
        onUnreadCountChange(unread);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  // Realtime subscription setup
  useEffect(() => {
    const supabase = createClient();
    
    const channel = supabase
      .channel('admin-notifications-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_notifications' },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev]);
          playChime(newNotif.priority);
          // Refetch unread counts
          setTimeout(() => {
            setNotifications(prev => {
              const unread = prev.filter(n => !n.is_read).length;
              onUnreadCountChange(unread);
              return prev;
            });
          }, 100);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'admin_notifications' },
        (payload) => {
          const updatedNotif = payload.new as Notification;
          setNotifications((prev) =>
            prev.map((n) => (n.id === updatedNotif.id ? updatedNotif : n))
          );
          setTimeout(() => {
            setNotifications(prev => {
              const unread = prev.filter(n => !n.is_read).length;
              onUnreadCountChange(unread);
              return prev;
            });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onUnreadCountChange]);

  const playChime = (priority: string) => {
    try {
      if (!audioContextRef.current) {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (Ctx) audioContextRef.current = new Ctx();
      }
      const ctx = audioContextRef.current;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      if (priority === 'critical') {
        osc.frequency.setValueAtTime(330, ctx.currentTime); // Low warning E4
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } else {
        osc.frequency.setValueAtTime(880, ctx.currentTime); // High pleasant A5
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch {}
  };

  const handleMarkAsRead = async (id: string) => {
    // Optimistic UI update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    const nextUnread = notifications.filter(n => n.id !== id ? !n.is_read : false).length;
    onUnreadCountChange(nextUnread);

    try {
      await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] })
      });
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    // Optimistic UI
    setNotifications((prev) =>
      prev.map((n) => {
        if (activeCategory === 'all') {
          return { ...n, is_read: true };
        }
        const matchesCategory =
          activeCategory === 'return_exchange'
            ? n.type === 'return' || n.type === 'exchange'
            : activeCategory === 'failure'
            ? n.type === 'workflow_failure' || n.type === 'marketing_failure'
            : n.type === activeCategory;
        
        return matchesCategory ? { ...n, is_read: true } : n;
      })
    );
    onUnreadCountChange(0);

    try {
      const typeParam = activeCategory === 'all' ? undefined : activeCategory;
      await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, type: typeParam })
      });
    } catch (err) {
      console.error('Failed to mark all read:', err);
    } finally {
      setMarkingAll(false);
      fetchNotifications();
    }
  };

  const handleRowClick = (n: Notification) => {
    handleMarkAsRead(n.id);
    if (n.metadata?.orderId) {
      router.push(`/admin/orders/${n.metadata.orderId}`);
      onClose();
    } else if (n.type === 'workflow_failure') {
      router.push('/admin/automation/executions');
      onClose();
    } else if (n.type === 'feedback') {
      onClose();
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return '#EF4444'; // Red
      case 'warning':
        return '#F59E0B'; // Orange
      case 'info':
        return '#D4AF37'; // Gold
      default:
        return '#8A8A8A'; // Grey
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'order':
        return <ShoppingCart size={16} />;
      case 'return':
      case 'exchange':
        return <RefreshCw size={16} />;
      case 'workflow_failure':
      case 'marketing_failure':
        return <AlertOctagon size={16} />;
      case 'shipping_issue':
      case 'low_stock':
        return <TriangleAlert size={16} />;
      case 'feedback':
        return <MessageSquare size={16} />;
      case 'note':
        return <FileText size={16} />;
      default:
        return <Bell size={16} />;
    }
  };

  // Filter logic in memory
  const filteredNotifications = notifications.filter((n) => {
    const matchesCategory =
      activeCategory === 'all' ||
      (activeCategory === 'return_exchange' && (n.type === 'return' || n.type === 'exchange')) ||
      (activeCategory === 'failure' && (n.type === 'workflow_failure' || n.type === 'marketing_failure')) ||
      n.type === activeCategory;

    const matchesSearch =
      !searchQuery ||
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.body.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRead = !unreadOnly || !n.is_read;

    return matchesCategory && matchesSearch && matchesRead;
  });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(11, 11, 11, 0.4)',
          backdropFilter: 'blur(4px)',
          zIndex: 290,
          animation: 'fadeIn 0.2s ease-out'
        }}
      />

      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: '520px',
          backgroundColor: 'var(--bg-secondary)',
          borderLeft: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 300,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideIn 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        }}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Bell size={20} style={{ color: 'var(--accent-gold)' }} />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Notification Center</h2>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '6px',
              borderRadius: '50%',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer'
            }}
            aria-label="Close notifications panel"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filters and Search Area */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', borderBottom: '1px solid var(--border-color)' }}>
          {/* Search bar */}
          <div className="admin-search-input-wrapper" style={{ width: '100%', position: 'relative' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)'
              }}
            />
            <input
              type="text"
              placeholder="Search notifications..."
              className="admin-search-input"
              style={{ paddingLeft: '36px', height: '38px' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Unread Only Toggle & Mark all as read */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Show Unread Only
            </label>
            
            <button
              onClick={handleMarkAllRead}
              disabled={markingAll || filteredNotifications.length === 0}
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: filteredNotifications.length === 0 ? 'var(--text-muted)' : 'var(--accent-gold)',
                cursor: filteredNotifications.length === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <CheckCircle size={12} />
              Mark Filtered as Read
            </button>
          </div>

          {/* Category tabs */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              paddingBottom: '4px',
              margin: '0 -4px'
            }}
          >
            {CATEGORY_FILTERS.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    background: isActive ? 'rgba(201,168,106,0.1)' : 'var(--bg-tertiary)',
                    border: '1px solid',
                    borderColor: isActive ? 'var(--accent-gold)' : 'var(--border-color)',
                    color: isActive ? 'var(--accent-gold)' : 'var(--text-secondary)'
                  }}
                >
                  <Icon size={12} />
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notifications Scrollable List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px 20px' }}>
              <div className="skeleton" style={{ height: '70px', borderRadius: '8px' }} />
              <div className="skeleton" style={{ height: '70px', borderRadius: '8px' }} />
              <div className="skeleton" style={{ height: '70px', borderRadius: '8px' }} />
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="admin-empty-state">
              <Bell size={36} style={{ color: 'var(--text-muted)' }} />
              <div className="admin-empty-title">All caught up!</div>
              <div className="admin-empty-desc">No notifications found matching the active filters.</div>
            </div>
          ) : (
            filteredNotifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleRowClick(notif)}
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  display: 'flex',
                  gap: '14px',
                  background: notif.is_read ? 'transparent' : 'rgba(201,168,106,0.02)',
                  borderLeft: notif.is_read ? '3px solid transparent' : `3px solid ${getPriorityColor(notif.priority)}`,
                  transition: 'background-color 0.15s'
                }}
                className="admin-table-row"
              >
                {/* Icon Column */}
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'var(--bg-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: getPriorityColor(notif.priority),
                    flexShrink: 0
                  }}
                >
                  {getNotificationIcon(notif.type)}
                </div>

                {/* Content Column */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
                    <h4
                      style={{
                        margin: 0,
                        fontSize: '0.85rem',
                        fontWeight: notif.is_read ? 600 : 700,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {notif.title}
                    </h4>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                      <Clock size={10} />
                      {formatDate(notif.created_at)}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: '4px 0 0 0',
                      fontSize: '0.8rem',
                      color: notif.is_read ? 'var(--text-muted)' : 'var(--text-secondary)',
                      lineHeight: '1.4',
                      wordBreak: 'break-word'
                    }}
                  >
                    {notif.body}
                  </p>
                  
                  {notif.metadata?.orderId && (
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--accent-gold)', fontWeight: 600 }}>
                      Inspect Order <ArrowRight size={10} />
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
