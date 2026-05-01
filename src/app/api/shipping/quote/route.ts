import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';
import { calcShipping, type PaymentMethod } from '@/lib/shipping/calcShipping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/shipping/quote
 *
 * Estimate shipping + COD fee + total for the checkout UI. This
 * route is a pure read: it loads the singleton `shipping_settings`
 * row server-side, runs the shared `calcShipping` rules, and
 * returns the breakdown. No DB writes, no authentication required
 * (guests check out too).
 *
 * The returned numbers are NOT authoritative — `/api/orders` re-runs
 * `calcShipping` with the same inputs at order creation time and
 * persists the authoritative total to the DB.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const subtotalPaise = Number(body?.subtotalPaise);
    const paymentMethodRaw = body?.paymentMethod;

    if (!Number.isFinite(subtotalPaise) || subtotalPaise < 0) {
      return apiError(400, 'Invalid subtotalPaise');
    }

    const paymentMethod: PaymentMethod =
      paymentMethodRaw === 'cod' ? 'cod' : 'online';

    const supabase = createAdminClient();
    // Expose ONLY pricing-relevant columns — never the API key or
    // pickup PII — to keep this public route tight.
    const { data: settings } = await supabase
      .from('shipping_settings')
      .select(
        'free_shipping_threshold_paise, default_shipping_charge_paise, cod_enabled, cod_fee_paise',
      )
      .limit(1)
      .maybeSingle();

    const result = calcShipping({
      subtotalPaise,
      paymentMethod,
      shippingSettings: settings ?? null,
    });

    return apiSuccess({
      shippingPaise: result.shippingPaise,
      codFeePaise: result.codFeePaise,
      totalPaise: result.totalPaise,
      codAllowed: result.codAllowed,
      codEnabled: settings?.cod_enabled !== false,
    });
  } catch (err) {
    console.error('[SHIPPING_QUOTE_ERROR]', err);
    return apiError(500, 'Failed to compute shipping quote');
  }
}
