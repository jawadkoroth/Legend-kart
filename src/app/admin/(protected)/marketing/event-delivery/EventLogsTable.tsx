'use client';

import React, { useState } from 'react';

interface MarketingEventLog {
  id: string;
  event_name: string;
  provider_status: Record<string, any> | null;
  provider_errors: Record<string, any> | null;
  duration: number | null;
  payload: any;
  correlation_id: string | null;
  created_at: string;
  anonymous_id: string;
  session_id: string;
  user_id: string | null;
}

export default function EventLogsTable({ logs }: { logs: MarketingEventLog[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleRow = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.7rem' }}>
          <th style={{ padding: '12px 16px' }}>Status</th>
          <th style={{ padding: '12px 16px' }}>Event Name</th>
          <th style={{ padding: '12px 16px' }}>Customer / Session</th>
          <th style={{ padding: '12px 16px' }}>Correlation ID</th>
          <th style={{ padding: '12px 16px' }}>Providers</th>
          <th style={{ padding: '12px 16px' }}>Latency</th>
          <th style={{ padding: '12px 16px' }}>Timestamp</th>
        </tr>
      </thead>
      <tbody>
        {logs.map((log) => {
          const isExpanded = expandedId === log.id;
          const hasErrors = log.provider_errors && Object.keys(log.provider_errors).length > 0;
          
          // Map provider outcomes
          const metaStatus = log.provider_status?.meta || (hasErrors ? 'failed' : 'success');
          const googleStatus = log.provider_status?.google || (hasErrors ? 'failed' : 'success');

          return (
            <React.Fragment key={log.id}>
              <tr
                onClick={() => toggleRow(log.id)}
                style={{
                  borderBottom: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  background: isExpanded ? 'rgba(255, 255, 255, 0.01)' : 'transparent',
                  transition: 'background var(--duration-fast)',
                }}
                className="hover-row"
              >
                {/* Status Indicator */}
                <td style={{ padding: '12px 16px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: hasErrors ? 'var(--error)' : 'var(--success)',
                      boxShadow: hasErrors ? '0 0 8px var(--error)' : '0 0 8px var(--success)',
                    }}
                  />
                </td>

                {/* Event Name */}
                <td style={{ padding: '12px 16px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  {log.event_name}
                </td>

                {/* Customer/Session */}
                <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                  <span title={log.anonymous_id}>
                    {log.user_id ? `User: ${log.user_id.slice(0, 8)}` : `Sess: ${log.session_id.slice(0, 8)}`}
                  </span>
                </td>

                {/* Correlation ID */}
                <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                  {log.correlation_id ? log.correlation_id.slice(0, 13) : 'none'}
                </td>

                {/* Targeted Providers */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <span
                      style={{
                        padding: '2px 4px',
                        fontSize: '9px',
                        borderRadius: '3px',
                        background: metaStatus === 'success' ? 'rgba(76,175,80,0.1)' : 'rgba(244,67,54,0.1)',
                        color: metaStatus === 'success' ? 'var(--success)' : 'var(--error)',
                      }}
                    >
                      Meta
                    </span>
                    <span
                      style={{
                        padding: '2px 4px',
                        fontSize: '9px',
                        borderRadius: '3px',
                        background: googleStatus === 'success' ? 'rgba(76,175,80,0.1)' : 'rgba(244,67,54,0.1)',
                        color: googleStatus === 'success' ? 'var(--success)' : 'var(--error)',
                      }}
                    >
                      Google
                    </span>
                  </div>
                </td>

                {/* Latency */}
                <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                  {log.duration ? `${log.duration}ms` : 'n/a'}
                </td>

                {/* Created At */}
                <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                  {new Date(log.created_at).toLocaleTimeString()}
                </td>
              </tr>

              {/* Collapsible details panel */}
              {isExpanded && (
                <tr style={{ background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid var(--border-color)' }}>
                  <td colSpan={7} style={{ padding: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      
                      {/* JSON Payload input */}
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontWeight: 'bold', marginBottom: '6px', fontSize: '0.75rem' }}>
                          📤 Outgoing Event Data Payload
                        </div>
                        <pre style={{ margin: 0, padding: '10px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', overflow: 'auto', maxHeight: '200px', fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      </div>

                      {/* Provider response codes/errors */}
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontWeight: 'bold', marginBottom: '6px', fontSize: '0.75rem' }}>
                          📥 API Target Return Codes & Trace
                        </div>
                        <pre style={{ margin: 0, padding: '10px', background: '#0a0a0a', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', overflow: 'auto', maxHeight: '200px', fontSize: '0.7rem', color: hasErrors ? 'var(--error)' : 'var(--success)', fontFamily: 'monospace' }}>
                          {JSON.stringify({
                            statuses: log.provider_status || { meta: 'success', google: 'success' },
                            errors: log.provider_errors || {},
                            client_anonymous_id: log.anonymous_id,
                            client_session_id: log.session_id,
                          }, null, 2)}
                        </pre>
                      </div>

                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
