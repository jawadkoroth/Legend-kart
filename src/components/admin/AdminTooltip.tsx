'use client';

import React, { useState } from 'react';

interface AdminTooltipProps {
  content: string;
  children: React.ReactNode;
}

export default function AdminTooltip({ content, children }: AdminTooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span 
      style={{ 
        position: 'relative', 
        display: 'inline-flex', 
        alignItems: 'center', 
        cursor: 'help' 
      }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span 
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%) translateY(-8px)',
            background: '#151515',
            color: '#FFFFFF',
            fontSize: '0.7rem',
            padding: '6px 10px',
            borderRadius: '4px',
            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            whiteSpace: 'normal',
            width: '200px',
            zIndex: 99999,
            textAlign: 'center',
            lineHeight: '1.3',
            pointerEvents: 'none',
            fontWeight: 'normal'
          }}
        >
          {content}
          <span 
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              borderWidth: '5px',
              borderStyle: 'solid',
              borderColor: '#151515 transparent transparent transparent',
              zIndex: 99999
            }}
          />
        </span>
      )}
    </span>
  );
}

export function InfoTooltip({ content }: { content: string }) {
  return (
    <AdminTooltip content={content}>
      <span 
        style={{ 
          fontSize: '0.75rem', 
          opacity: 0.6, 
          marginLeft: '4px', 
          color: 'var(--accent-gold, #C9A86A)',
          cursor: 'help',
          display: 'inline-block'
        }}
      >
        ⓘ
      </span>
    </AdminTooltip>
  );
}
