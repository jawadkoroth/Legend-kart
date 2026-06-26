import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const ssr = await createServerSupabaseClient();
    const { data: { user } } = await ssr.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { items, contactEmail } = await req.json();

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ success: false, error: 'Malformed items data' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Check if there is an existing unrecovered cart record
    const { data: existing } = await adminClient
      .from('abandoned_carts')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_recovered', false)
      .maybeSingle();

    if (existing) {
      const { error } = await adminClient
        .from('abandoned_carts')
        .update({
          cart_items: items,
          contact_email: contactEmail || user.email || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (error) throw error;
    } else {
      const { error } = await adminClient
        .from('abandoned_carts')
        .insert({
          user_id: user.id,
          cart_items: items,
          contact_email: contactEmail || user.email || null,
          is_recovered: false,
          recovery_eligible: true
        });

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[CART_RECOVERY_ERROR]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
