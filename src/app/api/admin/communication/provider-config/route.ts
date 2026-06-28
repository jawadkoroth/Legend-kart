import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encrypt } from '@/lib/communication/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();

  // 1. Authenticate Admin User
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: isAdmin } = await supabase
    .from('admin_users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { providerId, credentials, publicConfig } = await req.json();

    if (!providerId || !credentials) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // 2. Encrypt Credentials Server-side
    const encryptedSecret = encrypt(JSON.stringify(credentials));

    // 3. Upsert configuration payload
    const { error: upsertErr } = await supabase
      .from('communication_provider_configs')
      .upsert({
        provider_id: providerId,
        encrypted_secret: encryptedSecret,
        public_config: publicConfig || {},
        updated_at: new Date().toISOString()
      });

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    // Update the channel status
    await supabase
      .from('communication_channels')
      .update({
        status: 'connected',
        enabled: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', providerId === 'whatsapp_meta' ? 'whatsapp' : (providerId === 'resend' ? 'email' : 'push'));

    // 4. Log Administrative Audit Trail
    await supabase
      .from('admin_audit_log')
      .insert({
        admin_id: user.id,
        action: 'UPDATE_COMM_PROVIDER',
        entity_type: 'communication_provider_configs',
        entity_id: providerId,
        metadata: {
          updated_provider: providerId,
          public_keys: Object.keys(publicConfig || {})
        }
      });

    return NextResponse.json({ success: true, message: `${providerId} credentials updated successfully.` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
