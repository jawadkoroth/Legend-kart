import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';
import { createOrderSchema } from '@/lib/validators';
import { generateOrderNumber } from '@/lib/order-id';
import { getRazorpay } from '@/lib/razorpay';
import { sendOrderConfirmation } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. Validate input
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, 'Validation failed', parsed.error.flatten().fieldErrors);
    }

    const { product_id, size, quantity, customer, shipping_address, payment_method, coupon_code } = parsed.data;
    const supabase = createAdminClient();

    // 2. Verify product exists and is active
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, name, price_paise, is_active')
      .eq('id', product_id)
      .single();

    if (productError || !product || !product.is_active) {
      return apiError(404, 'Product not found or unavailable');
    }

    // 3. Validate coupon (if provided)
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

    // 4. Decrement stock (atomic — prevents overselling)
    const { data: stockResult } = await supabase.rpc('decrement_stock', {
      p_product_id: product_id,
      p_size: size,
      p_quantity: quantity,
    });

    if (!stockResult) {
      return apiError(409, 'Size out of stock');
    }

    // 5. Calculate prices
    const unitPrice = product.price_paise;
    const subtotal = unitPrice * quantity;
    const discount = Math.round(subtotal * discountPercent / 100);
    const total = subtotal - discount;

    // 6. Create order
    const orderNumber = generateOrderNumber();
    const orderData = {
      order_number: orderNumber,
      product_id,
      size,
      quantity,
      unit_price_paise: unitPrice,
      subtotal_paise: subtotal,
      discount_paise: discount,
      total_paise: total,
      coupon_code: appliedCoupon || null,
      payment_method,
      payment_status: 'pending',
      order_status: 'pending',
      customer,
      shipping_address,
    };

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderData)
      .select('id, order_number')
      .single();

    if (orderError) {
      // Restore stock on order creation failure
      await supabase.rpc('restore_stock', { p_product_id: product_id, p_size: size, p_quantity: quantity });
      console.error('[ORDER_CREATE_ERROR]', orderError);
      return apiError(500, 'Failed to create order');
    }

    console.log(`[ORDER_CREATED] ${orderNumber} ${payment_method}`);

    // 7. For online payment, create Razorpay order
    if (payment_method === 'online') {
      try {
        const rzp = getRazorpay();
        const rzpOrder = await rzp.orders.create({
          amount: total,
          currency: 'INR',
          receipt: orderNumber,
        });

        await supabase
          .from('orders')
          .update({ razorpay_order_id: rzpOrder.id })
          .eq('id', order.id);

        return apiSuccess({
          order_id: order.id,
          order_number: order.order_number,
          razorpay_order_id: rzpOrder.id,
          amount: total,
          key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          customer,
        }, 201);
      } catch (rzpError) {
        const errMessage = rzpError instanceof Error ? rzpError.message : 'Unknown payment error';
        console.error('[RAZORPAY_ORDER_ERROR]', errMessage, rzpError);
        // Restore stock and cancel order
        await supabase.rpc('restore_stock', { p_product_id: product_id, p_size: size, p_quantity: quantity });
        await supabase.from('orders').update({ order_status: 'cancelled', cancel_reason: `Payment gateway: ${errMessage}` }).eq('id', order.id);

        // Return user-friendly error with debug hint
        const isConfigError = errMessage.includes('not configured') || errMessage.includes('key');
        return apiError(500,
          isConfigError
            ? 'Payment gateway is not configured. Please try COD or contact support.'
            : 'Failed to initialize payment. Please try again or use COD.'
        );
      }
    }

    // 8. COD order — send email (fire-and-forget)
    sendOrderConfirmation({
      id: order.id,
      order_number: orderNumber,
      customer,
      product_name: product.name,
      size,
      total_paise: total,
      payment_method,
    }).catch(() => {});

    return apiSuccess({
      order_id: order.id,
      order_number: order.order_number,
    }, 201);
  } catch (err) {
    console.error('[ORDER_ERROR]', err);
    return apiError(500, 'Internal server error');
  }
}
