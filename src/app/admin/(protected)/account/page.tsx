'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

export default function AccountPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [role, setRole] = useState('Admin');
  const [notificationStatus, setNotificationStatus] = useState('Checking...');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    
    // Fetch user role from database
    if (user) {
      supabase
        .from('admin_users')
        .select('role')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.role) {
            setRole(data.role.charAt(0).toUpperCase() + data.role.slice(1));
          }
        }, () => { /* ignore errors */ });
    }

    // Check Capacitor native notification permissions
    const checkPermissions = async () => {
      if (!Capacitor.isNativePlatform()) {
        setNotificationStatus('Not Native Platform (Web)');
        return;
      }
      try {
        const status = await PushNotifications.checkPermissions();
        if (status.receive === 'granted') {
          setNotificationStatus('Granted 🔔');
        } else if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
          setNotificationStatus('Not Requested yet');
        } else {
          setNotificationStatus('Denied 🔕 (Go to Settings)');
        }
      } catch (err) {
        setNotificationStatus('Unavailable');
      }
    };

    checkPermissions();
  }, [user]);

  const handleLogout = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.refresh();
      router.replace('/admin');
    } catch (err) {
      console.error('Logout failed:', err);
      setLoading(false);
    }
  };

  const adminName = user?.email ? user.email.split('@')[0].toUpperCase() : 'PANTHER ADMIN';

  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      padding: '24px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      minHeight: 'calc(100vh - 140px)',
      color: '#FFF'
    }}>
      {/* Page Title */}
      <div>
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 700,
          letterSpacing: '0.05em',
          color: 'var(--gold, #D4AF37)',
          margin: 0,
          fontFamily: 'var(--font-serif, serif)'
        }}>
          Account Profile
        </h1>
        <p style={{
          fontSize: '0.85rem',
          color: '#8A8A8A',
          marginTop: '4px',
          margin: 0
        }}>
          Operational Administrator Identity & Settings
        </p>
      </div>

      {/* Admin Profile Card */}
      <div style={{
        background: 'rgba(18, 18, 18, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(212, 175, 55, 0.15)',
        borderRadius: '16px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        textAlign: 'center'
      }}>
        {/* Avatar Placeholder */}
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.3) 0%, rgba(20, 20, 20, 0.8) 100%)',
          border: '2px solid var(--gold, #D4AF37)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem',
          boxShadow: '0 0 20px rgba(212, 175, 55, 0.2)'
        }}>
          👤
        </div>

        <div>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: 600,
            margin: 0,
            letterSpacing: '0.05em'
          }}>
            {adminName}
          </h2>
          <span style={{
            display: 'inline-block',
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            background: 'rgba(212, 175, 55, 0.15)',
            color: 'var(--gold, #D4AF37)',
            padding: '4px 10px',
            borderRadius: '12px',
            marginTop: '8px',
            border: '1px solid rgba(212, 175, 55, 0.3)'
          }}>
            {role}
          </span>
        </div>
      </div>

      {/* Identity & Build Metadata Details */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <div style={{
          background: 'rgba(15, 15, 15, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            paddingBottom: '10px'
          }}>
            <span style={{ color: '#8A8A8A', fontSize: '0.85rem' }}>Email Address</span>
            <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{user?.email || 'N/A'}</span>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            paddingBottom: '10px'
          }}>
            <span style={{ color: '#8A8A8A', fontSize: '0.85rem' }}>Notification Permissions</span>
            <span style={{
              fontWeight: 600,
              fontSize: '0.85rem',
              color: notificationStatus.includes('Granted') ? '#4CAF50' : '#FF9800'
            }}>{notificationStatus}</span>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ color: '#8A8A8A', fontSize: '0.85rem' }}>Application Version</span>
            <span style={{ fontWeight: 500, fontSize: '0.85rem', color: '#AAA' }}>1.0.0 (Capacitor Android)</span>
          </div>
        </div>
      </div>

      {/* Settings Redirect Notice */}
      {Capacitor.isNativePlatform() && (
        <div style={{
          background: 'rgba(212, 175, 55, 0.05)',
          border: '1px solid rgba(212, 175, 55, 0.15)',
          borderRadius: '12px',
          padding: '16px',
          fontSize: '0.8rem',
          color: '#AAA',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <span style={{ fontWeight: 600, color: 'var(--gold, #D4AF37)' }}>🔔 OS Level Settings Only</span>
          <span>Panther Admin uses your device settings for alerts and sounds. Tap the button below if you need to adjust push preferences or grant system-level notification access.</span>
          <button
            onClick={async () => {
              try {
                const { NativeSettings, AndroidSettings, IOSSettings } = await import('capacitor-native-settings');
                await NativeSettings.open({
                  optionAndroid: AndroidSettings.ApplicationDetails,
                  optionIOS: IOSSettings.App,
                });
              } catch (err) {
                console.error('Failed to open app settings details:', err);
              }
            }}
            style={{
              alignSelf: 'flex-start',
              background: 'none',
              border: '1px solid rgba(212, 175, 55, 0.3)',
              color: 'var(--gold, #D4AF37)',
              fontSize: '0.75rem',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              marginTop: '4px',
              fontWeight: 600,
              transition: 'background 200ms ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212, 175, 55, 0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            Manage Notifications in Android OS
          </button>
        </div>
      )}

      {/* Logout Action */}
      <button
        onClick={handleLogout}
        disabled={loading}
        style={{
          background: 'rgba(244, 67, 54, 0.12)',
          border: '1px solid rgba(244, 67, 54, 0.4)',
          color: '#FF7675',
          fontSize: '0.9rem',
          fontWeight: 600,
          letterSpacing: '0.05em',
          padding: '14px',
          borderRadius: '12px',
          cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          boxShadow: '0 4px 15px rgba(244, 67, 54, 0.1)',
          transition: 'all 200ms ease',
          marginTop: 'auto'
        }}
        onMouseEnter={(e) => {
          if (!loading) {
            e.currentTarget.style.background = 'rgba(244, 67, 54, 0.2)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(244, 67, 54, 0.2)';
          }
        }}
        onMouseLeave={(e) => {
          if (!loading) {
            e.currentTarget.style.background = 'rgba(244, 67, 54, 0.12)';
            e.currentTarget.style.boxShadow = '0 4px 15px rgba(244, 67, 54, 0.1)';
          }
        }}
      >
        {loading ? 'LOGGING OUT...' : 'LOG OUT OF PANTHER'}
      </button>
    </div>
  );
}
