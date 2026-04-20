'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useEmblaCarousel from 'embla-carousel-react';
import { useCart } from '@/lib/cart';
import styles from './page.module.css';

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_paise: number;
  images: string[];
  sizes: string[];
}

interface InventoryItem {
  size: string;
  stock: number;
}

export default function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { addItem } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedSize, setSelectedSize] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [showCoupon, setShowCoupon] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addedToCart, setAddedToCart] = useState(false);

  // Embla Carousel
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, dragFree: false });
  const [selectedSlide, setSelectedSlide] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedSlide(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    onSelect();
  }, [emblaApi, onSelect]);

  useEffect(() => {
    async function fetchProduct() {
      try {
        const res = await fetch('/api/products');
        const data = await res.json();
        if (data.success && data.products?.length > 0) {
          const p = data.products.find((pr: Product) => pr.slug === slug) || data.products[0];
          setProduct(p);
          setInventory(p.inventory || []);
        }
      } catch (err) {
        console.error('Failed to load product:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProduct();
  }, [slug]);

  const getStock = useCallback((size: string) => {
    return inventory.find(i => i.size === size)?.stock ?? 0;
  }, [inventory]);

  const price = product?.price_paise ?? 0;
  const discountAmount = Math.round(price * couponDiscount / 100);
  const finalPrice = price - discountAmount;

  const formatPrice = (paise: number) => {
    return '₹' + (paise / 100).toLocaleString('en-IN');
  };

  async function handleValidateCoupon() {
    if (!couponCode.trim()) return;
    setCouponError('');

    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode.toUpperCase() }),
      });
      const data = await res.json();
      if (data.success) {
        setCouponDiscount(data.discount_percent);
        setCouponApplied(true);
        setCouponError('');
      } else {
        setCouponError(data.error || 'Invalid coupon');
        setCouponDiscount(0);
        setCouponApplied(false);
      }
    } catch {
      setCouponError('Failed to validate coupon');
    }
  }

  function handleAddToCart() {
    if (!selectedSize || !product) return;
    const images = getImages();
    addItem({
      product_id: product.id,
      name: product.name,
      slug: product.slug,
      size: selectedSize,
      price_paise: finalPrice,
      image: images[0],
    });
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  }

  function handleBuyNow() {
    if (!selectedSize || !product) return;
    const params = new URLSearchParams({
      product_id: product.id,
      size: selectedSize,
      ...(couponApplied && couponCode ? { coupon: couponCode.toUpperCase() } : {}),
    });
    router.push(`/checkout?${params.toString()}`);
  }

  function getImages() {
    if (!product) return ['/product-1.png'];
    const hasImages = product.images && product.images.length > 0 && product.images[0] !== '';
    return hasImages ? product.images : ['/product-1.png', '/product-2.png', '/product-3.png'];
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.heroSkeleton}>
          <div className="skeleton" style={{ width: '100%', height: '100%' }} />
        </div>
        <div className={styles.content}>
          <div className="skeleton" style={{ width: '200px', height: '28px', marginBottom: '8px' }} />
          <div className="skeleton" style={{ width: '100px', height: '24px' }} />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <p>Product not found</p>
          <Link href="/" className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-4)', width: 'auto' }}>
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const images = getImages();

  return (
    <div className={styles.page}>
      <div className={styles.desktopLayout}>
        {/* Embla Image Carousel — swipeable */}
        <div className={styles.galleryWrap}>
          <div className={styles.emblaViewport} ref={emblaRef}>
            <div className={styles.emblaContainer}>
              {images.map((img, idx) => (
                <div key={idx} className={styles.emblaSlide}>
                  <img src={img} alt={`${product.name} - ${idx + 1}`} />
                </div>
              ))}
            </div>
          </div>
          {images.length > 1 && (
            <div className={styles.dots}>
              {images.map((_, idx) => (
                <button
                  key={idx}
                  className={`${styles.dot} ${idx === selectedSlide ? styles.dotActive : ''}`}
                  onClick={() => emblaApi?.scrollTo(idx)}
                />
              ))}
            </div>
          )}

          {/* Desktop thumbnails */}
          <div className={styles.thumbnails}>
            {images.map((img, idx) => (
              <button
                key={idx}
                className={`${styles.thumb} ${idx === selectedSlide ? styles.thumbActive : ''}`}
                onClick={() => emblaApi?.scrollTo(idx)}
              >
                <img src={img} alt={`Thumb ${idx + 1}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Product Info */}
        <div className={styles.content}>
          <div className="animate-fade-in-up">
            <h1 className={styles.productName}>{product.name}</h1>
            <div className={styles.priceRow}>
              <span className={styles.price}>{formatPrice(finalPrice)}</span>
              {discountAmount > 0 && (
                <>
                  <span className={styles.originalPrice}>{formatPrice(price)}</span>
                  <span className={styles.discountBadge}>-{couponDiscount}%</span>
                </>
              )}
            </div>

            <p className={styles.description}>{product.description}</p>

            {/* Size Selector */}
            <div className={styles.section}>
              <label className="input-label">Select Size</label>
              <div className="size-grid">
                {(product.sizes as string[]).map(size => {
                  const stock = getStock(size);
                  const outOfStock = stock <= 0;
                  const isSelected = selectedSize === size;
                  return (
                    <button
                      key={size}
                      className={`size-btn ${isSelected ? 'size-btn-selected' : ''} ${outOfStock ? 'size-btn-disabled' : ''}`}
                      onClick={() => !outOfStock && setSelectedSize(size)}
                      disabled={outOfStock}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
              {selectedSize && getStock(selectedSize) <= 3 && getStock(selectedSize) > 0 && (
                <p className={styles.lowStock}>Only {getStock(selectedSize)} left</p>
              )}
            </div>

            {/* Coupon */}
            <div className={styles.section}>
              {!showCoupon ? (
                <button className={styles.couponToggle} onClick={() => setShowCoupon(true)}>
                  Have a coupon code?
                </button>
              ) : (
                <div className={styles.couponRow}>
                  <input
                    className="input-field"
                    placeholder="Enter coupon code"
                    value={couponCode}
                    onChange={e => {
                      setCouponCode(e.target.value.toUpperCase());
                      setCouponApplied(false);
                      setCouponError('');
                      setCouponDiscount(0);
                    }}
                    style={{ textTransform: 'uppercase', flex: 1 }}
                  />
                  <button
                    className={`btn btn-secondary btn-sm ${couponApplied ? 'btn-success' : ''}`}
                    onClick={handleValidateCoupon}
                    disabled={couponApplied}
                    style={{ width: 'auto', whiteSpace: 'nowrap' }}
                  >
                    {couponApplied ? '✓ Applied' : 'Apply'}
                  </button>
                </div>
              )}
              {couponError && <p className="input-error-text">{couponError}</p>}
              {couponApplied && (
                <p className={styles.couponSuccess}>
                  {couponDiscount}% off applied — You save {formatPrice(discountAmount)}
                </p>
              )}
            </div>

            {/* Trust Badges */}
            <div className={styles.trustBadges}>
              <span>🚚 Free Shipping</span>
              <span>·</span>
              <span>💰 COD Available</span>
              <span>·</span>
              <span>↩️ Easy Returns</span>
            </div>

            {/* Desktop CTAs */}
            <div className={styles.desktopCta}>
              <button
                className="btn btn-primary"
                disabled={!selectedSize}
                onClick={handleBuyNow}
              >
                {selectedSize ? `BUY NOW — ${formatPrice(finalPrice)}` : 'SELECT A SIZE'}
              </button>
              <button
                className={`btn btn-secondary ${addedToCart ? 'btn-success' : ''}`}
                disabled={!selectedSize}
                onClick={handleAddToCart}
                style={{ marginTop: 'var(--space-3)' }}
              >
                {addedToCart ? '✓ ADDED TO CART' : 'ADD TO CART'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sticky CTAs */}
      <div className={styles.mobileCta}>
        <div className={styles.mobileBtnRow}>
          <button
            className={`${styles.mobileCartBtn} ${addedToCart ? styles.mobileCartBtnDone : ''}`}
            disabled={!selectedSize}
            onClick={handleAddToCart}
          >
            {addedToCart ? '✓' : '🛒'}
          </button>
          <button
            className="btn btn-primary"
            disabled={!selectedSize}
            onClick={handleBuyNow}
            style={{ flex: 1 }}
          >
            {selectedSize ? `BUY NOW — ${formatPrice(finalPrice)}` : 'SELECT A SIZE'}
          </button>
        </div>
      </div>
      <div className={styles.mobileCtaSpacer} />
    </div>
  );
}
