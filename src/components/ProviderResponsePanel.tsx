'use client';

import React, { useState } from 'react';
import type { ParsedProviderError } from '@/lib/shipping/types';

interface ProviderResponsePanelProps {
  provider: string | null;
  status: string;
  parsedError?: ParsedProviderError | null;
  latencyMs?: number | null;
  lastErrorAt?: string | null;
  rawResponse?: unknown;
}

const SEVERITY_COLORS: Record<string, { bg: string; border: string; text: string; glow?: string }> = {
  critical: {
    bg: 'rgba(229,57,53,0.08)',
    border: 'rgba(229,57,53,0.4)',
    text: '#e53935',
    glow: '0 0 20px rgba(229,57,53,0.15)',
  },
  high: {
    bg: 'rgba(229,57,53,0.05)',
    border: 'rgba(229,57,53,0.25)',
    text: '#e53935',
  },
  medium: {
    bg: 'rgba(240,173,78,0.08)',
    border: 'rgba(240,173,78,0.3)',
    text: '#f0ad4e',
  },
  low: {
    bg: 'rgba(76,175,80,0.05)',
    border: 'rgba(76,175,80,0.2)',
    text: '#4caf50',
  },
  info: {
    bg: 'var(--bg-input)',
    border: 'var(--border-color)',
    text: 'var(--text-muted)',
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  auth_failure: 'Authentication',
  invalid_pickup: 'Pickup Location',
  pickup_not_registered: 'Pickup Not Registered',
  invalid_payload: 'Invalid Data',
  phone_missing: 'Phone Missing',
  address_invalid: 'Address Invalid',
  weight_missing: 'Weight Missing',
  cod_not_available: 'COD Not Available',
  network_error: 'Network Error',
  rate_limit: 'Rate Limited',
  service_unavailable: 'Service Unavailable',
  timeout: 'Timeout',
  unknown: 'Unknown',
};

export function ProviderResponsePanel(props: ProviderResponsePanelProps) {
  const { provider, status, latencyMs, lastErrorAt, rawResponse, parsedError: errorProp } = props;
  const parsedError = errorProp as ParsedProviderError | undefined;
  const [showRaw, setShowRaw] = useState(false);

  // Don't show if no error data and status isn't failed
  if (status !== 'failed' && !parsedError) return null;

  const severity = parsedError?.severity ?? 'info';
  const colors = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.info;
  const retrySafe = parsedError?.retry_safe ?? false;
  const errorMessage: string | undefined = parsedError?.message;
  const errorMeaning: string | undefined = parsedError?.meaning;
  const errorSuggestedFix: string | undefined = parsedError?.suggested_fix;
  const errorCategory: string | undefined = parsedError?.operational_category;
  const errorStatusCode: number | undefined = parsedError?.status_code;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatTimestamp = (iso: string | null | undefined) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div
      style={{
        marginTop: 16,
        padding: '16px 18px',
        background: colors.bg,
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${colors.border}`,
        boxShadow: colors.glow ?? 'none',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: colors.text,
              boxShadow: `0 0 0 3px ${colors.border}`,
            }}
          />
          <span
            style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: colors.text,
            }}
          >
            Last Provider Response
          </span>
          {retrySafe && (
            <span
              style={{
                fontSize: '0.5625rem',
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: '#4caf50',
                padding: '2px 8px',
                background: 'rgba(76,175,80,0.12)',
                borderRadius: 3,
                border: '1px solid rgba(76,175,80,0.2)',
              }}
            >
              Retry Safe
            </span>
          )}
        </div>
        <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>
          {provider?.toUpperCase() ?? 'Provider'}
        </span>
      </div>

      {/* Operational Category Badge */}
      {errorCategory != null ? (
        <div
          style={{
            display: 'inline-block',
            fontSize: '0.5625rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            padding: '4px 10px',
            background: 'var(--bg-tertiary)',
            borderRadius: 3,
            border: '1px solid var(--border-color)',
            marginBottom: 12,
          }}
        >
          {CATEGORY_LABELS[errorCategory] ?? errorCategory}
        </div>
      ) : null}

      {/* Metrics Row */}
      <div
        style={{
          display: 'flex',
          gap: 20,
          marginBottom: 14,
          fontSize: '0.625rem',
          color: 'var(--text-muted)',
        }}
      >
        {parsedError?.status_code !== undefined && parsedError.status_code > 0 && (
          <span>
            Status:{' '}
            <span style={{ color: colors.text, fontWeight: 600 }}>
              {parsedError.status_code}
            </span>
          </span>
        )}
        {latencyMs !== undefined && latencyMs !== null && (
          <span>
            Latency:{' '}
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
              {latencyMs}ms
            </span>
          </span>
        )}
        {lastErrorAt && (
          <span>
            Time:{' '}
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
              {formatTimestamp(lastErrorAt)}
            </span>
          </span>
        )}
      </div>

      {/* Error Message */}
      {errorMessage != null ? (
        <div
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: colors.text,
            marginBottom: 10,
            lineHeight: 1.4,
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      {/* Meaning */}
      {errorMeaning != null ? (
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            marginBottom: 14,
            lineHeight: 1.5,
          }}
        >
          {errorMeaning}
        </div>
      ) : null}

      {/* Suggested Fix — Operational Gold */}
      {errorSuggestedFix != null ? (
        <div
          style={{
            padding: '12px 14px',
            background: 'var(--bg-secondary)',
            borderRadius: 6,
            borderLeft: `3px solid ${colors.text}`,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: '0.5625rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 6,
            }}
          >
            Suggested Fix
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-primary)',
              lineHeight: 1.5,
            }}
          >
            {errorSuggestedFix}
          </div>
        </div>
      ) : null}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {parsedError != null ? (
          <button
            onClick={() =>
              copyToClipboard(JSON.stringify(parsedError, null, 2))
            }
            style={{
              fontSize: '0.625rem',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              padding: '6px 12px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-tertiary)';
            }}
          >
            Copy Error
          </button>
        ) : null}
        {rawResponse !== undefined && rawResponse !== null ? (
          <button
            onClick={() => setShowRaw(!showRaw)}
            style={{
              fontSize: '0.625rem',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              padding: '6px 12px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-tertiary)';
            }}
          >
            {showRaw ? 'Hide Raw' : 'View Raw'}
          </button>
        ) : null}
      </div>

      {/* Raw JSON */}
      {showRaw && rawResponse ? (
        <div style={{ marginTop: 12 }}>
          <pre
            style={{
              fontSize: '0.6875rem',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              color: 'var(--text-secondary)',
              background: 'var(--bg-tertiary)',
              padding: 12,
              borderRadius: 6,
              border: '1px solid var(--border-color)',
              overflow: 'auto',
              maxHeight: 300,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {JSON.stringify(rawResponse, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
