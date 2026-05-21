/**
 * NOIR — POST /api/admin/shipping/test
 *
 * Performs a live operational test of the configured shipping provider.
 * Returns structured diagnostics for the admin diagnostics panel.
 *
 * Auth: Admin-only (via middleware or session validation)
 * Response: ConnectionTestResult JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActiveProvider } from '@/lib/shipping/registry';
import { ConnectionTestResult } from '@/lib/shipping/types';
import { logEvent } from '@/lib/log';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(_req: NextRequest): Promise<NextResponse> {
  const t0 = Date.now();

  try {
    // Auth check — require admin role
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role via admin_users table
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!adminUser) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get active provider (will be null if SHIPPING_NEW_PROVIDER_PIPE is not 'on')
    const provider = await getActiveProvider();

    if (!provider) {
      logEvent('shipping.test.no_active_provider', {}, { source: 'api', severity: 'warn' });
      return NextResponse.json<ConnectionTestResult>({
        success: false,
        provider: 'delhivery', // default fallback
        checks: {
          auth: { ok: false, latency_ms: 0, message: 'No active provider configured' },
          api: { ok: false, message: 'Provider not active' },
          pickup: { ok: false, message: 'No provider' },
        },
        errors: ['No active shipping provider configured — enable a provider in settings'],
        warnings: ['Shipping system is currently disabled'],
        timestamp: new Date().toISOString(),
      }, { status: 503 });
    }

    // Run the connection test
    const result = await provider.testConnection();
    const latency = Date.now() - t0;

    logEvent('shipping.test.completed', {
      provider: result.provider,
      success: result.success,
      latency_ms: latency,
      error_count: result.errors.length,
    }, { source: 'api', severity: result.success ? 'info' : 'warn' });

    return NextResponse.json<ConnectionTestResult>(result);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logEvent('shipping.test.failed', { error: msg }, { source: 'api', severity: 'error' });

    return NextResponse.json<ConnectionTestResult>({
      success: false,
      provider: 'delhivery',
      checks: {
        auth: { ok: false, latency_ms: Date.now() - t0, message: 'Internal error' },
        api: { ok: false, message: msg },
        pickup: { ok: false, message: 'Unknown' },
      },
      errors: [`Internal error: ${msg}`],
      warnings: [],
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
