import Link from 'next/link';
import { formatPaise } from '@/lib/format';
import styles from './ProductCard.module.css';

export interface ProductCardData {
  id: string;
  slug: string;
  name: string;
  price_paise: number;
  sale_price_paise: number | null;
  images: string[];
  totalStock: number;
}

/**
 * Server-rendered product tile.
 *
 * When `totalStock === 0` the root element is a plain <div>, *not* a
 * <Link>. This guarantees the card is unreachable by:
 *   - mouse click   (no anchor / no onClick),
 *   - keyboard tab  (no href + tabIndex={-1}),
 *   - assistive tech (`aria-disabled="true"`).
 *
 * That removes the "user clicks a card and lands on a sold-out PDP"
 * footgun without needing client JS.
 */
export default function ProductCard({ product }: { product: ProductCardData }) {
  const outOfStock = product.totalStock <= 0;
  const lowStock = !outOfStock && product.totalStock <= 5;
  const cover = product.images?.[0] || '/product-1.png';

  const inner = (
    <>
      <div className={styles.imageWrap}>
        <img
          src={cover}
          alt={product.name}
          className={`${styles.image} ${outOfStock ? styles.imageDisabled : ''}`}
          loading="lazy"
        />
        {outOfStock && (
          <span className={styles.outOfStockPill} aria-hidden>
            OUT OF STOCK
          </span>
        )}
      </div>

      <div className={styles.body}>
        <h3 className={styles.name}>{product.name}</h3>
        <div className={styles.priceRow}>
          {product.sale_price_paise ? (
            <>
              <span className={styles.price}>{formatPaise(product.sale_price_paise)}</span>
              <span className={styles.priceStrike}>{formatPaise(product.price_paise)}</span>
            </>
          ) : (
            <span className={styles.price}>{formatPaise(product.price_paise)}</span>
          )}
        </div>
        {lowStock && (
          <p className={styles.lowStock}>Only {product.totalStock} left</p>
        )}
      </div>
    </>
  );

  if (outOfStock) {
    return (
      <div
        className={`${styles.card} ${styles.cardDisabled}`}
        aria-disabled="true"
        tabIndex={-1}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link href={`/product/${product.slug}`} className={styles.card}>
      {inner}
    </Link>
  );
}
