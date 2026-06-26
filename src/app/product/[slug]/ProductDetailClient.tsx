'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useEmblaCarousel from 'embla-carousel-react';
import { useCart } from '@/lib/cart';
import { formatPaise } from '@/lib/format';
import { getPublicUrl } from '@/lib/media';
import styles from './page.module.css';

interface CouponPromoted {
  id: string;
  code: string;
  discount_percent: number;
  min_cart_paise: number | null;
  max_discount_paise: number | null;
}

interface StorySection {
  id?: string;
  title: string;
  subtitle?: string | null;
  description: string;
  image_url: string;
  button_text?: string | null;
  button_url?: string | null;
  layout: 'left' | 'right';
  background: 'black' | 'dark-grey' | 'gold-accent';
  image_ratio: 'portrait' | 'landscape' | 'square';
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_paise: number;
  sale_price_paise: number | null;
  images: string[];
  sizes: string[];
}

export interface InventoryItem {
  size: string;
  stock: number;
}

/**
 * Client-side detail UI. Receives all data via props from the server
 * page — no `useEffect` fetch, no `/api/products` round-trip, no
 * fallback-to-first-product behaviour.
 */
export default function ProductDetailClient({
  product,
  inventory,
  totalStock,
  media = [],
  coupons = [],
  stories = [],
}: {
  product: ProductDetail;
  inventory: InventoryItem[];
  totalStock: number;
  media?: { url: string; type: 'image' | 'video' }[];
  coupons?: CouponPromoted[];
  stories?: StorySection[];
}) {
  const router = useRouter();
  const { addItem } = useCart();
  const [selectedSize, setSelectedSize] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [showCoupon, setShowCoupon] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  // Fullscreen view state
  const [fullscreenMedia, setFullscreenMedia] = useState<string | null>(null);
  const [fullscreenType, setFullscreenType] = useState<'image' | 'video' | null>(null);

  const isSoldOut = totalStock <= 0;

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

  // Story scroll reveal triggers
  useEffect(() => {
    if (stories.length === 0 || typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.revealed);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    const elements = document.querySelectorAll(`.${styles.revealItem}`);
    elements.forEach((el) => observer.observe(el));

    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, [stories]);

  const getStock = useCallback((size: string) => {
    return inventory.find(i => i.size === size)?.stock ?? 0;
  }, [inventory]);

  // Pricing: sale price takes priority, coupon stacks on top
  const originalPrice = product.price_paise;
  const basePrice = product.sale_price_paise ?? originalPrice;
  const hasSalePrice = product.sale_price_paise != null && product.sale_price_paise < originalPrice;
  const discountAmount = Math.round(basePrice * couponDiscount / 100);
  const finalPrice = basePrice - discountAmount;

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

  // Resolve media array and fall back to legacy images if empty
  const resolvedMedia = media.length > 0
    ? media
    : product.images.length > 0
      ? product.images.map(img => ({ url: img, type: 'image' as const }))
      : [
          { url: '/product-1.png', type: 'image' as const },
          { url: '/product-2.png', type: 'image' as const },
          { url: '/product-3.png', type: 'image' as const },
        ];

  const firstImageUrl = resolvedMedia.find(m => m.type === 'image')?.url || '/product-1.png';

  function handleAddToCart() {
    if (!selectedSize || isSoldOut) return;
    const sizeStock = getStock(selectedSize);
    // Defence-in-depth: the size button is already disabled when its
    // individual stock is 0, but never let a sold-out size sneak into
    // the cart even if state somehow desyncs.
    if (sizeStock <= 0) return;
    addItem({
      product_id: product.id,
      name: product.name,
      slug: product.slug,
      size: selectedSize,
      price_paise: finalPrice,
      image: getPublicUrl(firstImageUrl),
      maxStock: sizeStock,
    });
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  }

  function handleBuyNow() {
    if (!selectedSize || isSoldOut) return;
    const sizeStock = getStock(selectedSize);
    if (sizeStock <= 0) return;

    addItem({
      product_id: product.id,
      name: product.name,
      slug: product.slug,
      size: selectedSize,
      price_paise: finalPrice,
      image: getPublicUrl(firstImageUrl),
      maxStock: sizeStock,
    });

    const params = new URLSearchParams({
      product_id: product.id,
      size: selectedSize,
      ...(couponApplied && couponCode ? { coupon: couponCode.toUpperCase() } : {}),
    });
    router.push(`/checkout?${params.toString()}`);
  }

  return (
    <div className={styles.page}>
      <div className={styles.desktopLayout}>
        {/* Embla Image & Video Carousel — swipeable */}
        <div className={styles.galleryWrap}>
          <div className={styles.emblaViewport} ref={emblaRef}>
            <div className={styles.emblaContainer}>
              {resolvedMedia.map((m, idx) => (
                <div key={idx} className={styles.emblaSlide}>
                  {m.type === 'video' ? (
                    <div className={styles.galleryVideoWrapper}>
                      <video
                        src={getPublicUrl(m.url)}
                        className={styles.galleryVideo}
                        controls
                        playsInline
                        loop
                        muted
                      />
                    </div>
                  ) : (
                    <img src={getPublicUrl(m.url)} alt={`${product.name} - ${idx + 1}`} />
                  )}
                  <button
                    type="button"
                    className={styles.zoomBtn}
                    onClick={() => {
                      setFullscreenMedia(getPublicUrl(m.url));
                      setFullscreenType(m.type);
                    }}
                    aria-label="Zoom media"
                  >
                    🔍
                  </button>
                </div>
              ))}
            </div>
          </div>
          {resolvedMedia.length > 1 && (
            <div className={styles.dots}>
              {resolvedMedia.map((_, idx) => (
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
            {resolvedMedia.map((m, idx) => (
              <button
                key={idx}
                className={`${styles.thumb} ${idx === selectedSlide ? styles.thumbActive : ''}`}
                onClick={() => emblaApi?.scrollTo(idx)}
              >
                {m.type === 'video' ? (
                  <div className={styles.thumbVideoWrapper}>
                    <video src={getPublicUrl(m.url)} className={styles.thumbVideo} preload="metadata" muted />
                    <div className={styles.thumbPlayOverlay}>▶</div>
                  </div>
                ) : (
                  <img src={getPublicUrl(m.url)} alt={`Thumb ${idx + 1}`} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Product Info */}
        <div className={styles.content}>
          <div className="animate-fade-in-up">
            <h1 className={styles.productName}>{product.name}</h1>
            <div className={styles.priceRow}>
              <span className={styles.price}>{formatPaise(finalPrice)}</span>
              {(hasSalePrice || discountAmount > 0) && (
                <span className={styles.originalPrice}>{formatPaise(hasSalePrice && discountAmount > 0 ? originalPrice : (hasSalePrice ? originalPrice : basePrice))}</span>
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
                  {couponDiscount}% off applied — You save {formatPaise(discountAmount)}
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

            {/* Promoted Coupons Carousel/Row */}
            {coupons && coupons.length > 0 && (
              <div className={styles.couponPromoContainer}>
                <span className={styles.couponPromoLabel}>🏷️ PRODUCT PROMOTIONS</span>
                <div className={styles.couponPromoList}>
                  {coupons.map((c) => (
                    <div
                      key={c.id}
                      className={styles.couponPromoCard}
                      onClick={() => {
                        setCouponCode(c.code);
                        setCouponApplied(false);
                        setShowCoupon(true);
                      }}
                      title={`Click to apply ${c.code}`}
                    >
                      <div className={styles.couponPromoGlow} />
                      <div className={styles.couponPromoHeader}>
                        <span className={styles.couponPercent}>{c.discount_percent}% OFF</span>
                      </div>
                      <div className={styles.couponPromoBody}>
                        <span className={styles.couponCodeText}>Use Code: <strong className={styles.goldCode}>{c.code}</strong></span>
                        <span className={styles.couponValidHint}>Valid on this product</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Desktop CTAs */}
            <div className={styles.desktopCta}>
              <button
                className="btn btn-primary"
                disabled={!selectedSize || isSoldOut}
                onClick={handleBuyNow}
              >
                {isSoldOut
                  ? 'OUT OF STOCK'
                  : selectedSize
                    ? `BUY NOW — ${formatPaise(finalPrice)}`
                    : 'SELECT A SIZE'}
              </button>
              <button
                className={`btn btn-secondary ${addedToCart ? 'btn-success' : ''}`}
                disabled={!selectedSize || isSoldOut}
                onClick={handleAddToCart}
                style={{ marginTop: 'var(--space-3)' }}
              >
                {addedToCart ? '✓ ADDED TO CART' : 'ADD TO CART'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Story Sections */}
      {stories && stories.length > 0 && (
        <div className={styles.storyContainer}>
          {stories.map((story, idx) => {
            const isLeft = idx % 2 === 0;
            
            let bgClass = styles.bgBlack;
            if (story.background === 'dark-grey') bgClass = styles.bgDarkGrey;
            else if (story.background === 'gold-accent') bgClass = styles.bgGoldAccent;

            let ratioClass = styles.ratioPortrait;
            if (story.image_ratio === 'landscape') ratioClass = styles.ratioLandscape;
            else if (story.image_ratio === 'square') ratioClass = styles.ratioSquare;

            return (
              <section
                key={story.id || idx}
                className={`${styles.storySection} ${bgClass}`}
              >
                <div className={`${styles.storyInner} ${isLeft ? styles.layoutLeft : styles.layoutRight}`}>
                  <div className={`${styles.storyImageFrame} ${ratioClass} ${styles.revealItem}`}>
                    <img
                      src={getPublicUrl(story.image_url)}
                      alt={story.title}
                      loading="lazy"
                      className={styles.storyImg}
                    />
                  </div>
                  <div className={`${styles.storyContent} ${styles.revealItem}`}>
                    {story.subtitle && <span className={styles.storySubtitle}>{story.subtitle}</span>}
                    <h2 className={styles.storyTitle}>{story.title}</h2>
                    <p className={styles.storyDesc}>{story.description}</p>
                    {story.button_text && story.button_url && (
                      <a href={story.button_url} className={styles.storyBtn}>
                        {story.button_text}
                      </a>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Mobile Sticky CTAs */}
      <div className={styles.mobileCta}>
        <div className={styles.mobileBtnRow}>
          <button
            className={`${styles.mobileCartBtn} ${addedToCart ? styles.mobileCartBtnDone : ''}`}
            disabled={!selectedSize || isSoldOut}
            onClick={handleAddToCart}
          >
            {addedToCart ? '✓' : '🛒'}
          </button>
          <button
            className="btn btn-primary"
            disabled={!selectedSize || isSoldOut}
            onClick={handleBuyNow}
            style={{ flex: 1 }}
          >
            {isSoldOut
              ? 'OUT OF STOCK'
              : selectedSize
                ? `BUY NOW — ${formatPaise(finalPrice)}`
                : 'SELECT A SIZE'}
          </button>
        </div>
      </div>
      <div className={styles.mobileCtaSpacer} />

      {/* Fullscreen Zoom Lightbox Modal */}
      {fullscreenMedia && (
        <div
          className={styles.fullscreenOverlay}
          onClick={() => {
            setFullscreenMedia(null);
            setFullscreenType(null);
          }}
        >
          <button
            type="button"
            className={styles.closeFullscreen}
            onClick={() => {
              setFullscreenMedia(null);
              setFullscreenType(null);
            }}
          >
            ✕
          </button>
          <div className={styles.fullscreenContent} onClick={(e) => e.stopPropagation()}>
            {fullscreenType === 'video' ? (
              <video src={fullscreenMedia} controls autoPlay playsInline loop className={styles.fullscreenVideo} />
            ) : (
              <img src={fullscreenMedia} alt="Fullscreen view" className={styles.fullscreenImage} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
