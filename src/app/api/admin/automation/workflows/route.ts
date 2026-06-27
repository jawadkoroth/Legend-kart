import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiSuccess, apiError } from '@/lib/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Helper to authenticate admin
async function checkAdmin() {
  const serverSupabase = await createServerSupabaseClient();
  const { data: { user } } = await serverSupabase.auth.getUser();
  if (!user) return { errorStatus: 401, message: 'Unauthorized', adminClient: null };

  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient
    .from('admin_users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!adminUser) return { errorStatus: 403, message: 'Forbidden', adminClient: null };
  return { errorStatus: null, message: null, adminClient };
}

/**
 * GET /api/admin/automation/workflows
 */
export async function GET(req: NextRequest) {
  const { errorStatus, message, adminClient } = await checkAdmin();
  if (errorStatus || !adminClient) {
    return apiError(errorStatus || 500, message || 'Authentication failed');
  }

  try {
    const { data: workflows, error } = await adminClient
      .from('workflows')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return apiError(500, `DB error loading workflows: ${error.message}`);
    }

    return apiSuccess({ workflows });
  } catch (err: any) {
    return apiError(500, err.message || 'Internal server error');
  }
}

/**
 * POST /api/admin/automation/workflows
 */
export async function POST(req: NextRequest) {
  const { errorStatus, message, adminClient } = await checkAdmin();
  if (errorStatus || !adminClient) {
    return apiError(errorStatus || 500, message || 'Authentication failed');
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { name, description, trigger_type, definition, is_active } = body;

    if (!name || !trigger_type || !definition) {
      return apiError(400, 'Missing required parameters: name, trigger_type, or definition');
    }

    const { data: workflow, error } = await adminClient
      .from('workflows')
      .insert({
        name,
        description: description || null,
        trigger_type,
        definition,
        is_active: is_active ?? false
      })
      .select('*')
      .single();

    if (error) {
      return apiError(500, `DB error creating workflow: ${error.message}`);
    }

    return apiSuccess({ workflow });
  } catch (err: any) {
    return apiError(500, err.message || 'Internal server error');
  }
}
