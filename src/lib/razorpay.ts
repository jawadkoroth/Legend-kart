import Razorpay from 'razorpay';
import crypto from 'crypto';

let razorpayInstance: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    console.error('[RAZORPAY_CONFIG] Missing keys:', {
      hasKeyId: !!keyId,
      hasKeySecret: !!keySecret,
    });
    throw new Error('Razorpay API keys not configured. Check NEXT_PUBLIC_RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment variables.');
  }

  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }
  return razorpayInstance;
}

/**
 * Verify Razorpay payment signature using HMAC-SHA256.
 * This is CRITICAL for payment security — never skip this.
 */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    console.error('[RAZORPAY_VERIFY] RAZORPAY_KEY_SECRET not set');
    return false;
  }

  if (!orderId || !paymentId || !signature) {
    return false;
  }

  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(body)
    .digest('hex');

  // Timing-safe comparison — a plain `===` short-circuits on the first
  // differing byte and leaks signature bytes via response timing.
  const expectedBuf = Buffer.from(expectedSignature, 'hex');
  let providedBuf: Buffer;
  try {
    providedBuf = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
