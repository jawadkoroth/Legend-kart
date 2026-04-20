'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cart';
import styles from './page.module.css';

export default function CartPage() {
  const router = useRouter();
  const { items, removeItem, updateQuantity, totalPaise } = useCart();

  const formatPrice = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN');

  if (items.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>🛒</span>
          <h2 className={styles.emptyTitle}>Your cart is empty</h2>
          <p className={styles.emptyDesc}>Discover our premium collection</p>
          <Link href="/" className="btn btn-primary" style={{ maxWidth: '260px' }}>
            BROWSE PRODUCTS
          </Link>
        </div>
      </div>
    );
  }

  function handleCheckout() {
    // For single-item: pass as URL params (existing flow)
    if (items.length === 1) {
      const item = items[0];
      const params = new URLSearchParams({
        product_id: item.product_id,
        size: item.size,
      });
      router.push(`/checkout?${params.toString()}`);
      return;
    }
    // For multi-item: checkout reads from cart
    router.push('/checkout?from=cart');
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Your Cart <span className={styles.count}>({items.length})</span></h1>

        <div className={styles.items}>
          {items.map(item => (
            <div key={`${item.product_id}-${item.size}`} className={styles.item}>
              <Link href={`/product/${item.slug}`} className={styles.itemImage}>
                <img src={item.image} alt={item.name} />
              </Link>
              <div className={styles.itemInfo}>
                <Link href={`/product/${item.slug}`} className={styles.itemName}>{item.name}</Link>
                <p className={styles.itemSize}>Size: {item.size}</p>
                <p className={styles.itemPrice}>{formatPrice(item.price_paise)}</p>
                <div className={styles.itemActions}>
                  <div className={styles.qty}>
                    <button
                      className={styles.qtyBtn}
                      onClick={() => updateQuantity(item.product_id, item.size, item.quantity - 1)}
                    >−</button>
                    <span className={styles.qtyVal}>{item.quantity}</span>
                    <button
                      className={styles.qtyBtn}
                      onClick={() => updateQuantity(item.product_id, item.size, item.quantity + 1)}
                    >+</button>
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
          ))}
        </div>

        {/* Summary */}
        <div className={styles.summary}>
          <div className={styles.summaryRow}>
            <span>Subtotal</span>
            <span>{formatPrice(totalPaise)}</span>
          </div>
          <div className={styles.summaryRow}>
            <span>Shipping</span>
            <span className={styles.freeText}>FREE</span>
          </div>
          <div className={styles.summaryTotal}>
            <span>Total</span>
            <strong>{formatPrice(totalPaise)}</strong>
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleCheckout}>
          PROCEED TO CHECKOUT — {formatPrice(totalPaise)}
        </button>
      </div>
    </div>
  );
}
