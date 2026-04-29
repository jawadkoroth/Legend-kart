import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiSuccess, apiError } from '@/lib/api-response';

/**
 * Admin-only media upload/delete API.
 *
 * Security model:
 *   1. User identity verified via `createServerSupabaseClient()` (cookie-based).
 *   2. Admin role verified against `admin_users` table.
 *   3. Storage operations use `createAdminClient()` (service role) to
 *      bypass RLS — the RLS policies are a safety layer, not the primary gate.
 *   4. Service role key NEVER leaves the server.
 */

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  return map[mimeType] || 'jpg';
}

/* ------------------------------------------------------------------ */
/* Shared admin verification                                           */
/* ------------------------------------------------------------------ */

async function verifyAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: Response }
> {
  const serverSupabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await serverSupabase.auth.getUser();

  if (!user) {
    return { ok: false, response: apiError(401, 'Unauthorized') };
  }

  const supabase = createAdminClient();
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id')
    .eq('id', user.id)
    .single();

  if (!adminUser) {
    return { ok: false, response: apiError(403, 'Not admin') };
  }

  return { ok: true, userId: user.id };
}

/* ------------------------------------------------------------------ */
/* POST — Upload file                                                  */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    // 1. Verify admin
    const auth = await verifyAdmin();
    if (!auth.ok) return auth.response;

    // 2. Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string | null) || 'misc';

    if (!file) {
      return apiError(400, 'No file provided');
    }

    // 3. Validate file type
    if (!ALLOWED_TYPES.has(file.type)) {
      return apiError(400, `Invalid file type: ${file.type}. Allowed: jpg, jpeg, png, webp`);
    }

    // 4. Validate file size
    if (file.size > MAX_SIZE_BYTES) {
      return apiError(400, `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 5MB`);
    }

    // 5. Generate storage path (relative — does NOT include "products/")
    const ext = getExtension(file.type);
    const uuid = crypto.randomUUID();
    const storagePath = `${folder}/${uuid}.${ext}`;

    // 6. Upload to Supabase Storage
    const supabase = createAdminClient();
    const { error: uploadError } = await supabase.storage
      .from('products')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[UPLOAD_ERROR]', uploadError);
      return apiError(500, 'Upload failed: ' + uploadError.message);
    }

    // 7. Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('products')
      .getPublicUrl(storagePath);

    console.log(`[UPLOAD_OK] admin=${auth.userId} path=${storagePath}`);

    return apiSuccess({
      url: publicUrlData.publicUrl,
      path: storagePath,
    });
  } catch (err) {
    console.error('[UPLOAD_INTERNAL_ERROR]', err);
    return apiError(500, 'Internal server error');
  }
}

/* ------------------------------------------------------------------ */
/* DELETE — Remove file                                                */
/* ------------------------------------------------------------------ */

export async function DELETE(req: NextRequest) {
  try {
    // 1. Verify admin
    const auth = await verifyAdmin();
    if (!auth.ok) return auth.response;

    // 2. Parse body
    const body = await req.json().catch(() => null);
    const path = body?.path;

    if (!path || typeof path !== 'string') {
      return apiError(400, 'Missing or invalid "path" in request body');
    }

    // 3. Safety: never allow path traversal
    if (path.includes('..') || path.startsWith('/')) {
      return apiError(400, 'Invalid path');
    }

    // 4. Delete from storage
    const supabase = createAdminClient();
    const { error: deleteError } = await supabase.storage
      .from('products')
      .remove([path]);

    if (deleteError) {
      console.error('[DELETE_ERROR]', deleteError);
      return apiError(500, 'Delete failed: ' + deleteError.message);
    }

    console.log(`[DELETE_OK] admin=${auth.userId} path=${path}`);

    return apiSuccess({ deleted: path });
  } catch (err) {
    console.error('[DELETE_INTERNAL_ERROR]', err);
    return apiError(500, 'Internal server error');
  }
}
