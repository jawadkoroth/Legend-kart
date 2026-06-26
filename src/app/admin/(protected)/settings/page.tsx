import Link from 'next/link';
import styles from './settings.module.css';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Settings</h1>
      <p className={styles.subtitle}>
        Configure, audit, and diagnose development settings for the PANTHER platform.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Developer Diagnostics</h2>
        </div>

        <Link href="/admin/settings/developer/database-health">
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Database Health</span>
              <span className={styles.arrow}>→</span>
            </div>
            <p className={styles.cardDesc}>
              Verify applied database migrations, examine column structures, monitor push notification triggers, ping storage buckets, and audit external configurations (Firebase, Razorpay, Delhivery, Realtime).
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
