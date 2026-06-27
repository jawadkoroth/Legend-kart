import React from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from '../marketing-admin.module.css';
import AudienceBuilder from './AudienceBuilder';

export const dynamic = 'force-dynamic';

interface Audience {
  id: string;
  name: string;
  description: string | null;
  rules: any;
  created_at: string;
}

export default async function AudiencesPage() {
  const supabase = createAdminClient();

  // Load audiences from database
  const { data: audiencesRaw, error } = await supabase
    .from('marketing_audiences')
    .select('*')
    .order('created_at', { ascending: false });

  const audiences = (audiencesRaw || []) as Audience[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      
      {/* Description header */}
      <div className={styles.card} style={{ marginBottom: 0 }}>
        <h3 style={{ textTransform: 'uppercase', fontSize: '0.85rem', color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
          👥 Cohort Audience Builder
        </h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
          Create and sync dynamic consumer cohorts to Meta Business Manager or Google Customer Match targeting lists.
        </p>
      </div>

      {/* Dynamic Audience Builder view */}
      <AudienceBuilder initialAudiences={audiences} />

    </div>
  );
}
