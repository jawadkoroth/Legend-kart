'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AdminTable, { type AdminTableColumn } from './AdminTable';

interface CustomerRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  scores: {
    ltv_paise: number;
    total_orders: number;
    engagement_score: number;
    last_active: string | null;
    preferred_device: string | null;
  } | null;
  segments: Array<{ segment_name: string }>;
}

export default function CustomerTableClient({
  customers,
  total,
  limit,
  offset
}: {
  customers: CustomerRow[];
  total: number;
  limit: number;
  offset: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handlePageChange = (newOffset: number) => {
    const pageNum = Math.floor(newOffset / limit) + 1;
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(pageNum));
    router.push(`/admin/customers?${params.toString()}`);
  };

  const columns: AdminTableColumn<CustomerRow>[] = [
    {
      key: 'name',
      label: 'Customer',
      sortable: true,
      width: 220,
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{row.name || 'Anonymous Guest'}</strong>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.email || 'No email'}</span>
          {row.phone && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.phone}</span>}
        </div>
      )
    },
    {
      key: 'segments',
      label: 'Segments',
      sortable: false,
      width: 150,
      render: (row) => (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {row.segments && row.segments.length > 0 ? (
            row.segments.map((s) => (
              <span
                key={s.segment_name}
                style={{
                  background: s.segment_name === 'VIP' ? 'rgba(201,168,106,0.1)' : 'var(--bg-tertiary)',
                  color: s.segment_name === 'VIP' ? 'var(--accent-gold)' : 'var(--text-secondary)',
                  borderColor: s.segment_name === 'VIP' ? 'var(--accent-gold)' : 'var(--border-color)',
                  border: '1px solid',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  fontSize: '0.7rem'
                }}
              >
                {s.segment_name}
              </span>
            ))
          ) : (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>none</span>
          )}
        </div>
      )
    },
    {
      key: 'ltv',
      label: 'Lifetime Value (LTV)',
      sortable: true,
      width: 160,
      render: (row) => (
        <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
          ₹{((row.scores?.ltv_paise || 0) / 100).toLocaleString('en-IN')}
        </span>
      )
    },
    {
      key: 'total_orders',
      label: 'Orders',
      sortable: true,
      width: 100,
      render: (row) => <span>{row.scores?.total_orders || 0}</span>
    },
    {
      key: 'preferred_device',
      label: 'Preferred Device',
      sortable: true,
      width: 160,
      render: (row) => {
        const dev = row.scores?.preferred_device || 'n/a';
        return (
          <span style={{ textTransform: 'capitalize' }}>
            {dev === 'mobile' && '📱 Mobile'}
            {dev === 'tablet' && '📟 Tablet'}
            {dev === 'desktop' && '💻 Desktop'}
            {dev === 'n/a' && 'Unknown'}
          </span>
        );
      }
    },
    {
      key: 'engagement_score',
      label: 'Engagement',
      sortable: true,
      width: 140,
      render: (row) => (
        <span style={{ background: 'rgba(0,188,212,0.08)', color: '#00BCD4', padding: '2px 6px', borderRadius: '10px', fontSize: '0.7rem' }}>
          {row.scores?.engagement_score || 0} pts
        </span>
      )
    },
    {
      key: 'last_active',
      label: 'Last Active',
      sortable: true,
      width: 140,
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {row.scores?.last_active ? new Date(row.scores.last_active).toLocaleDateString('en-IN') : 'n/a'}
        </span>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      width: 120,
      render: (row) => (
        <Link href={`/admin/customers/${row.id}`} style={{ color: 'var(--accent-gold)', fontWeight: 600 }}>
          View Profile ↗
        </Link>
      )
    }
  ];

  return (
    <AdminTable
      columns={columns}
      data={customers}
      total={total}
      limit={limit}
      offset={offset}
      onPageChange={handlePageChange}
    />
  );
}
