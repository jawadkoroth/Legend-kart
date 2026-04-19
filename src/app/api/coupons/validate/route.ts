import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();

    if (!code || typeof code !== 'string') {
      return apiError(400, 'Coupon code is required');
    }

    const supabase = createAdminClient();

    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('code, discount_percent, is_active')
      .eq('code', code.toUpperCase().trim())
      .eq('is_active', true)
      .single();

    if (error || !coupon) {
      return apiError(404, 'Invalid or expired coupon code');
    }

    return apiSuccess({
      code: coupon.code,
      discount_percent: coupon.discount_percent,
    });
  } catch (err) {
    console.error('[COUPON_VALIDATE_ERROR]', err);
    return apiError(500, 'Internal server error');
  }
}
