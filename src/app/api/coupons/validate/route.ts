import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiSuccess, apiError } from '@/lib/api-response';

/**
 * POST /api/coupons/validate
 *
 * Server-side coupon validation. Used by the cart/checkout flow
 * to:
 *
 *   1. Confirm the code exists and is active.
 *   2. Enforce `new_users_only` restriction by re-checking the
 *      caller's identity against `orders` server-side. Guests
 *      are rejected outright for new-user coupons (no way to
 *      prove no prior purchases). Cancelled-only history does
 *      NOT count as a prior purchase.
 *   3. Return the discount percent on success.
 *
 * The /api/orders endpoint also reapplies the new_users_only
 * check before computing totals; this route is purely for
 * upfront UX feedback so an ineligible user never gets to the
 * payment page.
 */
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();

    if (!code || typeof code !== 'string') {
      return apiError(400, 'Coupon code is required');
    }

    const admin = createAdminClient();

    const { data: coupon, error } = await admin
      .from('coupons')
      .select('code, discount_percent, is_active, new_users_only')
      .eq('code', code.toUpperCase().trim())
      .eq('is_active', true)
      .maybeSingle();

    if (error || !coupon) {
      return apiError(404, 'Invalid or expired coupon code');
    }

    // New-users-only enforcement.
    if (coupon.new_users_only) {
      // Identify the caller from the session cookies. We use the
      // SSR client (cookie-aware) — admin client would always be
      // anonymous and therefore always reject new-user coupons.
      const ssr = await createServerSupabaseClient();
      const {
        data: { user },
      } = await ssr.auth.getUser();

      if (!user) {
        return apiError(
          403,
          'This coupon is only valid for new accounts. Please sign in to apply it.',
        );
      }

      // Has the user ever placed a non-cancelled order?
      // We use the admin client here so RLS doesn't block the
      // existence check (the user's own orders are visible to
      // them, but using admin keeps this stable if the policy
      // ever tightens).
      const { count, error: countErr } = await admin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .neq('order_status', 'cancelled');

      if (countErr) {
        console.error('[COUPON_VALIDATE_ORDERS_COUNT]', countErr);
        return apiError(500, 'Could not validate coupon. Please try again.');
      }

      if ((count ?? 0) > 0) {
        return apiError(
          403,
          'This coupon is only valid on your first order.',
        );
      }
    }

    return apiSuccess({
      code: coupon.code,
      discount_percent: coupon.discount_percent,
      new_users_only: coupon.new_users_only,
    });
  } catch (err) {
    console.error('[COUPON_VALIDATE_ERROR]', err);
    return apiError(500, 'Internal server error');
  }
}
