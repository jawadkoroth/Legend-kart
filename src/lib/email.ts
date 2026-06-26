/**
 * Stable public surface for the email subsystem.
 *
 * The implementation lives in `src/lib/email/sendOrderEmail.ts` (so
 * other channels — SMS, WhatsApp, marketing — can sit alongside it
 * under `src/lib/email/`). This shim re-exports the public functions
 * so existing call sites that do `import { sendOrderConfirmation }
 * from '@/lib/email'` keep working unchanged.
 */
export {
  sendOrderCreatedEmail,
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendOrderStatusEmail,
  sendOrderConfirmation,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendReturnEmail,
  sendExchangeEmail,
} from './email/sendOrderEmail';

export type {
  OrderEmailData,
  OrderEmailAddress,
  OrderStatusForEmail,
} from './email/sendOrderEmail';
