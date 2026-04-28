/**
 * Minimal structured logger for server-side events.
 *
 * Emits a single JSON line per call so logs are trivially grep-able
 * and ingestible by any log platform (Vercel, Datadog, Logtail, ...).
 *
 * Usage:
 *   logEvent('order.created', { order_id, payment_method });
 *   logEvent('payment.webhook_bad_signature', { reason });
 *
 * Errors should be passed via `data.error` as a string; we don't
 * `JSON.stringify` Error objects automatically because their stack
 * is rarely useful in structured pipelines.
 */
export function logEvent(
  event: string,
  data?: Record<string, unknown>,
): void {
  try {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event,
        ...(data ?? {}),
      }),
    );
  } catch {
    // Last-ditch fallback if `data` contains a circular reference.
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event,
        log_serialization_failed: true,
      }),
    );
  }
}
