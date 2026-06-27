import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiSuccess, apiError } from '@/lib/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
 * GET /api/admin/automation/workflows/[id]
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { errorStatus, message, adminClient } = await checkAdmin();
  if (errorStatus || !adminClient) {
    return apiError(errorStatus || 500, message || 'Authentication failed');
  }

  try {
    const { data: workflow, error } = await adminClient
      .from('workflows')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return apiError(500, `DB error loading workflow: ${error.message}`);
    }
    if (!workflow) {
      return apiError(404, 'Workflow not found');
    }

    return apiSuccess({ workflow });
  } catch (err: any) {
    return apiError(500, err.message || 'Internal server error');
  }
}

/**
 * PUT /api/admin/automation/workflows/[id]
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { errorStatus, message, adminClient } = await checkAdmin();
  if (errorStatus || !adminClient) {
    return apiError(errorStatus || 500, message || 'Authentication failed');
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { name, description, trigger_type, definition, is_active } = body;

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString()
    };
    if (name !== undefined) updatePayload.name = name;
    if (description !== undefined) updatePayload.description = description;
    if (trigger_type !== undefined) updatePayload.trigger_type = trigger_type;
    if (definition !== undefined) updatePayload.definition = definition;
    if (is_active !== undefined) updatePayload.is_active = is_active;

    const { data: workflow, error } = await adminClient
      .from('workflows')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return apiError(500, `DB error updating workflow: ${error.message}`);
    }

    return apiSuccess({ workflow });
  } catch (err: any) {
    return apiError(500, err.message || 'Internal server error');
  }
}

/**
 * DELETE /api/admin/automation/workflows/[id]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { errorStatus, message, adminClient } = await checkAdmin();
  if (errorStatus || !adminClient) {
    return apiError(errorStatus || 500, message || 'Authentication failed');
  }

  try {
    const { error } = await adminClient
      .from('workflows')
      .delete()
      .eq('id', id);

    if (error) {
      return apiError(500, `DB error deleting workflow: ${error.message}`);
    }

    return apiSuccess({ success: true });
  } catch (err: any) {
    return apiError(500, err.message || 'Internal server error');
  }
}
