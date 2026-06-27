'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from '../automation.module.css';

interface Template {
  id: string;
  name: string;
  description: string;
  trigger_type: string;
  definition: any;
}

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claimingId, setClaimingId] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/admin/automation/templates');
      if (!res.ok) throw new Error('Failed to load templates');
      const data = await res.json();
      if (data.success) {
        setTemplates(data.templates || []);
      }
    } catch (err: any) {
      setError(err.message || 'Error occurred while loading templates');
    } finally {
      setLoading(false);
    }
  };

  const handleUseTemplate = async (template: Template) => {
    setClaimingId(template.id);
    try {
      const res = await fetch('/api/admin/automation/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${template.name} (Copy)`,
          description: template.description,
          trigger_type: template.trigger_type,
          definition: template.definition,
          is_active: false
        })
      });

      if (!res.ok) throw new Error('Failed to instantiate workflow from template');
      const data = await res.json();
      if (data.success && data.workflow) {
        router.push(`/admin/automation/${data.workflow.id}`);
      } else {
        alert(data.error || 'Failed to initialize workflow');
      }
    } catch (err: any) {
      alert(err.message || 'Error occurred while instantiating template');
    } finally {
      setClaimingId(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '300px', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        LOADING TEMPLATES REGISTRY...
      </div>
    );
  }

  return (
    <div className={styles.container}>
      
      {/* Header */}
      <div className={styles.headerRow}>
        <div className={styles.titleSection}>
          <h2>Automation Blueprints</h2>
          <p>Instantly deploy proven marketing campaigns, VIP retention rules, and customer recovery triggers.</p>
        </div>
      </div>

      {error && (
        <div style={{ color: 'var(--error)', background: 'rgba(229,57,53,0.05)', padding: 'var(--space-3)', borderRadius: '4px', fontSize: '0.8rem' }}>
          Error: {error}
        </div>
      )}

      {/* Grid of templates */}
      <div className={styles.templateGrid}>
        {templates.map((tpl) => (
          <div key={tpl.id} className={styles.templateCard}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className={styles.templateName}>{tpl.name}</div>
              <span className={styles.templateTrigger}>
                Trigger: {tpl.trigger_type}
              </span>
              <p className={styles.templateDesc}>{tpl.description}</p>
            </div>
            
            <button
              onClick={() => handleUseTemplate(tpl)}
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={claimingId !== null}
              style={{ width: '100%' }}
            >
              {claimingId === tpl.id ? 'Instantiating...' : '⚡ Use This Template'}
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}
