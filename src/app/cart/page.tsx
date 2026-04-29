'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart, type CartValidationResult } from '@/lib/cart';
import { formatPaise } from '@/lib/format';
import styles from './page.module.css';

/**
 * Cart page.
 *
 * On mount, re-validates the cart against live inventory by POSTing
 * the current line items to `/api/cart/validate`. The provider then
 * removes inactive products outright and clamps quantities to the
 * server-reported `maxStock`. If the route fails for any reason
 * (network, 5xx, parse error) we keep the cart fully usable on the
 * snapshot and surface a soft, non-blocking warning — checkout will
 * revalidate again before the order POST, and the database remains
 * the final inventory gate.
 */
export default function CartPage() {
  const router = useRouter();
  const { items, removeItem, updateQuantity, totalPaise, applyValidation } =
    useCart();

  // `isValidating` starts true whenever the cart has anything in it,
  // so the very first paint after mount has the checkout button
  // disabled — closing the race window where a fast tapper on a slow
  // mobile network could click PROCEED before the validate effect has
  // even scheduled. The effect flips this back to false on completion.
  const [isValidating, setIsValidating] = useState(
    () => items.length > 0,
  );
  const [adjusted, setAdjusted] = useState<{
    removed: string[];
    clamped: string[];
  } | null>(null);
  const [softWarning, setSoftWarning] = useState(false);
  const [isRouting, setIsRouting] = useState(false);

  // The current in-flight validation promise (if any). handleCheckout
  // ALWAYS awaits this before navigating — so even if the user taps
  // the button before the effect's promise has begun, the click path
  // resolves on the same outcome the UI sees. validationOkRef tracks
  // the outcome of the most recent attempt: true means we have fresh
  // server-confirmed stock data, false means it failed (network / 5xx)
  // and we must NOT navigate.
  const validationPromiseRef = useRef<Promise<void> | null>(null);
  const validationOkRef = useRef<boolean>(false);

  // True when any line in the cart is currently unsellable
  // (maxStock <= 0). Belt-and-braces: applyValidation already drops
  // these lines, but a stale localStorage entry written before this
  // build could still surface a maxStock=0 row that escaped the
  // server round-trip (e.g. validate request failed). The checkout
  // button is gated on this so the user can never proceed with a
  // ghost item, even if the validate fetch has not landed yet.
  const cartInvalid = useMemo(
    () => items.some(line => line.maxStock <= 0),
    [items],
  );

  // Sticky flag so we can show the “all your items became unavailable”
  // empty-state copy after applyValidation has just emptied the cart.
  // Kept across the items.length === 0 early-return below.
  const [allRemoved, setAllRemoved] = useState(false);

  // Revalidate exactly once per mount, only after the provider has
  // hydrated from localStorage and there is something to check.
  const validatedRef = useRef(false);

  useEffect(() => {
    if (validatedRef.current) return;
    if (items.length === 0) return;
    validatedRef.current = true;

    let cancelled = false;
    // Already true via the lazy useState initializer; explicit set is
    // here as a hard guarantee for cases where StrictMode replayed the
    // effect after a previous run flipped it false.
    setIsValidating(true);
    validationOkRef.current = false;

    const initialCount = items.length;
    const promise = (async () => {
      try {
        const res = await fetch('/api/cart/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: items.map(i => ({
              product_id: i.product_id,
              size: i.size,
              quantity: i.quantity,
            })),
          }),
        });

        if (!res.ok) throw new Error(`validate ${res.status}`);
        const data = (await res.json()) as CartValidationResult;
        if (cancelled) return;

        const summary = applyValidation(data);
        if (
          summary.removedItems.length > 0 ||
          summary.clampedItems.length > 0
        ) {
          setAdjusted({
            removed: summary.removedItems.map(
              i => `${i.name} (Size ${i.size})`,
            ),
            clamped: summary.clampedItems.map(
              i => `${i.name} (Size ${i.size}) → ${i.quantity}`,
            ),
          });
        }
        // If the cart had items going in and every single line was
        // dropped, surface the explicit empty-state copy. We compare
        // against `initialCount` (captured before applyValidation ran)
        // because by the time `summary` resolves the local `items`
        // closure is stale.
        if (
          summary.removedItems.length === initialCount &&
          summary.clampedItems.length === 0 &&
          summary.removedItems.length > 0
        ) {
          setAllRemoved(true);
        }
        validationOkRef.current = true;
      } catch (err) {
        if (cancelled) return;
        console.error('[CART_VALIDATE_FAILED]', err);
        setSoftWarning(true);
        validationOkRef.current = false;
      } finally {
        if (!cancelled) setIsValidating(false);
      }
    })();
    validationPromiseRef.current = promise;

    return () => {
      cancelled = true;
    };
    // We intentionally depend only on the initial-mount items.length;
    // re-running on every items change would loop because
    // applyValidation itself updates items.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable, ordered keys for memoized list rendering.
  const renderedItems = useMemo(() => items, [items]);

  if (items.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          {allRemoved && (
            <div
              role="status"
              className={`${styles.banner} ${styles.bannerWarn}`}
              style={{ maxWidth: 460, marginBottom: 'var(--space-5)' }}
            >
              <p className={styles.bannerTitle}>
                Items in your cart became unavailable and were removed.
              </p>
            </div>
          )}
          <h2 className={styles.emptyTitle}>Your cart is empty</h2>
          <p className={styles.emptyDesc}>
            {allRemoved
              ? 'Browse the collection to add fresh picks.'
              : 'Discover the collection.'}
          </p>
          <Link
            href="/products"
            className="btn btn-primary"
            style={{ maxWidth: '260px' }}
          >
            BROWSE PRODUCTS
          </Link>
        </div>
      </div>
    );
  }

  async function handleCheckout() {
    if (isRouting) return;
    if (cartInvalid) return;

    // Always wait for the in-flight validation to settle before
    // routing. Mobile users on slow networks frequently tap the
    // button before the validate fetch has finished; without this
    // await they’d hit /checkout with a stale snapshot, where the
    // submit-time revalidation throws and the UX dies on a generic
    // “verification failed”. We block here instead.
    setIsRouting(true);
    try {
      if (validationPromiseRef.current) {
        await validationPromiseRef.current;
      }
      // After the await, items / cartInvalid may have updated; the
      // cartInvalid memo will re-evaluate on the next render but the
      // local closure is stale, so re-read both flags via refs.
      if (!validationOkRef.current) {
        // Hard validation failure (network / 5xx). Do NOT navigate.
        // The soft-warning banner is already on screen.
        return;
      }
      // Re-pull the latest items synchronously: applyValidation may
      // have just removed lines or clamped quantities.
      const currentItems = items;
      if (currentItems.length === 0) return;
      if (currentItems.some(l => l.maxStock <= 0)) return;

      // Preserve the existing checkout entry contract:
      //  - single-line carts pass product_id + size as URL params,
      //  - multi-line carts go to /checkout?from=cart.
      // We do NOT rewrite the checkout flow here; the checkout page
      // re-runs validation immediately before order POST.
      if (currentItems.length === 1) {
        const item = currentItems[0];
        const params = new URLSearchParams({
          product_id: item.product_id,
          size: item.size,
        });
        router.push(`/checkout?${params.toString()}`);
        return;
      }
      router.push('/checkout?from=cart');
    } finally {
      setIsRouting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>
          Your Cart{' '}
          <span className={styles.count}>({items.length})</span>
        </h1>

        {/* Explicit, item-named feedback so the user knows exactly
            what changed and why — never the vague “we adjusted your
            cart” copy. Two separate banners because the actions
            (removed vs reduced) demand different mental models. */}
        {adjusted && adjusted.removed.length > 0 && (
          <div
            role="status"
            className={`${styles.banner} ${styles.bannerWarn}`}
          >
            <div>
              <p className={styles.bannerTitle}>
                Some items were removed because they are out of stock.
              </p>
              <ul className={styles.bannerList}>
                {adjusted.removed.map(label => (
                  <li key={`r-${label}`}>{label}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {adjusted && adjusted.clamped.length > 0 && (
          <div
            role="status"
            className={`${styles.banner} ${styles.bannerWarn}`}
          >
            <div>
              <p className={styles.bannerTitle}>
                Quantity updated due to limited stock.
              </p>
              <ul className={styles.bannerList}>
                {adjusted.clamped.map(label => (
                  <li key={`c-${label}`}>{label}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {softWarning && !adjusted && (
          <div
            role="status"
            className={`${styles.banner} ${styles.bannerSoft}`}
          >
            Couldn&rsquo;t verify stock right now — quantities will be
            re-checked at checkout.
          </div>
        )}

        <div className={styles.items}>
          {renderedItems.map(item => {
            const atMax = item.maxStock > 0 && item.quantity >= item.maxStock;
            const showLow =
              item.maxStock > 0 && item.maxStock <= 5 && item.quantity === item.maxStock;
            return (
              <div
                key={`${item.product_id}-${item.size}`}
                className={styles.item}
              >
                <Link
                  href={`/product/${item.slug}`}
                  className={styles.itemImage}
                >
                  <img src={item.image} alt={item.name} />
                </Link>
                <div className={styles.itemInfo}>
                  <Link
                    href={`/product/${item.slug}`}
                    className={styles.itemName}
                  >
                    {item.name}
                  </Link>
                  <p className={styles.itemSize}>Size: {item.size}</p>
                  <p className={styles.itemPrice}>
                    {formatPaise(item.price_paise)}
                  </p>
                  {showLow && (
                    <p className={styles.lowStockTag}>
                      Only {item.maxStock} left
                    </p>
                  )}
                  <div className={styles.itemActions}>
                    <div className={styles.qty}>
                      <button
                        className={styles.qtyBtn}
                        onClick={() =>
                          updateQuantity(
                            item.product_id,
                            item.size,
                            item.quantity - 1,
                          )
                        }
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className={styles.qtyVal}>{item.quantity}</span>
                      <button
                        className={styles.qtyBtn}
                        disabled={atMax}
                        onClick={() =>
                          updateQuantity(
                            item.product_id,
                            item.size,
                            item.quantity + 1,
                          )
                        }
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                    <button
                      className={styles.removeBtn}
                      onClick={() => removeItem(item.product_id, item.size)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.summary}>
          <div className={styles.summaryRow}>
            <span>Subtotal</span>
            <span>{formatPaise(totalPaise)}</span>
          </div>
          <div className={styles.summaryRow}>
            <span>Shipping</span>
            <span className={styles.freeText}>FREE</span>
          </div>
          <div className={styles.summaryTotal}>
            <span>Total</span>
            <strong>{formatPaise(totalPaise)}</strong>
          </div>
        </div>

        {cartInvalid && (
          <div
            role="alert"
            className={`${styles.banner} ${styles.bannerWarn}`}
            style={{ marginTop: 0 }}
          >
            <p className={styles.bannerTitle}>
              Please review your cart before proceeding.
            </p>
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleCheckout}
          disabled={
            isValidating || isRouting || cartInvalid || softWarning
          }
        >
          {isValidating || isRouting
            ? 'CHECKING STOCK…'
            : cartInvalid
              ? 'REVIEW CART TO CONTINUE'
              : softWarning
                ? 'STOCK CHECK FAILED — RELOAD'
                : `PROCEED TO CHECKOUT — ${formatPaise(totalPaise)}`}
        </button>
      </div>
    </div>
  );
}
