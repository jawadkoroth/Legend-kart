import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();

    // Auth check
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token || undefined);
    if (authErr || !user) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        return apiError(401, 'Unauthorized');
      }
    }

    // 1. Check database connection & tables
    const { data: dbProviders, error: provErr } = await supabase
      .from('marketing_providers')
      .select('id, enabled, status');

    const { data: recentEvents, error: eventsErr } = await supabase
      .from('marketing_events')
      .select('in_dlq, validation_errors')
      .order('ts_server', { ascending: false })
      .limit(100);

    if (provErr || eventsErr) {
      return apiSuccess({
        healthScore: 0,
        details: { database: 'offline_or_missing_tables' },
      });
    }

    // 2. Compute metrics
    let dbScore = 100;
    
    // Provider Score (Meta, Google, Console)
    let providerScore = 100;
    const active = dbProviders?.filter((p) => p.enabled) || [];
    if (active.length > 0) {
      const failedActive = active.filter((p) => p.status === 'error').length;
      providerScore = Math.max(0, 100 - (failedActive / active.length) * 50); // deduct 50% per broken active provider
    }

    // Queue & Validation Score based on last 100 events
    let queueScore = 100;
    let validationScore = 100;
    
    if (recentEvents && recentEvents.length > 0) {
      const dlqCount = recentEvents.filter((e) => e.in_dlq).length;
      const invalidCount = recentEvents.filter(
        (e) => Array.isArray(e.validation_errors) && e.validation_errors.length > 0
      ).length;

      queueScore = Math.max(0, 100 - (dlqCount / recentEvents.length) * 100);
      validationScore = Math.max(0, 100 - (invalidCount / recentEvents.length) * 100);
    }

    // 3. Compute overall health score
    const overallScore = Math.round(
      (dbScore * 0.2) + (providerScore * 0.3) + (queueScore * 0.3) + (validationScore * 0.2)
    );

    return apiSuccess({
      healthScore: overallScore,
      details: {
        database: dbScore,
        providers: providerScore,
        queue: queueScore,
        validation: validationScore,
      },
    });
  } catch (err: any) {
    console.error('[MARKETING_HEALTH_API] Error:', err);
    return apiError(500, err.message || 'Internal server error');
  }
}
