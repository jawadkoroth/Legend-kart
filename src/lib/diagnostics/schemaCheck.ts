import { createClient } from '@supabase/supabase-js';

/**
 * PANTHER — Startup Database Schema Health Check
 * Validates critical tables and columns on application boot (development mode only).
 * Logs missing schema elements and expected migrations without blocking execution.
 */
export async function runPantherSchemaCheck() {
  if (process.env.NODE_ENV !== 'development') return;

  // Global flag to guarantee execution happens exactly once per development server boot
  const globalWithFlag = global as typeof globalThis & {
    hasRunPantherSchemaCheck?: boolean;
  };
  if (globalWithFlag.hasRunPantherSchemaCheck) return;
  globalWithFlag.hasRunPantherSchemaCheck = true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.warn('[PANTHER_SCHEMA_CHECK] Missing credentials to run startup database check.');
    return;
  }

  // Create self-contained client to prevent circular imports
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  console.log('[PANTHER_SCHEMA_CHECK] Initializing database schema health verification...');

  try {
    // 1. Check products.media column
    const { error: mediaErr } = await supabase.from('products').select('media').limit(1);
    if (mediaErr && (mediaErr.code === '42703' || mediaErr.message?.includes('column'))) {
      console.error('\n❌ [PANTHER_SCHEMA_CHECK] Missing: products.media. Expected migration: 031_product_premium_features\n');
    }

    // 2. Check product_story_sections table
    const { error: storyErr } = await supabase.from('product_story_sections').select('id').limit(1);
    if (storyErr && (storyErr.code === '42P01' || storyErr.message?.includes('relation'))) {
      console.error('\n❌ [PANTHER_SCHEMA_CHECK] Missing table: product_story_sections. Expected migration: 031_product_premium_features\n');
    }

    // 3. Check product_coupons table
    const { error: couponErr } = await supabase.from('product_coupons').select('id').limit(1);
    if (couponErr && (couponErr.code === '42P01' || couponErr.message?.includes('relation'))) {
      console.error('\n❌ [PANTHER_SCHEMA_CHECK] Missing table: product_coupons. Expected migration: 031_product_premium_features\n');
    }

    // 4. Check admin_fcm_tokens table
    const { error: fcmErr } = await supabase.from('admin_fcm_tokens').select('id').limit(1);
    if (fcmErr && (fcmErr.code === '42P01' || fcmErr.message?.includes('relation'))) {
      console.error('\n❌ [PANTHER_SCHEMA_CHECK] Missing table: admin_fcm_tokens. Expected migration: 028_fcm_tokens\n');
    }

    console.log('[PANTHER_SCHEMA_CHECK] Database schema health check complete.');
  } catch (err) {
    console.error('[PANTHER_SCHEMA_CHECK] Uncaught exception running schema checker:', err);
  }
}
