import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAction } from '@/lib/audit/logAdminAction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/admin/products/:id
 *
 *   Soft-archives a product. Sets `archived_at = now()` AND
 *   `is_active = false` in a single UPDATE so the storefront
 *   API (which already filters `is_active=true`) and the cart
 *   validation route (which drops inactive lines) hide the row
 *   immediately without further code changes.
 *
 *   Hard-delete is intentionally NOT implemented:
 *     * `orders.product_id` FK would block deletion whenever any
 *       historical order references the row.
 *     * Order detail pages / email history can still reference
 *       this product for months.
 *     * Archive is reversible; hard-delete is not.
 *
 * POST /api/admin/products/:id/restore (handled by :id + body.op)
 *
 *   A sibling POST with `{ op: 'restore' }` clears archived_at
 *   and flips is_active back to true.
 */

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
  return { ok: true as const, admin, adminId: user.id };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f-]{8,}$/i.test(value);
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await gateAdmin();
  if (!gate.ok) return apiError(gate.status, gate.message);
  const { id } = await context.params;
  if (!isUuid(id)) return apiError(400, 'Invalid product id');

  const { data: existing } = await gate.admin
    .from('products')
    .select('id, name, slug, archived_at')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return apiError(404, 'Product not found');
  if (existing.archived_at) {
    return apiSuccess({ archived: true, id, already: true });
  }

  const { error } = await gate.admin
    .from('products')
    .update({ archived_at: new Date().toISOString(), is_active: false })
    .eq('id', id);

  if (error) {
    console.error('[ADMIN_PRODUCT_ARCHIVE]', error);
    return apiError(500, 'Failed to archive product');
  }

  await logAdminAction(gate.admin, {
    adminId: gate.adminId,
    action: 'product.archive',
    entityType: 'product',
    entityId: id,
    metadata: { name: existing.name, slug: existing.slug },
  });

  return apiSuccess({ archived: true, id });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await gateAdmin();
  if (!gate.ok) return apiError(gate.status, gate.message);
  const { id } = await context.params;
  if (!isUuid(id)) return apiError(400, 'Invalid product id');

  const body = (await req.json().catch(() => ({}))) as { op?: string };
  if (body.op !== 'restore') {
    return apiError(400, 'Unsupported operation');
  }

  const { data: existing } = await gate.admin
    .from('products')
    .select('id, name, slug, archived_at')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return apiError(404, 'Product not found');
  if (!existing.archived_at) {
    return apiSuccess({ restored: true, id, already: true });
  }

  const { error } = await gate.admin
    .from('products')
    .update({ archived_at: null, is_active: true })
    .eq('id', id);

  if (error) {
    console.error('[ADMIN_PRODUCT_RESTORE]', error);
    return apiError(500, 'Failed to restore product');
  }

  await logAdminAction(gate.admin, {
    adminId: gate.adminId,
    action: 'product.restore',
    entityType: 'product',
    entityId: id,
    metadata: { name: existing.name, slug: existing.slug },
  });

  return apiSuccess({ restored: true, id });
}
