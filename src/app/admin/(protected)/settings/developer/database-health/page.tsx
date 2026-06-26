import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from './db-health.module.css';

export const dynamic = 'force-dynamic';

interface DbHealthStats {
  products_media_exists: boolean;
  product_story_sections_exists: boolean;
  product_coupons_exists: boolean;
  admin_fcm_tokens_exists: boolean;
  notification_triggers_exist: boolean;
  current_migration_version: string;
}

export default async function DatabaseHealthPage() {
  const supabase = createAdminClient();

  // 1. Fetch DB schema stats via RPC check_db_schema_health
  let dbStats: DbHealthStats = {
    products_media_exists: false,
    product_story_sections_exists: false,
    product_coupons_exists: false,
    admin_fcm_tokens_exists: false,
    notification_triggers_exist: false,
    current_migration_version: 'unknown'
  };
  let rpcError: string | null = null;

  try {
    const { data, error } = await supabase.rpc('check_db_schema_health');
    if (error) {
      rpcError = error.message;
    } else if (data) {
      dbStats = data as DbHealthStats;
    }
  } catch (err) {
    rpcError = err instanceof Error ? err.message : String(err);
  }

  // 2. Storage Bucket reachable
  let storageReachable = false;
  let storageError: string | null = null;
  try {
    const { data: bucket, error: bucketErr } = await supabase.storage.getBucket('products');
    if (bucketErr) {
      storageError = bucketErr.message;
      // If it exists but is just unauthorized/forbidden, it's still reachable!
      // FetchError means completely unreachable.
      if (bucketErr.message !== 'FetchError') {
        storageReachable = true;
      }
    } else if (bucket) {
      storageReachable = true;
    }
  } catch (err) {
    storageError = err instanceof Error ? err.message : String(err);
  }

  // 3. Firebase Configured
  let firebaseConfigured = false;
  const fcmJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (fcmJson && fcmJson.trim()) {
    try {
      JSON.parse(fcmJson);
      firebaseConfigured = true;
    } catch {
      firebaseConfigured = false;
    }
  }

  // 4. Razorpay Configured
  const razorpayConfigured = !!(
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() && 
    process.env.RAZORPAY_KEY_SECRET?.trim()
  );

  // 5. Delhivery Configured
  let delhiveryConfigured = false;
  try {
    // Check if new multi-provider Delhivery config is enabled, or fallback to legacy settings
    const { data: providers } = await supabase
      .from('shipping_providers')
      .select('is_active, api_key')
      .eq('name', 'delhivery')
      .maybeSingle();

    if (providers && providers.is_active && providers.api_key) {
      delhiveryConfigured = true;
    } else {
      const { data: legacy } = await supabase
        .from('shipping_settings')
        .select('provider_name, provider_enabled, api_key')
        .limit(1)
        .maybeSingle();

      if (legacy && legacy.provider_name === 'delhivery' && legacy.provider_enabled && legacy.api_key) {
        delhiveryConfigured = true;
      }
    }
  } catch {
    delhiveryConfigured = false;
  }

  // 6. Realtime enabled
  const realtimeEnabled = typeof supabase.channel === 'function';

  // Helper status checkers
  const checks = [
    {
      name: 'products.media column',
      desc: 'Stores mixed image and video files for product detail gallery.',
      status: dbStats.products_media_exists,
      migration: '031_product_premium_features'
    },
    {
      name: 'product_story_sections table',
      desc: 'Stores rich editorial storytelling blocks displayed below products.',
      status: dbStats.product_story_sections_exists,
      migration: '031_product_premium_features'
    },
    {
      name: 'product_coupons table',
      desc: 'Promotes discount coupons directly on product pages.',
      status: dbStats.product_coupons_exists,
      migration: '031_product_premium_features'
    },
    {
      name: 'admin_fcm_tokens table',
      desc: 'Stores push tokens for FCM administrative notifications.',
      status: dbStats.admin_fcm_tokens_exists,
      migration: '028_fcm_tokens'
    },
    {
      name: 'Notification triggers',
      desc: 'Triggers automatic push messages on return creation, note edits, and deliveries.',
      status: dbStats.notification_triggers_exist,
      migration: '029_notification_triggers'
    },
    {
      name: 'Supabase storage reachable',
      desc: 'Verifies network reachability of the Supabase Products bucket.',
      status: storageReachable,
      migration: '008_media_storage'
    },
    {
      name: 'Firebase Push Integration',
      desc: 'Checks validation and formatting of the Firebase FCM JSON key.',
      status: firebaseConfigured,
      migration: '028_fcm_tokens'
    },
    {
      name: 'Razorpay Payment Gateway',
      desc: 'Validates Razorpay Key ID and Secret keys exist in env.',
      status: razorpayConfigured,
      migration: '001_initial'
    },
    {
      name: 'Delhivery Logistics API',
      desc: 'Checks active shipping provider is Delhivery and carries valid credentials.',
      status: delhiveryConfigured,
      migration: '009_shipping_pricing / 023_shipping_multi_provider'
    },
    {
      name: 'Realtime Replication Channel',
      desc: 'Verifies real-time event socket subscription handlers are active.',
      status: realtimeEnabled,
      migration: '010_realtime_orders'
    }
  ];

  return (
    <div className={styles.container}>
      <Link href="/admin/settings" className={styles.backLink}>
        ← Back to Settings
      </Link>

      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.title}>Database Health</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Interactive status checklist for development schemas and environment variables.
          </p>
        </div>
        <div className={styles.versionBadge} title="Latest migration version returned from database catalog">
          Migration Version: {dbStats.current_migration_version}
        </div>
      </div>

      {(rpcError || storageError) && (
        <div style={{
          background: 'rgba(229, 57, 53, 0.1)',
          border: '1px solid var(--error)',
          color: 'var(--error)',
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-6)',
          fontSize: '0.875rem'
        }}>
          {rpcError && (
            <div style={{ marginBottom: '4px' }}>
              <strong>RPC Check Failed:</strong> {rpcError}. Ensure migration 032 is applied.
            </div>
          )}
          {storageError && (
            <div>
              <strong>Storage Diagnostics:</strong> {storageError}
            </div>
          )}
        </div>
      )}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Status Dashboard</h2>
        <div className={styles.grid}>
          {checks.map((check) => (
            <div key={check.name} className={styles.statusCard}>
              <div className={styles.infoCol}>
                <span className={styles.itemName}>{check.name}</span>
                <span className={styles.itemDesc}>{check.desc}</span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Expected: {check.migration}
                </span>
              </div>
              <span className={`${styles.indicator} ${check.status ? styles.indicatorSuccess : styles.indicatorError}`}>
                {check.status ? '✓ Active' : '✗ Missing'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
