import { Resend } from 'resend';
import { logEvent } from '@/lib/log';
import { getPublicUrl } from '@/lib/media';

/**
 * NOIR — order lifecycle email module (v1).
 *
 * Design constraints:
 *   - Lazy Resend client so a missing RESEND_API_KEY does not break
 *     the build OR the API path. Sends are skipped with a single
 *     `[EMAIL_SKIP]` log line and the call resolves successfully.
 *   - Every public function is fire-and-forget safe: callers wrap in
 *     `.catch(() => {})` and our internal `dispatch()` swallows all
 *     send errors after logging via `logEvent`.
 *   - Single shared HTML template for visual consistency across
 *     all four lifecycle emails. Dark surface, gold accent (#C9A86A),
 *     simple inline styles only — no external CSS, no heavy MJML.
 *   - Future channels (SMS / WhatsApp / marketing) plug in alongside
 *     this module under `src/lib/email/` (or `src/lib/notifications/`).
 *     This file owns ONLY transactional email. No queues, no workers.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface OrderEmailAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}

export interface OrderEmailData {
  id: string;
  order_number: string;
  customer: { name: string; phone: string; email?: string };
  product_name: string;
  size: string;
  quantity?: number;
  /**
   * All-inclusive amount charged (subtotal − discount + shipping
   * + cod_fee). This is the authoritative total and is shown as
   * the final "Total" row in every template.
   */
  total_paise: number;
  /**
   * Optional breakdown components. When provided AND non-zero, an
   * extra row is rendered above the total. Omitting them (legacy
   * call sites, historic orders without the new columns) yields
   * the original compact "Order / Total / Payment" summary so
   * backward compatibility holds.
   */
  subtotal_paise?: number | null;
  shipping_paise?: number | null;
  cod_fee_paise?: number | null;
  discount_paise?: number | null;
  payment_method: string; // 'cod' | 'online'
  shipping_address?: OrderEmailAddress;
  /**
   * Optional product image. Relative paths are normalised to
   * absolute (prepended with NEXT_PUBLIC_URL) so they render in
   * email clients that block relative srcs. When missing or empty
   * the template falls back to an initials tile, never blocking the
   * send.
   */
  image_url?: string | null;
  /**
   * Optional full line-item array for multi-line orders. Populated
   * by every B2 enqueue site from the `order_items` table. The
   * current template still renders the single-line `product_name /
   * size / quantity / image_url` block above the summary card —
   * phase B4 will extend the template to render an items table when
   * `items` has more than one entry. Single-line orders render
   * identically before and after B4 because the legacy fields above
   * mirror items[0].
   */
  items?: Array<{
    name: string;
    size: string;
    quantity: number;
    unit_price_paise: number;
    subtotal_paise: number;
    image_url?: string | null;
  }>;
}

export type OrderStatusForEmail =
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

/* ------------------------------------------------------------------ */
/* Lazy Resend client                                                  */
/* ------------------------------------------------------------------ */

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (resendClient) return resendClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  resendClient = new Resend(key);
  return resendClient;
}

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://legend-kart.vercel.app'
  );
}

const formatPrice = (paise: number) =>
  '₹' + (paise / 100).toLocaleString('en-IN');

/* ------------------------------------------------------------------ */
/* Shared HTML template                                                */
/* ------------------------------------------------------------------ */

interface RenderOpts {
  heading: string;
  intro: string;
  /** Optional accent line above heading, e.g. "Payment Confirmed". */
  eyebrow?: string;
  /** Optional item block (thumb + product/size/qty) rendered above summary. */
  item?: { name: string; size: string; quantity: number; image_url?: string | null };
  /** Order summary rows rendered in the dark inner card. */
  summary: { label: string; value: string }[];
  /** Address block (string lines) rendered in its own subtle card. */
  address?: string[];
  /** Closing paragraph text, e.g. retry guidance. */
  outro?: string;
  cta?: { label: string; href: string };
}

