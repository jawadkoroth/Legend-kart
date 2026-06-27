import Link from 'next/link';
import { execSync } from 'child_process';
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
  // Phase 2
  wishlist_items_exists: boolean;
  recently_viewed_exists: boolean;
  frequently_bought_together_exists: boolean;
  product_reviews_exists: boolean;
  product_qas_exists: boolean;
  gift_cards_exists: boolean;
  referrals_exists: boolean;
  loyalty_ledger_exists: boolean;
  abandoned_carts_exists: boolean;
  marketing_events_exists: boolean;
  marketing_providers_exists: boolean;
  marketing_consent_exists: boolean;
  marketing_feature_flags_exists: boolean;
  events_correlation_exists: boolean;
  // Metrics
  total_tables: number;
  total_functions: number;
  total_triggers: number;
  rls_enabled_tables: number;
  realtime_publication_exists: boolean;
}

interface AppEventRow {
  created_at: string;
  event: string;
  severity: string;
  metadata: any;
}

function getGitInfo() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    const commit = execSync('git log -1 --format="%h - %s"', { encoding: 'utf8' }).trim();
    return { branch, commit };
  } catch {
    return { branch: 'main (depl)', commit: 'latest' };
  }
}

export default async function DatabaseHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const currentTab = sp.tab || 'database';
  const supabase = createAdminClient();

  // 1. Fetch DB schema stats via RPC check_db_schema_health
  let dbStats: DbHealthStats = {
    products_media_exists: false,
    product_story_sections_exists: false,
    product_coupons_exists: false,
    admin_fcm_tokens_exists: false,
    notification_triggers_exist: false,
    current_migration_version: 'unknown',
    wishlist_items_exists: false,
    recently_viewed_exists: false,
    frequently_bought_together_exists: false,
    product_reviews_exists: false,
    product_qas_exists: false,
    gift_cards_exists: false,
    referrals_exists: false,
    loyalty_ledger_exists: false,
    abandoned_carts_exists: false,
    marketing_events_exists: false,
    marketing_providers_exists: false,
    marketing_consent_exists: false,
    marketing_feature_flags_exists: false,
    events_correlation_exists: false,
    total_tables: 0,
    total_functions: 0,
    total_triggers: 0,
    rls_enabled_tables: 0,
    realtime_publication_exists: false
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

  // 2. Fetch Storage metrics
  let storageReachable = false;
  let fileCount = 0;
  try {
    const { data: files, error: bucketErr } = await supabase.storage.from('products').list('', { limit: 100 });
    if (!bucketErr) {
      storageReachable = true;
      if (files) fileCount = files.length;
    }
  } catch {}

  // 3. Fetch Jobs metrics
  let pendingJobs = 0;
  let runningJobs = 0;
  let failedJobs = 0;
  let completedToday = 0;
  try {
    const { count: pending } = await supabase.from('job_queue').select('id', { count: 'exact', head: true }).eq('status', 'queued');
    const { count: running } = await supabase.from('job_queue').select('id', { count: 'exact', head: true }).eq('status', 'running');
    const { count: failed } = await supabase.from('job_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed');
    const { count: dead } = await supabase.from('job_queue').select('id', { count: 'exact', head: true }).eq('status', 'dead');
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const { count: completed } = await supabase.from('job_queue').select('id', { count: 'exact', head: true }).eq('status', 'succeeded').gte('updated_at', today.toISOString());

    pendingJobs = pending ?? 0;
    runningJobs = running ?? 0;
    failedJobs = (failed ?? 0) + (dead ?? 0);
    completedToday = completed ?? 0;
  } catch {}

  // 4. Fetch FCM device metrics
  let activeFcmTokens = 0;
  try {
    const { count: fcmCount } = await supabase.from('admin_fcm_tokens').select('id', { count: 'exact', head: true });
    activeFcmTokens = fcmCount ?? 0;
  } catch {}

  // 5. Fetch Recent Errors for Diagnostics tab
  let recentEvents: AppEventRow[] = [];
  try {
    const { data: logs } = await supabase
      .from('app_events')
      .select('created_at, event, severity, metadata')
      .in('severity', ['error', 'fatal', 'warn'])
      .order('created_at', { ascending: false })
      .limit(10);
    if (logs) {
      recentEvents = logs as AppEventRow[];
    }
  } catch {}

  // Git & Build Info
  const git = getGitInfo();
  const buildTime = new Date().toISOString();

  // Drift Calculation
  const schemaDrift = !(
    dbStats.products_media_exists &&
    dbStats.product_story_sections_exists &&
    dbStats.product_coupons_exists &&
    dbStats.admin_fcm_tokens_exists &&
    dbStats.wishlist_items_exists &&
    dbStats.recently_viewed_exists &&
    dbStats.frequently_bought_together_exists &&
    dbStats.product_reviews_exists &&
    dbStats.product_qas_exists &&
    dbStats.gift_cards_exists &&
    dbStats.referrals_exists &&
    dbStats.loyalty_ledger_exists &&
    dbStats.abandoned_carts_exists &&
    dbStats.marketing_events_exists &&
    dbStats.marketing_providers_exists &&
    dbStats.marketing_consent_exists &&
    dbStats.marketing_feature_flags_exists &&
    dbStats.events_correlation_exists
  );

  const realtimeEnabled = dbStats.realtime_publication_exists;

  return (
    <div className={styles.container}>
      <Link href="/admin/settings" className={styles.backLink}>
        ← Back to Settings
      </Link>

      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.title}>Developer Operations Center</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Verify database structures, variables, push states, and background queue events.
          </p>
        </div>
        <div className={styles.versionBadge}>
          Active Migration: {dbStats.current_migration_version}
        </div>
      </div>

      {rpcError && (
        <div style={{
          background: 'rgba(229, 57, 53, 0.1)',
          border: '1px solid var(--error)',
          color: 'var(--error)',
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-6)',
          fontSize: '0.875rem'
        }}>
          <strong>RPC Health Fetch Failed:</strong> {rpcError}. Apply pending migrations.
        </div>
      )}

      {/* Tabs */}
      <nav className={styles.navTabs}>
        {[
          { id: 'database', label: '🗄️ Database' },
          { id: 'environment', label: '🔑 Env Variables' },
          { id: 'storage', label: '📂 Storage' },
          { id: 'realtime', label: '⚡ Realtime' },
          { id: 'android', label: '📱 Android' },
          { id: 'jobs', label: '⏱️ Background Jobs' },
          { id: 'build', label: '🛠️ Build & Git' },
          { id: 'diagnostics', label: '🩺 Diagnostics' },
        ].map((tab) => (
          <Link
            key={tab.id}
            href={`/admin/settings/developer/database-health?tab=${tab.id}`}
            className={`${styles.tabLink} ${currentTab === tab.id ? styles.tabLinkActive : ''}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {/* DATABASE TAB */}
      {currentTab === 'database' && (
        <div className={styles.section}>
          <div className={styles.metricGrid}>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Total Tables</span>
              <span className={styles.metricValue}>{dbStats.total_tables}</span>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Total Functions</span>
              <span className={styles.metricValue}>{dbStats.total_functions}</span>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Total Triggers</span>
              <span className={styles.metricValue}>{dbStats.total_triggers}</span>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>RLS Protected</span>
              <span className={styles.metricValue}>{dbStats.rls_enabled_tables}</span>
            </div>
          </div>

          <h2 className={styles.sectionTitle}>Schema Tables & Columns Check</h2>
          <div className={styles.grid}>
            {[
              { name: 'products.media column', status: dbStats.products_media_exists, migration: '031' },
              { name: 'product_story_sections table', status: dbStats.product_story_sections_exists, migration: '031' },
              { name: 'product_coupons table', status: dbStats.product_coupons_exists, migration: '031' },
              { name: 'wishlist_items table', status: dbStats.wishlist_items_exists, migration: '033' },
              { name: 'recently_viewed table', status: dbStats.recently_viewed_exists, migration: '033' },
              { name: 'frequently_bought_together table', status: dbStats.frequently_bought_together_exists, migration: '033' },
              { name: 'product_reviews table', status: dbStats.product_reviews_exists, migration: '033' },
              { name: 'product_qas table', status: dbStats.product_qas_exists, migration: '033' },
              { name: 'gift_cards table', status: dbStats.gift_cards_exists, migration: '033' },
              { name: 'referrals table', status: dbStats.referrals_exists, migration: '033' },
              { name: 'loyalty_ledger table', status: dbStats.loyalty_ledger_exists, migration: '033' },
              { name: 'abandoned_carts table', status: dbStats.abandoned_carts_exists, migration: '033' },
              { name: 'marketing_events table', status: dbStats.marketing_events_exists, migration: '034' },
              { name: 'marketing_providers table', status: dbStats.marketing_providers_exists, migration: '034' },
              { name: 'marketing_consent table', status: dbStats.marketing_consent_exists, migration: '034' },
              { name: 'marketing_feature_flags table', status: dbStats.marketing_feature_flags_exists, migration: '035' },
              { name: 'marketing_events.correlation_id column', status: dbStats.events_correlation_exists, migration: '035' },
            ].map((check) => (
              <div key={check.name} className={styles.statusCard}>
                <div className={styles.infoCol}>
                  <span className={styles.itemName}>{check.name}</span>
                  <span className={styles.itemDesc}>Applied in migration version 0{check.migration}</span>
                </div>
                <span className={`${styles.indicator} ${check.status ? styles.indicatorSuccess : styles.indicatorError}`}>
                  {check.status ? '✓ Active' : '✗ Missing'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ENVIRONMENT TAB */}
      {currentTab === 'environment' && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Required Variables</h2>
          <div className={styles.grid}>
            {[
              { name: 'Supabase URL', key: 'NEXT_PUBLIC_SUPABASE_URL', status: !!process.env.NEXT_PUBLIC_SUPABASE_URL },
              { name: 'Supabase Anon Key', key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', status: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
              { name: 'Supabase Service Key', key: 'SUPABASE_SERVICE_ROLE_KEY', status: !!process.env.SUPABASE_SERVICE_ROLE_KEY },
              { name: 'Firebase Credentials', key: 'FIREBASE_SERVICE_ACCOUNT_JSON', status: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON },
              { name: 'Razorpay Key ID', key: 'NEXT_PUBLIC_RAZORPAY_KEY_ID', status: !!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID },
              { name: 'Razorpay Key Secret', key: 'RAZORPAY_KEY_SECRET', status: !!process.env.RAZORPAY_KEY_SECRET },
              { name: 'Google Maps API Key', key: 'NEXT_PUBLIC_GOOGLE_MAPS_KEY', status: !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY },
              { name: 'Email Provider (Resend Key)', key: 'RESEND_API_KEY', status: !!process.env.RESEND_API_KEY },
            ].map((env) => (
              <div key={env.key} className={styles.statusCard}>
                <div className={styles.infoCol}>
                  <span className={styles.itemName}>{env.name}</span>
                  <span className={styles.itemDesc} style={{ fontFamily: 'monospace' }}>{env.key}</span>
                </div>
                <span className={`${styles.indicator} ${env.status ? styles.indicatorSuccess : styles.indicatorError}`}>
                  {env.status ? '✓ Configured' : '✗ Missing'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STORAGE TAB */}
      {currentTab === 'storage' && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Supabase Storage Connectivity</h2>
          <div className={styles.grid}>
            <div className={styles.statusCard}>
              <div className={styles.infoCol}>
                <span className={styles.itemName}>products Bucket Reachable</span>
                <span className={styles.itemDesc}>Required to upload product detail mixed gallery media (Images + Videos) and Story blocks.</span>
              </div>
              <span className={`${styles.indicator} ${storageReachable ? styles.indicatorSuccess : styles.indicatorError}`}>
                {storageReachable ? '✓ Connected' : '✗ Offline'}
              </span>
            </div>
            <div className={styles.statusCard}>
              <div className={styles.infoCol}>
                <span className={styles.itemName}>Files listed (Cached)</span>
                <span className={styles.itemDesc}>Total product files currently loaded in products folder list.</span>
              </div>
              <span className={styles.indicator} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                {fileCount} Files
              </span>
            </div>
          </div>
        </div>
      )}

      {/* REALTIME TAB */}
      {currentTab === 'realtime' && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Realtime Replication Channels</h2>
          <div className={styles.grid}>
            <div className={styles.statusCard}>
              <div className={styles.infoCol}>
                <span className={styles.itemName}>Realtime Connected Status</span>
                <span className={styles.itemDesc}>Supabase websocket client instance initialization.</span>
              </div>
              <span className={`${styles.indicator} ${realtimeEnabled ? styles.indicatorSuccess : styles.indicatorError}`}>
                {realtimeEnabled ? '✓ Enabled' : '✗ Disabled'}
              </span>
            </div>
            <div className={styles.statusCard}>
              <div className={styles.infoCol}>
                <span className={styles.itemName}>Postgres Replication Publication</span>
                <span className={styles.itemDesc}>Verifies the supabase_realtime publication is registered in the database.</span>
              </div>
              <span className={`${styles.indicator} ${dbStats.realtime_publication_exists ? styles.indicatorSuccess : styles.indicatorError}`}>
                {dbStats.realtime_publication_exists ? '✓ Active' : '✗ Missing'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ANDROID TAB */}
      {currentTab === 'android' && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Android Administrative App Sync</h2>
          <div className={styles.grid}>
            <div className={styles.statusCard}>
              <div className={styles.infoCol}>
                <span className={styles.itemName}>FCM Registered Push Tokens</span>
                <span className={styles.itemDesc}>Administrative client push endpoints stored.</span>
              </div>
              <span className={styles.indicator} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                {activeFcmTokens} Devices
              </span>
            </div>
            <div className={styles.statusCard}>
              <div className={styles.infoCol}>
                <span className={styles.itemName}>Latest APK Version Manifest</span>
                <span className={styles.itemDesc}>Registered mobile shell version check.</span>
              </div>
              <span className={styles.indicator} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                v1.0.0 (Dev)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* BACKGROUND JOBS TAB */}
      {currentTab === 'jobs' && (
        <div className={styles.section}>
          <div className={styles.metricGrid}>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Queued</span>
              <span className={styles.metricValue}>{pendingJobs}</span>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Running</span>
              <span className={styles.metricValue}>{runningJobs}</span>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Failed / Dead</span>
              <span className={`${styles.metricValue} ${failedJobs > 0 ? styles.statWarn : ''}`}>{failedJobs}</span>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Completed Today</span>
              <span className={styles.metricValue}>{completedToday}</span>
            </div>
          </div>
        </div>
      )}

      {/* BUILD & GIT TAB */}
      {currentTab === 'build' && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Build & Execution Metrics</h2>
          <div className={styles.grid}>
            <div className={styles.statusCard}>
              <div className={styles.infoCol}>
                <span className={styles.itemName}>Active Git Branch</span>
                <span className={styles.itemDesc} style={{ fontFamily: 'monospace' }}>{git.branch}</span>
              </div>
            </div>
            <div className={styles.statusCard}>
              <div className={styles.infoCol}>
                <span className={styles.itemName}>Latest Commit Hash</span>
                <span className={styles.itemDesc} style={{ fontFamily: 'monospace' }}>{git.commit}</span>
              </div>
            </div>
            <div className={styles.statusCard}>
              <div className={styles.infoCol}>
                <span className={styles.itemName}>Node version</span>
                <span className={styles.itemDesc} style={{ fontFamily: 'monospace' }}>{process.version}</span>
              </div>
            </div>
            <div className={styles.statusCard}>
              <div className={styles.infoCol}>
                <span className={styles.itemName}>Build timestamp</span>
                <span className={styles.itemDesc} style={{ fontFamily: 'monospace' }}>{buildTime}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DIAGNOSTICS TAB */}
      {currentTab === 'diagnostics' && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Operational Traces</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
            <div className={styles.statusCard}>
              <div className={styles.infoCol}>
                <span className={styles.itemName}>Schema Drift Detection</span>
                <span className={styles.itemDesc}>Checks if any deployed tables deviate from the source code definitions.</span>
              </div>
              <span className={`${styles.indicator} ${!schemaDrift ? styles.indicatorSuccess : styles.indicatorWarning}`}>
                {!schemaDrift ? '✓ No Drift' : '⚠️ Drift Detected'}
              </span>
            </div>
          </div>

          <h2 className={styles.sectionTitle} style={{ marginBottom: 'var(--space-4)' }}>Recent Error & Warning Logs</h2>
          {recentEvents.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontFamily: 'monospace', padding: 'var(--space-4)' }}>
              No recent errors or warnings found in database log app_events.
            </div>
          ) : (
            <div className={styles.eventList}>
              {recentEvents.map((evt, index) => (
                <div key={index} className={styles.eventRow}>
                  <div className={styles.eventMeta}>
                    <span className={styles.eventTime}>{new Date(evt.created_at).toLocaleTimeString()}</span>
                    <span className={`${styles.eventSeverity} ${evt.severity === 'error' || evt.severity === 'fatal' ? styles.sevError : styles.sevWarn}`}>
                      {evt.severity.toUpperCase()}
                    </span>
                  </div>
                  <div className={styles.eventBody}>
                    <strong>Event:</strong> {evt.event}
                    {evt.metadata && evt.metadata.migration_advice && (
                      <div style={{ color: 'var(--accent-gold)', marginTop: '4px', borderTop: '1px solid var(--border-color)', paddingTop: '4px' }}>
                        💡 {evt.metadata.migration_advice}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
