import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface OrderEmailData {
  id: string;
  order_number: string;
  customer: { name: string; phone: string; email?: string };
  product_name: string;
  size: string;
  total_paise: number;
  payment_method: string;
}

/**
 * Send order confirmation email.
 * Non-blocking: failures are logged but never block the order flow.
 * Skips silently if customer has no email.
 */
export async function sendOrderConfirmation(order: OrderEmailData): Promise<void> {
  if (!order.customer.email) {
    console.log(`[EMAIL_SKIP] No email for order ${order.order_number}`);
    return;
  }

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'NOIR <onboarding@resend.dev>',
      to: order.customer.email,
      subject: `Order Confirmed — ${order.order_number}`,
      html: `
        <div style="background:#0B0B0B;color:#F5F5F5;padding:40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;">
          <h1 style="color:#F5F5F5;font-size:24px;margin-bottom:8px;">Order Confirmed ✓</h1>
          <p style="color:#CFCFCF;margin-bottom:24px;">Thank you for your order, ${order.customer.name}.</p>
          <div style="background:#1A1A1A;padding:20px;border-radius:8px;margin-bottom:24px;">
            <p style="margin:0 0 8px;"><strong>Order:</strong> ${order.order_number}</p>
            <p style="margin:0 0 8px;"><strong>Product:</strong> ${order.product_name} — Size ${order.size}</p>
            <p style="margin:0 0 8px;"><strong>Total:</strong> ₹${(order.total_paise / 100).toLocaleString('en-IN')}</p>
            <p style="margin:0;"><strong>Payment:</strong> ${order.payment_method === 'cod' ? 'Cash on Delivery' : 'Paid Online'}</p>
          </div>
          <p style="color:#CFCFCF;font-size:14px;">
            Track your order:
            <a href="${process.env.NEXT_PUBLIC_URL || 'https://legend-kart.vercel.app'}/order/${order.id}" style="color:#F5F5F5;text-decoration:underline;">Click here</a>
          </p>
        </div>
      `,
    });
    console.log(`[EMAIL_SENT] Order ${order.order_number}`);
  } catch (err) {
    console.error(`[EMAIL_FAILED] Order ${order.order_number}:`, err);
  }
}
