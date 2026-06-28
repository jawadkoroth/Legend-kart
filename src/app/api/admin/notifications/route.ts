import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function gateAdmin() {
  const ssr = await createServerSupabaseClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return { ok: false as const, status: 401, message: 'Unauthorized' };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from('admin_users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (!row) return { ok: false as const, status: 403, message: 'Not admin' };
  return { ok: true as const, admin };
}

/**
 * GET /api/admin/notifications
 * Returns a paginated list of admin notifications matching query params.
 */
export async function GET(req: NextRequest) {
  const gate = await gateAdmin();
  if (!gate.ok) return apiError(gate.status, gate.message);

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || '';
  const isRead = searchParams.get('is_read');
  const search = searchParams.get('search') || '';
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  let query = gate.admin
    .from('admin_notifications')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (type) {
    query = query.eq('type', type);
  }

  if (isRead !== null && isRead !== undefined && isRead !== '') {
    query = query.eq('is_read', isRead === 'true');
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,body.ilike.%${search}%`);
  }

  const { data, count, error } = await query.range(offset, offset + limit - 1);

  if (error) {
    return apiError(500, error.message);
  }

  return apiSuccess({
    notifications: data || [],
    total: count || 0,
    limit,
    offset,
  });
}

/**
 * PATCH /api/admin/notifications
 * Marks specific notifications or all notifications as read.
 */
export async function PATCH(req: NextRequest) {
  const gate = await gateAdmin();
  if (!gate.ok) return apiError(gate.status, gate.message);

  try {
    const body = await req.json();
    const { ids, all, type } = body as { ids?: string[]; all?: boolean; type?: string };

    let query = gate.admin.from('admin_notifications').update({ is_read: true });

    if (all) {
      // Mark all as read, optionally filtered by type
      if (type) {
        query = query.eq('type', type);
      }
      // Only modify unread ones
      query = query.eq('is_read', false);
    } else if (ids && ids.length > 0) {
      // Mark specific IDs as read
      query = query.in('id', ids);
    } else {
      return apiError(400, 'Payload must specify either `ids` array or `all: true`');
    }

    const { data, error } = await query.select('id');

    if (error) {
      return apiError(500, error.message);
    }

    return apiSuccess({
      marked: (data || []).map(row => row.id),
      count: (data || []).length,
    });
  } catch (err) {
    return apiError(400, err instanceof Error ? err.message : 'Invalid request payload');
  }
}
