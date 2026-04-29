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

  const [isValidating, setIsValidating] = useState(false);
  const [adjusted, setAdjusted] = useState<{
    removed: string[];
    clamped: string[];
  } | null>(null);
  const [softWarning, setSoftWarning] = useState(false);

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

  // Revalidate exactly once per mount, only after the provider has
  // hydrated from localStorage and there is something to check.
  const validatedRef = useRef(false);

  useEffect(() => {
    if (validatedRef.current) return;
    if (items.length === 0) return;
    validatedRef.current = true;

    let cancelled = false;
    setIsValidating(true);

    (async () => {
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
      } catch (err) {
        if (cancelled) return;
        console.error('[CART_VALIDATE_FAILED]', err);
        setSoftWarning(true);
      } finally {
        if (!cancelled) setIsValidating(false);
      }
    })();

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
          <h2 className={styles.emptyTitle}>Your cart is empty</h2>
          <p className={styles.emptyDesc}>Discover the collection.</p>
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

  function handleCheckout() {
    if (isValidating) return;
    // Defence in depth: even if the button is somehow clickable,
    // never initiate the checkout flow with an unsellable line.
    if (cartInvalid) return;
    // Preserve the existing checkout entry contract:
    //  - single-line carts pass product_id + size as URL params,
    //  - multi-line carts go to /checkout?from=cart.
    // We do NOT rewrite the checkout flow here; the checkout page
    // re-runs validation immediately before order POST.
    if (items.length === 1) {
      const item = items[0];
      const params = new URLSearchParams({
        product_id: item.product_id,
        size: item.size,
      });
      router.push(`/checkout?${params.toString()}`);
      return;
    }
    router.push('/checkout?from=cart');
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
          disabled={isValidating || cartInvalid}
        >
          {isValidating
            ? 'CHECKING STOCK…'
            : cartInvalid
              ? 'REVIEW CART TO CONTINUE'
              : `PROCEED TO CHECKOUT — ${formatPaise(totalPaise)}`}
        </button>
      </div>
    </div>
  );
}
