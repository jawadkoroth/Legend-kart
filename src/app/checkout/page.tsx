'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import styles from './page.module.css';

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Per-submit race controls.
  //
  // - `validateAbortRef` aborts an in-flight `/api/cart/validate`
  //   if the component unmounts or a newer submit supersedes it.
  // - `submitTokenRef` is incremented on every submit; the in-flight
  //   validate captures the token at issue time and discards its
  //   result if a newer submit (or an unmount) has bumped the ref.
  //   This makes a stale validate response harmless: it can never
  //   gate or unblock an order that doesn't belong to it.
  const validateAbortRef = useRef<AbortController | null>(null);
  const submitTokenRef = useRef(0);

  // Idempotency key for /api/orders.
  //
  // Generated lazily on the first submit attempt and PRESERVED
  // across transient retries (network errors, 5xx, payment-gateway
  // hiccups) so the server's UNIQUE(client_request_id) index turns
  // a retried POST into an idempotent replay returning the same
  // order_id instead of double-creating + double-decrementing stock.
  //
  // It is reset on:
  //   * successful order creation (online: after Razorpay handoff;
  //     COD: before the redirect to /order/[id]);
  //   * hard validation failures from the server (400) where the
  //     user must edit the form and resubmit — a different submit
  //     intent deserves a fresh idempotency window.
  const clientRequestIdRef = useRef<string | null>(null);

  // On unmount, abort any in-flight validate and bump the token so
  // any settled-but-not-yet-handled response is discarded.
  useEffect(() => {
    return () => {
      submitTokenRef.current++;
      validateAbortRef.current?.abort();
      validateAbortRef.current = null;
    };
  }, []);
  const productId = searchParams.get('product_id') || '';
  const size = searchParams.get('size') || '';
  const couponCode = searchParams.get('coupon') || '';

  const [product, setProduct] = useState<{ id: string; name: string; price_paise: number; sale_price_paise: number | null } | null>(null);
  const [discount, setDiscount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'cod'>('online');
  const [orderError, setOrderError] = useState('');

  // Auth state — non-null only for logged-in users.
  const [userId, setUserId] = useState<string | null>(null);

  // Saved addresses (logged-in users only).
  type SavedAddress = {
    id: string;
    label: string | null;
    full_name: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    pincode: string;
    is_default: boolean;
  };
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);
  const [saveToBook, setSaveToBook] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          setUserId(session.user.id);
          const { data: profile } = await supabase
            .from('profiles')
            .select('phone, name, email')
            .eq('id', session.user.id)
            .single();

          if (!profile?.phone) {
            router.replace('/profile/complete?next=/checkout');
            return;
          }

          if (profile.name) setName(profile.name);
          if (profile.phone) setPhone(profile.phone.replace('+91', ''));
          if (profile.email) setEmail(profile.email);

          // Pull saved addresses; RLS limits to this user.
          const { data: addrs } = await supabase
            .from('addresses')
            .select('id,label,full_name,phone,line1,line2,city,state,pincode,is_default')
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: false });
          if (addrs && addrs.length > 0) {
            const list = addrs as SavedAddress[];
            setSavedAddresses(list);
            const def = list.find(a => a.is_default) ?? list[0];
            setSelectedSavedId(def.id);
            setLine1(def.line1);
            setLine2(def.line2 ?? '');
            setCity(def.city);
            setState(def.state);
            setPincode(def.pincode);
          }
        }

        const res = await fetch('/api/products');
        const data = await res.json();
        if (data.success) {
          const p = data.products?.find((pr: { id: string }) => pr.id === productId);
          if (p) setProduct(p);
        }

        if (couponCode) {
          const couponRes = await fetch('/api/coupons/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: couponCode }),
          });
          const couponData = await couponRes.json();
          if (couponData.success) {
            setDiscount(couponData.discount_percent);
          }
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [productId, couponCode]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <span className={styles.back}>← Back</span>
          <span className={styles.title}>Checkout</span>
          <span />
        </div>
        <div className={styles.content}>
          <div className="skeleton" style={{ width: '100%', height: '80px', borderRadius: '10px' }} />
        </div>
      </div>
    );
  }

  if (!product || !size) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <Link href="/" className={styles.back}>← Home</Link>
          <span className={styles.title}>Checkout</span>
          <span />
        </div>
        <div className={styles.errorState}>
          <p>Invalid checkout. Please go back and select a product.</p>
          <Link href="/" className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-4)', width: 'auto' }}>
            ← Back to Shop
          </Link>
        </div>
      </div>
    );
  }

  // Mirror server-side pricing: sale_price wins when strictly lower,
  // coupon stacks on top. Keeps the displayed total identical to the
  // amount /api/orders will charge.
  const price =
    product.sale_price_paise != null && product.sale_price_paise < product.price_paise
      ? product.sale_price_paise
      : product.price_paise;
  const discountAmount = Math.round(price * discount / 100);
  const total = price - discountAmount;

  const formatPrice = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN');

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) e.name = 'Name is required';
    if (!/^[6-9]\d{9}$/.test(phone)) e.phone = 'Enter a valid 10-digit phone number';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email';
    if (!line1.trim() || line1.trim().length < 5) e.line1 = 'Address is required';
    if (!city.trim()) e.city = 'City is required';
    if (!state.trim()) e.state = 'State is required';
    if (!/^\d{6}$/.test(pincode)) e.pincode = 'Enter a valid 6-digit pincode';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (submitting || !product) return;
    if (!validate()) return;
    setSubmitting(true);
    setOrderError('');

    // Final stock revalidation immediately before order POST.
    //
    // We ALWAYS validate at submit, even if the cart provider's
    // `validatedAt` snapshot is fresh: a fresh snapshot is a strong
    // hint, not a guarantee — inventory can change in the seconds
    // between /cart load and /checkout submit. The DB decrement is
    // the final gate, but we refuse to initiate a payment round-trip
    // when we cannot prove the line is still sellable.
    //
    // The validate request is dispatched immediately (in parallel
    // with any local prep that follows). Order creation awaits its
    // result, so the gate is strict but the dispatch is non-blocking.
    //
    // Race safety:
    //   - Cancel any prior in-flight validate via `validateAbortRef`.
    //   - Bump `submitTokenRef` and capture the token; a stale
    //     response (e.g. user double-submitted, or component
    //     unmounted then remounted) is discarded.
    //   - On any non-OK / parse error / abort / empty entry, block
    //     with a retryable error.
    //   - On a clear "no stock" answer, block with the existing
    //     user-facing message.
    if (validateAbortRef.current) {
      validateAbortRef.current.abort();
    }
    const controller = new AbortController();
    validateAbortRef.current = controller;
    const myToken = ++submitTokenRef.current;

    const validatePromise = fetch('/api/cart/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ product_id: product.id, size, quantity: 1 }],
      }),
      signal: controller.signal,
    });

    type ValidateOutcome =
      | { ok: true }
      | { ok: false; reason: 'unavailable' | 'verify-failed' };
    // Default to a hard fail; every success path explicitly assigns.
    let validateOutcome: ValidateOutcome = {
      ok: false,
      reason: 'verify-failed',
    };
    try {
      const validateRes = await validatePromise;
      // Stale: a newer submit started, or we were unmounted. Drop.
      if (myToken !== submitTokenRef.current) return;
      if (!validateRes.ok) {
        console.error('[CHECKOUT_VALIDATE_FAILED]', validateRes.status);
        validateOutcome = { ok: false, reason: 'verify-failed' };
      } else {
        const validateData = (await validateRes.json()) as {
          items: Array<{
            product_id: string;
            size: string;
            maxStock: number;
            clampedQuantity: number;
            removed: boolean;
          }>;
        };
        if (myToken !== submitTokenRef.current) return;
        const entry = validateData.items?.[0];
        if (!entry) {
          console.error('[CHECKOUT_VALIDATE_EMPTY]', validateData);
          validateOutcome = { ok: false, reason: 'verify-failed' };
        } else if (entry.removed || entry.maxStock < 1) {
          validateOutcome = { ok: false, reason: 'unavailable' };
        } else {
          validateOutcome = { ok: true };
        }
      }
    } catch (err) {
      if (myToken !== submitTokenRef.current) return;
      // AbortError surfaces when a newer submit aborts us; that path
      // already returned above via the token check, but guard anyway.
      if ((err as { name?: string })?.name === 'AbortError') return;
      console.error('[CHECKOUT_VALIDATE_ERROR]', err);
      validateOutcome = { ok: false, reason: 'verify-failed' };
    } finally {
      if (validateAbortRef.current === controller) {
        validateAbortRef.current = null;
      }
    }

    if (!validateOutcome.ok) {
      setOrderError(
        validateOutcome.reason === 'unavailable'
          ? 'This item is no longer available in the selected size. Please choose another.'
          : 'Unable to verify stock. Please try again.',
      );
      setSubmitting(false);
      return;
    }

    // Reuse the same client_request_id across retries within a
    // submit session so the server can dedupe via UNIQUE index.
    if (!clientRequestIdRef.current) {
      clientRequestIdRef.current =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : // Fallback for very old browsers; matches UUID v4 shape.
          'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });
    }
    const clientRequestId = clientRequestIdRef.current;

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          size,
          quantity: 1,
          customer: { name: name.trim(), phone, email: email || undefined },
          shipping_address: {
            line1: line1.trim(),
            line2: line2.trim() || undefined,
            city: city.trim(),
            state: state.trim(),
            pincode,
          },
          payment_method: paymentMethod,
          coupon_code: couponCode || undefined,
          client_request_id: clientRequestId,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        console.error('[ORDER_FAILED]', data.error, data.details);
        // 400 = validation error; user must edit and resubmit, so
        // a new idempotency window is appropriate. Other failures
        // (5xx, 409 transient stock) keep the same id so a retry
        // is replay-safe.
        if (res.status === 400) {
          clientRequestIdRef.current = null;
        }
        setOrderError(data.error || 'Failed to place order. Please try again.');
        setSubmitting(false);
        return;
      }

      // Persist to the address book if the user opted in (manual
      // mode + checkbox). Fire-and-forget: never blocks the order.
      if (
        userId &&
        selectedSavedId === null &&
        saveToBook
      ) {
        const supabase = createClient();
        supabase
          .from('addresses')
          .insert({
            user_id: userId,
            label: null,
            full_name: name.trim(),
            phone,
            line1: line1.trim(),
            line2: line2.trim() || null,
            city: city.trim(),
            state: state.trim(),
            pincode,
            country: 'India',
          })
          .select('id')
          .single()
          .then(({ data: row, error }) => {
            if (error || !row) return;
            // First-ever save → mark as default.
            if (savedAddresses.length === 0) {
              supabase.rpc('set_default_address', { p_id: row.id }).then(() => { });
            }
          });
      }

      if (paymentMethod === 'online') {
        // Hand off to Razorpay; the id is consumed once payment
        // succeeds or the user dismisses the modal.
        clientRequestIdRef.current = null;
        await openRazorpay(data);
      } else {
        clientRequestIdRef.current = null;
        router.push(`/order/${data.order_id}`);
      }
    } catch (err) {
      console.error('[ORDER_ERROR]', err);
      // Network error: keep the id so the next click is a replay.
      setOrderError('Network error. Please check your connection and try again.');
      setSubmitting(false);
    }
  }

  async function openRazorpay(orderData: {
    razorpay_order_id: string;
    amount: number;
    key_id: string;
    order_id: string;
    customer: { name: string; phone: string; email?: string };
  }) {
    // Validate that we have the required Razorpay data
    if (!orderData.razorpay_order_id || !orderData.key_id) {
      console.error('[RAZORPAY_INIT] Missing order_id or key_id:', orderData);
      setOrderError('Payment could not be initialized. Please try COD or contact support.');
      setSubmitting(false);
      return;
    }

    // Dynamically load Razorpay SDK
    try {
      if (!(window as unknown as { Razorpay: unknown }).Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load payment SDK'));
          document.body.appendChild(script);
        });
      }
    } catch (err) {
      console.error('[RAZORPAY_SDK_LOAD]', err);
      setOrderError('Could not load payment gateway. Please try COD or check your internet connection.');
      setSubmitting(false);
      return;
    }

    const RazorpayClass = (window as unknown as { Razorpay: new (options: Record<string, unknown>) => { open: () => void } }).Razorpay;

    const rzp = new RazorpayClass({
      key: orderData.key_id,
      amount: orderData.amount,
      currency: 'INR',
      name: 'NOIR',
      description: `${product?.name || 'Product'} — Size ${size}`,
      order_id: orderData.razorpay_order_id,
      prefill: {
        name: orderData.customer.name,
        contact: orderData.customer.phone,
        email: orderData.customer.email || '',
      },
      theme: { color: '#1A1A1A' },
      handler: async function (response: { razorpay_payment_id: string; razorpay_signature: string }) {
        try {
          const verifyRes = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order_id: orderData.order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });
          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            router.push(`/order/${orderData.order_id}`);
          } else {
            router.push(`/order/${orderData.order_id}?payment=failed`);
          }
        } catch {
          router.push(`/order/${orderData.order_id}?payment=failed`);
        }
      },
      modal: {
        ondismiss: function () {
          setSubmitting(false);
          router.push(`/order/${orderData.order_id}?payment=pending`);
        },
      },
    });

    rzp.open();
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.back} onClick={() => router.back()}>← Back</button>
        <span className={styles.title}>Checkout</span>
        <span />
      </div>

      <div className={styles.content}>
        {/* Error Banner */}
        {orderError && (
          <div className={styles.errorBanner}>
            <span>⚠</span>
            <span>{orderError}</span>
            <button onClick={() => setOrderError('')} className={styles.errorClose}>✕</button>
          </div>
        )}

        {/* Order Summary */}
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <div className={styles.summaryRow}>
            <span>📦 {product.name} · {size}</span>
          </div>
          <div className={styles.summaryRow}>
            <span>{formatPrice(price)}</span>
            {discountAmount > 0 && <span className={styles.discountText}>-{formatPrice(discountAmount)}</span>}
          </div>
          <div className={styles.summaryTotal}>
            Total: <strong>{formatPrice(total)}</strong>
          </div>
        </div>

        {/* Customer Details */}
        <div className={styles.formSection}>
          <label className="input-label">Your Details</label>
          <div className="input-group">
            <input className={`input-field ${errors.name ? 'input-error' : ''}`} placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} />
            {errors.name && <span className="input-error-text">{errors.name}</span>}
          </div>
          <div className="input-group">
            <input className={`input-field ${errors.phone ? 'input-error' : ''}`} placeholder="Phone Number" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" maxLength={10} />
            {errors.phone && <span className="input-error-text">{errors.phone}</span>}
          </div>
          <div className="input-group">
            <input className={`input-field ${errors.email ? 'input-error' : ''}`} placeholder="Email (optional)" value={email} onChange={e => setEmail(e.target.value)} type="email" />
            {errors.email && <span className="input-error-text">{errors.email}</span>}
          </div>
        </div>

        {/* Shipping Address */}
        <div className={styles.formSection}>
          <label className="input-label">Shipping Address</label>

          {/* Saved-address picker — only when logged in and at least
              one address is on file. Selecting one prefills + locks the
              form into 'saved' mode; the user can flip back to manual
              entry via the gold banner action. */}
          {savedAddresses.length > 0 && selectedSavedId !== null && (
            <>
              <div className={styles.savedPicker} role="radiogroup" aria-label="Saved addresses">
                {savedAddresses.map(a => {
                  const active = a.id === selectedSavedId;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`${styles.savedRow} ${active ? styles.savedRowActive : ''}`}
                      onClick={() => {
                        setSelectedSavedId(a.id);
                        setLine1(a.line1);
                        setLine2(a.line2 ?? '');
                        setCity(a.city);
                        setState(a.state);
                        setPincode(a.pincode);
                        setErrors({});
                      }}
                    >
                      <input
                        type="radio"
                        className={styles.savedRadio}
                        checked={active}
                        readOnly
                        tabIndex={-1}
                      />
                      <span className={styles.savedRowMeta}>
                        <span className={styles.savedRowName}>
                          {a.label || a.full_name}
                          {a.is_default && <span className={styles.defaultPill}>Default</span>}
                        </span>
                        <span className={styles.savedRowAddr}>
                          {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} — {a.pincode}
                        </span>
                      </span>
                      <span />
                    </button>
                  );
                })}
              </div>
              <div className={styles.usingBanner}>
                <span>Using saved address</span>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => {
                    setSelectedSavedId(null);
                    setLine1('');
                    setLine2('');
                    setCity('');
                    setState('');
                    setPincode('');
                    setErrors({});
                  }}
                >
                  Use a different address
                </button>
              </div>
            </>
          )}

          {savedAddresses.length > 0 && selectedSavedId === null && (
            <button
              type="button"
              className={styles.savedToggle}
              onClick={() => {
                const def = savedAddresses.find(a => a.is_default) ?? savedAddresses[0];
                if (!def) return;
                setSelectedSavedId(def.id);
                setLine1(def.line1);
                setLine2(def.line2 ?? '');
                setCity(def.city);
                setState(def.state);
                setPincode(def.pincode);
                setErrors({});
              }}
            >
              ← Use a saved address
            </button>
          )}

          <div className="input-group">
            <input className={`input-field ${errors.line1 ? 'input-error' : ''}`} placeholder="Address Line 1" value={line1} onChange={e => setLine1(e.target.value)} readOnly={selectedSavedId !== null} />
            {errors.line1 && <span className="input-error-text">{errors.line1}</span>}
          </div>
          <div className="input-group">
            <input className="input-field" placeholder="Address Line 2 (optional)" value={line2} onChange={e => setLine2(e.target.value)} readOnly={selectedSavedId !== null} />
          </div>
          <div className="input-row">
            <div className="input-group">
              <input className={`input-field ${errors.city ? 'input-error' : ''}`} placeholder="City" value={city} onChange={e => setCity(e.target.value)} readOnly={selectedSavedId !== null} />
              {errors.city && <span className="input-error-text">{errors.city}</span>}
            </div>
            <div className="input-group">
              <input className={`input-field ${errors.state ? 'input-error' : ''}`} placeholder="State" value={state} onChange={e => setState(e.target.value)} readOnly={selectedSavedId !== null} />
              {errors.state && <span className="input-error-text">{errors.state}</span>}
            </div>
          </div>
          <div className="input-group">
            <input className={`input-field ${errors.pincode ? 'input-error' : ''}`} placeholder="Pincode" value={pincode} onChange={e => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} readOnly={selectedSavedId !== null} />
            {errors.pincode && <span className="input-error-text">{errors.pincode}</span>}
          </div>

          {userId && selectedSavedId === null && (
            <label className={styles.saveBookRow}>
              <input
                type="checkbox"
                checked={saveToBook}
                onChange={e => setSaveToBook(e.target.checked)}
              />
              Save to my address book
            </label>
          )}
        </div>

        {/* Payment Method */}
        <div className={styles.formSection}>
          <label className="input-label">Payment</label>
          <div className="payment-toggle">
            <button
              className={`payment-option ${paymentMethod === 'cod' ? 'payment-option-selected' : ''}`}
              onClick={() => { setPaymentMethod('cod'); setOrderError(''); }}
            >
              💰 COD
            </button>
            <button
              className={`payment-option ${paymentMethod === 'online' ? 'payment-option-selected' : ''}`}
              onClick={() => { setPaymentMethod('online'); setOrderError(''); }}
            >
              💳 Online
            </button>
          </div>
          <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>
            {paymentMethod === 'online' ? 'UPI · Cards · Wallets · Net Banking' : 'Pay when your order arrives'}
          </p>
        </div>

        {/* Submit */}
        <button
          id="place-order-btn"
          className={`btn btn-primary ${submitting ? 'btn-loading' : ''}`}
          onClick={handleSubmit}
          disabled={submitting}
        >
          PLACE ORDER — {formatPrice(total)}
        </button>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-pulse text-muted">Loading checkout...</div>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}
