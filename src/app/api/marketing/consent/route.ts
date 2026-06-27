import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subjectId, consent } = body;

    if (!subjectId || !consent) {
      return apiError(400, 'Missing subjectId or consent payload');
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from('marketing_consent').insert({
      subject_id: subjectId,
      analytics: !!consent.analytics,
      marketing: !!consent.marketing,
      functional: !!consent.functional,
      version: consent.version || '1.0.0',
      ts: consent.timestamp || new Date().toISOString(),
    });

    if (error) {
      console.error('[MARKETING_CONSENT_API] Failed to persist consent audit:', error);
      return apiError(500, 'Failed to log consent preferences');
    }

    console.log(`[MARKETING_CONSENT] Audit saved for subject ${subjectId}`);
    return apiSuccess({ saved: true }, 201);
  } catch (err) {
    console.error('[MARKETING_CONSENT_API] POST Error:', err);
    return apiError(500, 'Internal server error');
  }
}
