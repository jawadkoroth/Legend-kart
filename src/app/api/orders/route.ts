import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { createOrderSchema } from '@/lib/validators';
import { generateOrderNumber } from '@/lib/order-id';
import { getRazorpay } from '@/lib/razorpay';
import { sendOrderConfirmation } from '@/lib/email';
import { logEvent } from '@/lib/log';

/**
 * POST /api/orders
 *
 * Idempotent + atomic order creation.
 *
 *  - The client supplies `client_request_id` (UUID v4) per submit
 *    attempt. A retry with the same id returns the existing order
 *    instead of creating a duplicate or double-decrementing stock.
 *  - The decrement + insert pair runs inside `create_order_atomic`,
 *    a PL/pgSQL function that holds them in one transaction. On
 *    insufficient stock the function raises STOCK_UNAVAILABLE and
 *    the surrounding transaction rolls back automatically — no
 *    leaked inventory.
 *  - For online payment the Razorpay order is created AFTER the DB
 *    row exists. If Razorpay fails we mark the order cancelled and
 *    restore stock; the order row stays for support traceability.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. Validate input (now includes `client_request_id`).
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      logEvent('order.validation_failed', {
        errors: parsed.error.flatten().fieldErrors,
      });
      return apiError(
        400,
        'Validation failed',
        parsed.error.flatten().fieldErrors,
      );
    }

    const {
      product_id,
      size,
      quantity,
      customer,
      shipping_address,
      payment_method,
      coupon_code,
      client_request_id,
    } = parsed.data;
    const supabase = createAdminClient();

    // Resolve the SSR-bound auth session (cookies). Logged-in users
    // get their `auth.uid()` recorded on the order so /orders can
    // filter by ownership; guests stay NULL and continue to work
    // unchanged. We use a separate cookie-bound client for this
    // read — the admin client has no session and would always
    // return null user.
    let userId: string | null = null;
    try {
      const ssr = await createServerSupabaseClient();
      const {
        data: { user },
      } = await ssr.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      // Auth lookup must never block order creation; guest fallback.
      userId = null;
    }

    // 2. Verify product exists and is active.
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, name, price_paise, is_active')
      .eq('id', product_id)
      .single();

    if (productError || !product || !product.is_active) {
      logEvent('order.product_unavailable', { product_id });
      return apiError(404, 'Product not found or unavailable');
    }

    // 3. Resolve coupon (best-effort; invalid codes silently no-op).
    let discountPercent = 0;
    let appliedCoupon = '';

    if (coupon_code && coupon_code.trim()) {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('code, discount_percent, is_active')
        .eq('code', coupon_code.toUpperCase())
        .eq('is_active', true)
        .single();

      if (coupon) {
        discountPercent = coupon.discount_percent;
        appliedCoupon = coupon.code;
      }
    }

    // 4. Compute totals.
    const unitPrice = product.price_paise;
    const subtotal = unitPrice * quantity;
    const discount = Math.round((subtotal * discountPercent) / 100);
    const total = subtotal - discount;

    // 5. Atomic create-or-replay via SQL function.
    const orderNumber = generateOrderNumber();
    const { data: rpcRows, error: rpcError } = await supabase.rpc(
      'create_order_atomic',
      {
        p_client_request_id: client_request_id,
        p_order_number: orderNumber,
        p_product_id: product_id,
        p_size: size,
        p_quantity: quantity,
        p_unit_price_paise: unitPrice,
        p_subtotal_paise: subtotal,
        p_discount_paise: discount,
        p_total_paise: total,
        p_coupon_code: appliedCoupon,
        p_payment_method: payment_method,
        p_customer: customer,
        p_shipping_address: shipping_address,
        p_user_id: userId,
      },
    );

    if (rpcError) {
      // PL/pgSQL `RAISE EXCEPTION 'STOCK_UNAVAILABLE'` surfaces here.
      const msg = rpcError.message || '';
      if (msg.includes('STOCK_UNAVAILABLE')) {
        logEvent('order.stock_failed', { product_id, size, quantity });
        return apiError(409, 'Size out of stock');
      }
      logEvent('order.create_failed', {
        error: msg,
        client_request_id,
      });
      return apiError(500, 'Failed to create order');
    }

    const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (!row || !row.order_id) {
      logEvent('order.create_failed', {
        error: 'rpc_returned_empty',
        client_request_id,
      });
      return apiError(500, 'Failed to create order');
    }

    const orderId: string = row.order_id;
    const finalOrderNumber: string = row.order_number;
    const wasExisting: boolean = Boolean(row.was_existing);

    if (wasExisting) {
      logEvent('order.idempotent_replay', {
        order_id: orderId,
        order_number: finalOrderNumber,
        client_request_id,
      });
    } else {
      logEvent('order.created', {
        order_id: orderId,
        order_number: finalOrderNumber,
        payment_method,
        total_paise: total,
      });
    }

    // 6. Online payment: create Razorpay order.
    //
    // For an idempotent replay where a Razorpay order was already
    // created, fetch the existing one rather than creating a second.
    if (payment_method === 'online') {
      let razorpayOrderId: string | null = null;

      if (wasExisting) {
        const { data: existing } = await supabase
          .from('orders')
          .select('razorpay_order_id, payment_status')
          .eq('id', orderId)
          .single();
        if (existing?.razorpay_order_id) {
          razorpayOrderId = existing.razorpay_order_id;
        }
      }

      if (!razorpayOrderId) {
        try {
          const rzp = getRazorpay();
          const rzpOrder = await rzp.orders.create({
            amount: total,
            currency: 'INR',
            receipt: finalOrderNumber,
          });
          razorpayOrderId = rzpOrder.id;

          await supabase
            .from('orders')
            .update({ razorpay_order_id: rzpOrder.id })
            .eq('id', orderId);
        } catch (rzpError) {
          const errMessage =
            rzpError instanceof Error ? rzpError.message : 'Unknown payment error';
          logEvent('payment.razorpay_create_failed', {
            order_id: orderId,
            error: errMessage,
          });
          // Restore stock and cancel the order. We only do this for
          // a fresh creation; on replay the order's existing state
          // is already correct.
          if (!wasExisting) {
            await supabase.rpc('restore_stock', {
              p_product_id: product_id,
              p_size: size,
              p_quantity: quantity,
            });
            await supabase
              .from('orders')
              .update({
                order_status: 'cancelled',
                payment_status: 'failed',
                cancel_reason: `Payment gateway: ${errMessage}`,
              })
              .eq('id', orderId);
          }

          const isConfigError =
            errMessage.includes('not configured') || errMessage.includes('key');
          return apiError(
            500,
            isConfigError
              ? 'Payment gateway is not configured. Please try COD or contact support.'
              : 'Failed to initialize payment. Please try again or use COD.',
          );
        }
      }

      return apiSuccess(
        {
          order_id: orderId,
          order_number: finalOrderNumber,
          razorpay_order_id: razorpayOrderId,
          amount: total,
          key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          customer,
          idempotent_replay: wasExisting,
        },
        wasExisting ? 200 : 201,
      );
    }

    // 7. COD: send confirmation email (fire-and-forget, only on
    // first creation — replays already sent it).
    if (!wasExisting) {
      sendOrderConfirmation({
        id: orderId,
        order_number: finalOrderNumber,
        customer,
        product_name: product.name,
        size,
        total_paise: total,
        payment_method,
      }).catch(() => { });
    }

    return apiSuccess(
      {
        order_id: orderId,
        order_number: finalOrderNumber,
        idempotent_replay: wasExisting,
      },
      wasExisting ? 200 : 201,
    );
  } catch (err) {
    logEvent('order.unhandled_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return apiError(500, 'Internal server error');
  }
}