function renderEmail(opts: RenderOpts): string {
  const { heading, intro, eyebrow, item, summary, address, outro, cta } = opts;

  const itemBlock = item ? renderItemBlock(item) : '';

  const summaryRows = summary
    .map(
      (row) => `
        <tr>
          <td style="padding:6px 0;color:#9A9A9A;font-size:13px;">${escapeHtml(row.label)}</td>
          <td style="padding:6px 0;color:#F5F5F5;font-size:13px;text-align:right;">${escapeHtml(row.value)}</td>
        </tr>`,
    )
    .join('');

  const addressBlock =
    address && address.length > 0
      ? `
        <div style="background:#101012;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px 18px;margin-top:14px;">
          <p style="margin:0 0 6px;color:#9A9A9A;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Delivery address</p>
          ${address
        .map(
          (line) =>
            `<p style="margin:2px 0;color:#F5F5F5;font-size:13px;line-height:1.5;">${escapeHtml(line)}</p>`,
        )
        .join('')}
        </div>`
      : '';

  const ctaBlock = cta
    ? `
      <div style="text-align:center;margin:28px 0 12px;">
        <a href="${escapeAttr(cta.href)}"
           style="display:inline-block;padding:12px 28px;background:#C9A86A;color:#0B0B0B;text-decoration:none;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;border-radius:999px;">
          ${escapeHtml(cta.label)}
        </a>
      </div>`
    : '';

  const outroBlock = outro
    ? `<p style="margin:18px 0 0;color:#9A9A9A;font-size:13px;line-height:1.55;">${escapeHtml(outro)}</p>`
    : '';

  const eyebrowBlock = eyebrow
    ? `<p style="margin:0 0 8px;color:#C9A86A;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;font-weight:600;">${escapeHtml(eyebrow)}</p>`
    : '';

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#070708;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070708;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0B0B0B;border:1px solid rgba(255,255,255,0.06);border-radius:14px;overflow:hidden;">
            <!-- Header / wordmark -->
            <tr>
              <td style="padding:28px 28px 0;text-align:center;">
                <p style="margin:0;font-family:Georgia,'Playfair Display',serif;font-size:22px;letter-spacing:0.32em;color:#F5F5F5;">NOIR</p>
                <div style="height:1px;background:rgba(255,255,255,0.06);margin:24px 0 0;"></div>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:28px;">
                ${eyebrowBlock}
                <h1 style="margin:0 0 10px;font-family:Georgia,'Playfair Display',serif;font-size:22px;font-weight:500;color:#F5F5F5;letter-spacing:-0.01em;">${escapeHtml(heading)}</h1>
                <p style="margin:0;color:#CFCFCF;font-size:14px;line-height:1.6;">${escapeHtml(intro)}</p>

                ${itemBlock}

                <!-- Summary card -->
                <div style="background:#101012;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:18px 20px;margin-top:14px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${summaryRows}
                  </table>
                </div>

                ${addressBlock}

                ${ctaBlock}

                ${outroBlock}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:0 28px 28px;">
                <div style="height:1px;background:rgba(255,255,255,0.06);margin:0 0 16px;"></div>
                <p style="margin:0;color:#6A6A6A;font-size:11px;line-height:1.6;text-align:center;">
                  This is an automated message from NOIR.<br />
                  If you have any questions, simply reply to this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/**
 * Normalise an image URL for inclusion in email HTML.
 *
 *  - Absolute http(s) and protocol-relative URLs pass through.
 *  - Relative paths (e.g. "/images/foo.jpg") are prefixed with the
 *    site origin so email clients (which strip <base>) can resolve
 *    them.
 *  - Anything else (data:, javascript:, blank, malformed) yields
 *    null — the template falls back to initials.
 */
function normaliseImageUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('/')) return `${siteUrl().replace(/\/$/, '')}${trimmed}`;
  // Supabase storage relative path (e.g. "products/uuid.jpg")
  const resolved = getPublicUrl(trimmed);
  if (resolved && /^https?:\/\//i.test(resolved)) return resolved;
  return null;
}

/**
 * Renders a small product header above the summary card: 64px square
 * thumbnail (or initials tile fallback) on the left, product name +
 * "Size X · Qty N" on the right. Pure inline-styled HTML for email
 * client compatibility (Gmail / Outlook / Apple Mail).
 */
