import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';
import { verifyPaymentSignature } from '@/lib/razorpay';
import { sendOrderConfirmation } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const { order_id, razorpay_payment_id, razorpay_signature } = await req.json();

    if (!order_id || !razorpay_payment_id || !razorpay_signature) {
      return apiError(400, 'Missing required fields');
    }

    const supabase = createAdminClient();

    // 1. Get order
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .single();

    if (error || !order) {
      return apiError(404, 'Order not found');
    }

    if (order.payment_status === 'paid') {
      return apiSuccess({ message: 'Payment already verified' });
    }

    // 2. Verify signature
    const isValid = verifyPaymentSignature(
      order.razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValid) {
      console.error('[PAYMENT_FAILED] Invalid signature for order', order.order_number);
      await supabase
        .from('orders')
        .update({ payment_status: 'failed' })
        .eq('id', order_id);

      // Restore stock on payment failure
      await supabase.rpc('restore_stock', {
        p_product_id: order.product_id,
        p_size: order.size,
        p_quantity: order.quantity,
      });

      return apiError(400, 'Payment verification failed');
    }

    // 3. Mark as paid
    await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        razorpay_payment_id,
        razorpay_signature,
      })
      .eq('id', order_id);

    console.log(`[PAYMENT_SUCCESS] ${order.order_number}`);

    // 4. Send email (fire-and-forget)
    const { data: product } = await supabase
      .from('products')
      .select('name')
      .eq('id', order.product_id)
      .single();

    sendOrderConfirmation({
      id: order.id,
      order_number: order.order_number,
      customer: order.customer,
      product_name: product?.name || '',
      size: order.size,
      total_paise: order.total_paise,
      payment_method: order.payment_method,
    }).catch(() => {});

    return apiSuccess({ message: 'Payment verified successfully' });
  } catch (err) {
    console.error('[PAYMENT_VERIFY_ERROR]', err);
    return apiError(500, 'Internal server error');
  }
}
