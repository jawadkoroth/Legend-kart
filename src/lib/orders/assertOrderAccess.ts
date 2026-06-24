import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Ownership gate for order-scoped endpoints that load an order via the
 * admin (service-role) client.
 *
 * Orders fall into two classes:
 *
 *   - **Account orders** (`user_id` set): placed while logged in. These
 *     must only be readable by their owner. Without this check, anyone
 *     holding the order UUID — which leaks via Referer headers, server
 *     logs, shared links, browser history — could read the customer's
 *     name, phone, email and full shipping address (IDOR).
 *
 *   - **Guest orders** (`user_id` null): placed without an account. There
 *     is no session to bind to, so the unguessable order UUID is itself
 *     the bearer credential. We allow these through unchanged so the
 *     post-checkout confirmation page keeps working for guests.
 *
 * Returns true when access is allowed. Callers should respond with a
 * generic 404 on false so the endpoint never reveals whether an id that
 * the caller is not allowed to see actually exists.
 */
export async function canAccessOrder(
  orderUserId: string | null | undefined,
): Promise<boolean> {
  // Guest order — UUID is the only credential, nothing to bind to.
  if (!orderUserId) return true;

  try {
    const ssr = await createServerSupabaseClient();
    const {
      data: { user },
    } = await ssr.auth.getUser();
    return !!user && user.id === orderUserId;
  } catch {
    // If we cannot resolve a session for an account-bound order, fail
    // closed — better a logged-in owner re-auths than PII leaks.
    return false;
  }
}