function renderItemBlock(item: {
  name: string;
  size: string;
  quantity: number;
  image_url?: string | null;
}): string {
  const url = normaliseImageUrl(item.image_url);
  const initials = (item.name || 'N').trim().charAt(0).toUpperCase() || 'N';
  const qtyText = item.quantity > 1 ? ` · Qty ${item.quantity}` : '';
  const meta = `Size ${escapeHtml(item.size)}${escapeHtml(qtyText)}`;

  const thumb = url
    ? `<img src="${escapeAttr(url)}" alt="" width="64" height="64"
            style="display:block;width:64px;height:64px;border-radius:8px;object-fit:cover;border:1px solid rgba(201,168,106,0.35);background:#0F0F11;" />`
    : `<div style="width:64px;height:64px;border-radius:8px;background:#0F0F11;border:1px solid rgba(201,168,106,0.35);color:#C9A86A;font-family:Georgia,'Playfair Display',serif;font-size:24px;line-height:64px;text-align:center;font-weight:500;">${escapeHtml(initials)}</div>`;

  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;">
          <tr>
            <td width="64" valign="top" style="width:64px;padding-right:14px;">${thumb}</td>
            <td valign="middle" style="vertical-align:middle;">
              <p style="margin:0 0 4px;color:#F5F5F5;font-size:14px;font-weight:500;line-height:1.4;">${escapeHtml(item.name)}</p>
              <p style="margin:0;color:#9A9A9A;font-size:12px;letter-spacing:0.04em;">${meta}</p>
            </td>
          </tr>
        </table>`;
}

/* ------------------------------------------------------------------ */
/* Internal dispatch                                                   */
/* ------------------------------------------------------------------ */

interface DispatchOpts {
  /** A short identifier used in logs, e.g. 'order.created'. */
  kind: string;
  to: string | undefined;
  subject: string;
  html: string;
  /** Order number for log context. */
  orderNumber: string;
}

async function dispatch(opts: DispatchOpts): Promise<void> {
  const { kind, to, subject, html, orderNumber } = opts;

  if (!to) {
    console.log(
      `[EMAIL_SKIP] ${kind}: no recipient email for order ${orderNumber}`,
    );
    return;
  }

  const resend = getResend();
  if (!resend) {
    console.log(
      `[EMAIL_SKIP] ${kind}: RESEND_API_KEY not configured (order ${orderNumber})`,
    );
    return;
  }

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'NOIR <onboarding@resend.dev>',
      to,
      subject,
      html,
    });
    console.log(`[EMAIL_SENT] ${kind} order ${orderNumber}`);
  } catch (err) {
    // Never throw: callers are fire-and-forget.
    logEvent('email.failed', {
      kind,
      order_number: orderNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    console.error(`[EMAIL_FAILED] ${kind} order ${orderNumber}:`, err);
  }
}

function addressLines(addr?: OrderEmailAddress): string[] {
  if (!addr) return [];
  const line1 = [addr.line1, addr.line2].filter(Boolean).join(', ');
  const line2 = `${addr.city}, ${addr.state} ${addr.pincode}`;
  return [line1, line2];
}

function viewOrderHref(orderId: string): string {
  return `${siteUrl()}/order/${orderId}`;
}

function paymentLabel(method: string): string {
  return method === 'cod' ? 'Cash on Delivery' : 'Online';
}

function commonSummary(order: OrderEmailData): { label: string; value: string }[] {
  // Item now lives in its own visual block above the summary card,
  // so the summary stays compact and scannable. When fee breakdown
  // fields are supplied we render additional rows above the total;
  // otherwise the compact legacy format is preserved verbatim.
  const rows: { label: string; value: string }[] = [
    { label: 'Order', value: order.order_number },
  ];

  const hasBreakdown =
    (typeof order.subtotal_paise === 'number' && order.subtotal_paise > 0) ||
    (typeof order.shipping_paise === 'number' && order.shipping_paise > 0) ||
    (typeof order.cod_fee_paise === 'number' && order.cod_fee_paise > 0) ||
    (typeof order.discount_paise === 'number' && order.discount_paise > 0);

  if (hasBreakdown) {
    if (typeof order.subtotal_paise === 'number' && order.subtotal_paise > 0) {
      rows.push({ label: 'Subtotal', value: formatPrice(order.subtotal_paise) });
    }
    if (typeof order.discount_paise === 'number' && order.discount_paise > 0) {
      rows.push({ label: 'Discount', value: `− ${formatPrice(order.discount_paise)}` });
    }
    if (typeof order.shipping_paise === 'number' && order.shipping_paise > 0) {
      rows.push({ label: 'Shipping', value: formatPrice(order.shipping_paise) });
    }
    if (typeof order.cod_fee_paise === 'number' && order.cod_fee_paise > 0) {
      rows.push({ label: 'COD fee', value: formatPrice(order.cod_fee_paise) });
    }
  }

  rows.push({ label: 'Total', value: formatPrice(order.total_paise) });
  rows.push({ label: 'Payment', value: paymentLabel(order.payment_method) });
  return rows;
}

function itemForEmail(order: OrderEmailData): {
  name: string;
  size: string;
  quantity: number;
  image_url?: string | null;
} {
  return {
    name: order.product_name,
    size: order.size,
    quantity: order.quantity ?? 1,
    image_url: order.image_url,
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Sent immediately after an order is created (both COD and online).
 * Online orders receive this BEFORE payment is captured — a separate
 * `sendPaymentSuccessEmail` follows once the webhook confirms.
 */
export async function sendOrderCreatedEmail(order: OrderEmailData): Promise<void> {
  const html = renderEmail({
    eyebrow: 'Order received',
    heading: `Thank you, ${order.customer.name}`,
    intro:
      order.payment_method === 'cod'
        ? 'Your order has been placed. We will reach out before dispatch to confirm your address.'
        : 'Your order has been placed. We are confirming your payment and will email you again once it is captured.',
    item: itemForEmail(order),
    summary: commonSummary(order),
    address: addressLines(order.shipping_address),
    cta: { label: 'View order', href: viewOrderHref(order.id) },
  });

  await dispatch({
    kind: 'order.created',
    to: order.customer.email,
    subject: `Order received — ${order.order_number}`,
    html,
    orderNumber: order.order_number,
  });
}

/**
 * Sent from the Razorpay webhook on a genuine pending → paid
 * transition. The `/api/payments/verify` browser fast-path does NOT
 * send email — the webhook is the single source of truth for payment
 * lifecycle email, so we cannot double-send on the verify-vs-webhook
 * race.
 */
export async function sendPaymentSuccessEmail(order: OrderEmailData): Promise<void> {
  const html = renderEmail({
    eyebrow: 'Payment confirmed',
    heading: 'Payment received',
    intro: `Your payment for order ${order.order_number} has been captured. We are preparing it for dispatch.`,
    item: itemForEmail(order),
    summary: commonSummary(order),
    address: addressLines(order.shipping_address),
    cta: { label: 'View order', href: viewOrderHref(order.id) },
  });

  await dispatch({
    kind: 'payment.success',
    to: order.customer.email,
    subject: `Payment confirmed — ${order.order_number}`,
    html,
    orderNumber: order.order_number,
  });
}

/**
 * Sent from the Razorpay webhook on a genuine pending → failed
 * transition. CTA points to the order page where the user can retry.
 */
export async function sendPaymentFailedEmail(order: OrderEmailData): Promise<void> {
  const html = renderEmail({
    eyebrow: 'Payment failed',
    heading: 'We could not capture your payment',
    intro: `Your payment for order ${order.order_number} did not go through. The order is on hold and stock has been released.`,
    item: itemForEmail(order),
    summary: commonSummary(order),
    outro:
      'You can retry payment from the order page. If the amount was debited from your account, it will be refunded by your bank within 5–7 business days.',
    cta: { label: 'Retry payment', href: viewOrderHref(order.id) },
  });

  await dispatch({
    kind: 'payment.failed',
    to: order.customer.email,
    subject: `Payment failed — ${order.order_number}`,
    html,
    orderNumber: order.order_number,
  });
}

/**
 * Sent when an admin moves the order through the fulfilment timeline:
 * confirmed → shipped → delivered, OR cancels it.
 */
export async function sendOrderStatusEmail(
  order: OrderEmailData,
  status: OrderStatusForEmail,
): Promise<void> {
  const presets: Record<
    OrderStatusForEmail,
    { eyebrow: string; heading: string; intro: string; outro?: string }
  > = {
    confirmed: {
      eyebrow: 'Order confirmed',
      heading: 'Your order is confirmed',
      intro: `We have confirmed order ${order.order_number}. We will dispatch it shortly.`,
    },
    shipped: {
      eyebrow: 'Shipped',
      heading: 'Your order is on its way',
      intro: `Order ${order.order_number} has been handed over to our courier.`,
      outro: 'You can track its progress from the order page.',
    },
    delivered: {
      eyebrow: 'Delivered',
      heading: 'Your order has been delivered',
      intro: `Order ${order.order_number} has been delivered. We hope you love it.`,
      outro: 'If anything is not right, simply reply to this email and we will make it right.',
    },
    cancelled: {
      eyebrow: 'Cancelled',
      heading: 'Your order has been cancelled',
      intro: `Order ${order.order_number} has been cancelled. Any captured amount will be refunded by your bank within 5–7 business days.`,
    },
  };

  const preset = presets[status];

  const html = renderEmail({
    eyebrow: preset.eyebrow,
    heading: preset.heading,
    intro: preset.intro,
    item: itemForEmail(order),
    summary: commonSummary(order),
    address: status === 'cancelled' ? undefined : addressLines(order.shipping_address),
    outro: preset.outro,
    cta: { label: 'View order', href: viewOrderHref(order.id) },
  });

  await dispatch({
    kind: `order.${status}`,
    to: order.customer.email,
    subject: `${preset.eyebrow} — ${order.order_number}`,
    html,
    orderNumber: order.order_number,
  });
}

/* ------------------------------------------------------------------ */
/* Back-compat                                                         */
/* ------------------------------------------------------------------ */

/**
 * Back-compat alias for the old `sendOrderConfirmation(order)` import
 * used by `/api/orders` and `/api/payments/verify`. Maps to the new
 * `sendOrderCreatedEmail`. Existing call sites keep compiling; new
 * code should import the explicit name.
 */
export const sendOrderConfirmation = sendOrderCreatedEmail;
