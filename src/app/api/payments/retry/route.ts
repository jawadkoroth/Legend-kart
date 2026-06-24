import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';
import { getRazorpay } from '@/lib/razorpay';
import { canAccessOrder } from '@/lib/orders/assertOrderAccess';

export async function POST(req: NextRequest) {
  try {
    const { order_id } = await req.json();

    if (!order_id) {
      return apiError(400, 'Missing order_id');
    }

    const supabase = createAdminClient();

    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .single();

    if (error || !order) {
      return apiError(404, 'Order not found');
    }

    // IDOR gate: account orders are owner-only; guest orders stay
    // accessible by UUID. This endpoint otherwise leaks customer PII and
    // lets anyone churn Razorpay order creation for arbitrary order ids.
    if (!(await canAccessOrder(order.user_id))) {
      return apiError(404, 'Order not found');
    }

    if (order.payment_method !== 'online') {
      return apiError(400, 'Not an online payment order');
    }
    if (order.payment_status === 'paid') {
      return apiError(400, 'Already paid');
    }
    if (order.order_status === 'cancelled') {
      return apiError(400, 'Order cancelled');
    }
    // Normalize once — legacy rows may have a null retry_count, where
    // `null >= 3` is false and `null + 1` is 1, both misleading.
    const retryCount = order.retry_count ?? 0;
    if (retryCount >= 3) {
      return apiError(400, 'Maximum retries exceeded. Please contact support.');
    }

    // Create new Razorpay order
    const rzp = getRazorpay();
    const rzpOrder = await rzp.orders.create({
      amount: order.total_paise,
      currency: 'INR',
      receipt: order.order_number,
    });

    // Update order
    await supabase
      .from('orders')
      .update({
        razorpay_order_id: rzpOrder.id,
        retry_count: retryCount + 1,
      })
      .eq('id', order_id);

    console.log(`[PAYMENT_RETRY] ${order.order_number} attempt ${retryCount + 1}`);

    return apiSuccess({
      razorpay_order_id: rzpOrder.id,
      amount: order.total_paise,
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      customer: order.customer,
    });
  } catch (err) {
    console.error('[PAYMENT_RETRY_ERROR]', err);
    return apiError(500, 'Internal server error');
  }
}
