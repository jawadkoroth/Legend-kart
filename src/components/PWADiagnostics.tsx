'use client';

import { useState, useEffect } from 'react';
import { usePWA } from './PWAProvider';

interface DiagnosticsState {
  swRegistered: boolean;
  swScope: string | null;
  swActive: boolean;
  pushSupported: boolean;
  pushPermission: NotificationPermission | null;
  pushSubscribed: boolean;
  manifestPresent: boolean;
  manifestValid: boolean;
  isHttps: boolean;
}

export function PWADiagnostics() {
  const pwa = usePWA();
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>({
    swRegistered: false,
    swScope: null,
    swActive: false,
    pushSupported: false,
    pushPermission: null,
    pushSubscribed: false,
    manifestPresent: false,
    manifestValid: false,
    isHttps: false,
  });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const runDiagnostics = async () => {
      const results: DiagnosticsState = {
        swRegistered: false,
        swScope: null,
        swActive: false,
        pushSupported: false,
        pushPermission: null,
        pushSubscribed: false,
        manifestPresent: false,
        manifestValid: false,
        isHttps: window.location.protocol === 'https:',
      };

      // Check HTTPS
      results.isHttps = window.location.protocol === 'https:';

      // Check Service Worker
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration('/');
        results.swRegistered = !!reg;
        results.swScope = reg?.scope || null;
        results.swActive = reg?.active?.state === 'activated';
      }

      // Check Push Support
      results.pushSupported = 'PushManager' in window;
      if ('Notification' in window) {
        results.pushPermission = Notification.permission;
      }

      // Check Push Subscription
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration('/');
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          results.pushSubscribed = !!sub;
        }
      }

      // Check Manifest
      const manifestLink = document.querySelector('link[rel="manifest"]');
      results.manifestPresent = !!manifestLink;
      if (manifestLink) {
        try {
          const href = manifestLink.getAttribute('href');
          if (href) {
            const res = await fetch(href);
            const manifest = await res.json();
            results.manifestValid = !!(manifest.name && manifest.start_url && manifest.display);
          }
        } catch {
          results.manifestValid = false;
        }
      }

      setDiagnostics(results);
    };

    runDiagnostics();
  }, []);

  const StatusDot = ({ ok }: { ok: boolean }) => (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: ok ? 'var(--success)' : 'var(--error)',
        marginRight: 8,
      }}
    />
  );

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg-input)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: '0.05em',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
        }}
      >
        <span>{expanded ? '▼' : '▶'}</span>
        <span>PWA DIAGNOSTICS</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
          {diagnostics.swRegistered && diagnostics.manifestValid ? '✓ Ready' : '⚠ Issues'}
        </span>
      </button>

      {expanded && (
        <div
          style={{
            marginTop: 12,
            padding: 16,
            background: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.75rem',
          }}
        >
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <StatusDot ok={diagnostics.isHttps} />
              <span style={{ color: diagnostics.isHttps ? 'var(--success)' : 'var(--error)' }}>
                HTTPS: {diagnostics.isHttps ? 'Yes' : 'No (required for PWA)'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <StatusDot ok={diagnostics.manifestPresent} />
              <span>
                Manifest: {diagnostics.manifestPresent ? 'Present' : 'Missing'}
                {diagnostics.manifestPresent && (
                  <span style={{ color: diagnostics.manifestValid ? 'var(--success)' : 'var(--warning)', marginLeft: 8 }}>
                    {diagnostics.manifestValid ? '(Valid)' : '(Invalid)'}
                  </span>
                )}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <StatusDot ok={diagnostics.swRegistered} />
              <span>
                Service Worker: {diagnostics.swRegistered ? 'Registered' : 'Not registered'}
                {diagnostics.swRegistered && diagnostics.swScope && (
                  <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                    (Scope: {diagnostics.swScope})
                  </span>
                )}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <StatusDot ok={diagnostics.swActive} />
              <span>SW Active: {diagnostics.swActive ? 'Yes' : 'No'}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <StatusDot ok={diagnostics.pushSupported} />
              <span>
                Push API: {diagnostics.pushSupported ? 'Supported' : 'Not supported'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <StatusDot ok={diagnostics.pushPermission === 'granted'} />
              <span>
                Notification Permission: {diagnostics.pushPermission || 'Unknown'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <StatusDot ok={diagnostics.pushSubscribed} />
              <span>
                Push Subscribed: {diagnostics.pushSubscribed ? 'Yes' : 'No'}
              </span>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', marginTop: 8, paddingTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <StatusDot ok={pwa.canInstall} />
                <span>
                  Installable: {pwa.canInstall ? 'Yes' : 'No'}
                  {pwa.canInstall && !pwa.isStandalone && (
                    <span style={{ color: 'var(--success)', marginLeft: 8 }}>
                      (Ready to install)
                    </span>
                  )}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center' }}>
                <StatusDot ok={pwa.isStandalone} />
                <span>
                  Standalone Mode: {pwa.isStandalone ? 'Yes (Installed)' : 'No (Browser)'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
