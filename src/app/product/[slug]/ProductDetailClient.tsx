'use client';

import { useState, useCallback, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import useEmblaCarousel from 'embla-carousel-react';
import { useCart } from '@/lib/cart';
import { useWishlist } from '@/lib/wishlist';
import { useAuth } from '@/lib/auth/AuthProvider';
import { createClient } from '@/lib/supabase/client';
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
  category?: string;
  tags?: string[];
}

export interface InventoryItem {
  size: string;
  stock: number;
}

interface Review {
  id: string;
  rating: number;
  title: string | null;
  content: string;
  is_verified_purchase: boolean;
  helpful_count: number;
  is_pinned: boolean;
  created_at: string;
  reviewer_name?: string;
}

interface QA {
  id: string;
  question: string;
  answer: string | null;
  created_at: string;
}

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
  const { isWishlisted, toggleWishlist } = useWishlist();
  const { user } = useAuth();
  
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

  // Tab State
  const [activeTab, setActiveTab] = useState<'reviews' | 'qa'>('reviews');

  // Customer reviews & QAs state
  const [reviews, setReviews] = useState<Review[]>([]);
  const [qas, setQas] = useState<QA[]>([]);
  const [averageRating, setAverageRating] = useState(0);

  // Form states
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewContent, setReviewContent] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState('');
  const [reviewError, setReviewError] = useState('');

  const [qaQuestion, setQaQuestion] = useState('');
  const [qaSuccess, setQaSuccess] = useState('');
  const [qaError, setQaError] = useState('');

  // Recommendations and viewed states
  const [recommendedProducts, setRecommendedProducts] = useState<ProductDetail[]>([]);
  const [recentlyViewedProducts, setRecentlyViewedProducts] = useState<ProductDetail[]>([]);
  const [frequentlyBoughtTogether, setFrequentlyBoughtTogether] = useState<ProductDetail[]>([]);

  // Share tooltip
  const [copiedLink, setCopiedLink] = useState(false);

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

  // Load reviews, Q&As, Recommendations & Recently Viewed
  useEffect(() => {
    const supabase = createClient();

    async function loadProductData() {
      // 1. Fetch reviews
      const { data: dbReviews } = await supabase
        .from('product_reviews')
        .select('*, profiles(email)')
        .eq('product_id', product.id)
        .eq('is_approved', true)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (dbReviews) {
        const formattedReviews: Review[] = dbReviews.map((r: any) => ({
          id: r.id,
          rating: r.rating,
          title: r.title,
          content: r.content,
          is_verified_purchase: r.is_verified_purchase,
          helpful_count: r.helpful_count,
          is_pinned: r.is_pinned,
          created_at: r.created_at,
          reviewer_name: r.profiles?.email ? r.profiles.email.split('@')[0] : 'Verified Buyer'
        }));
        setReviews(formattedReviews);
        if (formattedReviews.length > 0) {
          const avg = formattedReviews.reduce((sum, r) => sum + r.rating, 0) / formattedReviews.length;
          setAverageRating(Math.round(avg * 10) / 10);
        }
      }

      // 2. Fetch Q&As
      const { data: dbQas } = await supabase
        .from('product_qas')
        .select('*')
        .eq('product_id', product.id)
        .eq('is_approved', true)
        .order('created_at', { ascending: false });

      if (dbQas) {
        setQas(dbQas);
      }

      // 3. Fetch Recommendations (by category / tag)
      const { data: dbRecs } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .neq('id', product.id)
        .limit(4); // categories / tags filter if desired, or random best sellers
      if (dbRecs) {
        setRecommendedProducts(dbRecs);
      }

      // 4. Fetch Frequently Bought Together (FBT) links configured by Admin
      const { data: dbFbt } = await supabase
        .from('frequently_bought_together')
        .select('product_id_a, product_id_b')
        .or(`product_id_a.eq.${product.id},product_id_b.eq.${product.id}`);

      if (dbFbt && dbFbt.length > 0) {
        const relatedIds = dbFbt.map(row => 
          row.product_id_a === product.id ? row.product_id_b : row.product_id_a
        );
        const { data: relatedProducts } = await supabase
          .from('products')
          .select('*')
          .in('id', relatedIds)
          .eq('is_active', true);
        if (relatedProducts) {
          setFrequentlyBoughtTogether(relatedProducts);
        }
      }
    }

    loadProductData();
  }, [product.id]);

  // Track Recently Viewed (LocalStorage and DB Sync)
  useEffect(() => {
    const supabase = createClient();
    const storageKey = 'panther_recently_viewed';

    async function trackView() {
      // Fetch details from local storage
      let viewedIds: string[] = [];
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        try {
          viewedIds = JSON.parse(raw);
        } catch {
          viewedIds = [];
        }
      }

      // Prepend and dedup
      viewedIds = [product.id, ...viewedIds.filter(id => id !== product.id)].slice(0, 10);
      localStorage.setItem(storageKey, JSON.stringify(viewedIds));

      // Sync to database if user is logged in
      if (user) {
        try {
          await supabase
            .from('recently_viewed')
            .upsert({ user_id: user.id, product_id: product.id }, { onConflict: 'user_id,product_id' });
        } catch (err) {
          console.error('Failed to sync recently viewed item to DB', err);
        }
      }

      // Resolve product data for carousel preview
      const { data: loadedViewed } = await supabase
        .from('products')
        .select('*')
        .in('id', viewedIds.filter(id => id !== product.id))
        .eq('is_active', true);
      
      if (loadedViewed) {
        // Sort to match order of viewedIds
        const sorted = loadedViewed.sort((a, b) => viewedIds.indexOf(a.id) - viewedIds.indexOf(b.id));
        setRecentlyViewedProducts(sorted);
      }
    }

    trackView();
  }, [product.id, user]);

  // Submit Review Handler
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReviewSuccess('');
    setReviewError('');
    if (!user) {
      setReviewError('You must be logged in to submit a review.');
      return;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from('product_reviews')
      .insert({
        product_id: product.id,
        user_id: user.id,
        rating: reviewRating,
        title: reviewTitle,
        content: reviewContent,
        is_approved: false // Moderation required
      });

    if (error) {
      setReviewError(error.message);
    } else {
      setReviewSuccess('Thank you! Your review has been submitted for administration review.');
      setReviewTitle('');
      setReviewContent('');
      setReviewRating(5);
    }
  };

  // Submit Question Handler
  const handleQuestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setQaSuccess('');
    setQaError('');
    if (!qaQuestion.trim()) return;

    const supabase = createClient();
    const { error } = await supabase
      .from('product_qas')
      .insert({
        product_id: product.id,
        user_id: user?.id || null,
        question: qaQuestion,
        is_approved: false // Moderation required
      });

    if (error) {
      setQaError(error.message);
    } else {
      setQaSuccess('Your question has been submitted and will appear once answered by administrators.');
      setQaQuestion('');
    }
  };

  // Increment helpful review count
  const handleHelpfulIncrement = async (reviewId: string) => {
    const supabase = createClient();
    // Fetch current count to increment safely
    const target = reviews.find(r => r.id === reviewId);
    if (!target) return;

    const { error } = await supabase
      .from('product_reviews')
      .update({ helpful_count: target.helpful_count + 1 })
      .eq('id', reviewId);

    if (!error) {
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, helpful_count: r.helpful_count + 1 } : r));
    }
  };

  // Share copy
  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

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
        {/* Embla Image & Video Carousel */}
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
          <div>
            <h1 className={styles.productName}>{product.name}</h1>
            <div className={styles.priceRow}>
              <span className={styles.price}>{formatPaise(finalPrice)}</span>
              {(hasSalePrice || discountAmount > 0) && (
                <span className={styles.originalPrice}>
                  {formatPaise(hasSalePrice && discountAmount > 0 ? originalPrice : (hasSalePrice ? originalPrice : basePrice))}
                </span>
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

            {/* Size Prediction Placeholder Hook */}
            <div className={styles.sizeRecommendationBox}>
              <span>📏</span>
              <span>
                <strong>Predictive Size Recommender:</strong> Unsure about sizing? predicting your fit is coming in future upgrades!
              </span>
            </div>

            {/* Coupon */}
            <div className={styles.section} style={{ marginTop: 'var(--space-6)' }}>
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

            {/* Desktop CTAs & Wishlist integration */}
            <div className={styles.desktopCta}>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
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
                <button
                  className={`${styles.wishlistBtn} ${isWishlisted(product.id) ? styles.wishlistBtnActive : ''}`}
                  onClick={() => toggleWishlist(product.id)}
                  aria-label="Wishlist"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill={isWishlisted(product.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>
              </div>
              <button
                className={`btn btn-secondary ${addedToCart ? 'btn-success' : ''}`}
                disabled={!selectedSize || isSoldOut}
                onClick={handleAddToCart}
                style={{ marginTop: 'var(--space-3)' }}
              >
                {addedToCart ? '✓ ADDED TO CART' : 'ADD TO CART'}
              </button>
            </div>

            {/* Native Sharing Tools */}
            <div className={styles.sharingContainer}>
              <span className={styles.shareTitle}>Share this piece:</span>
              <button className={styles.shareLink} onClick={handleCopyLink} title="Copy product URL">
                {copiedLink ? '✓' : '🔗'}
              </button>
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${product.name} - ${window.location.href}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.shareLink}
                title="Share on WhatsApp"
              >
                💬
              </a>
              <a
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(product.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.shareLink}
                title="Share on Twitter"
              >
                𝕏
              </a>
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
              <section key={story.id || idx} className={`${styles.storySection} ${bgClass}`}>
                <div className={`${styles.storyInner} ${isLeft ? styles.layoutLeft : styles.layoutRight}`}>
                  <div className={`${styles.storyImageFrame} ${ratioClass} ${styles.revealItem}`}>
                    <img src={getPublicUrl(story.image_url)} alt={story.title} loading="lazy" className={styles.storyImg} />
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

      {/* Frequently Bought Together recommendation section */}
      {frequentlyBoughtTogether.length > 0 && (
        <section className={styles.carouselSection}>
          <h2 className={styles.carouselTitle}>Frequently Bought Together</h2>
          <div className={styles.recommendationsGrid}>
            {frequentlyBoughtTogether.map(p => {
              const cover = getPublicUrl(p.images?.[0]) || '/product-1.png';
              return (
                <a href={`/product/${p.slug}`} key={p.id} className={styles.shareLink} style={{ display: 'flex', flexDirection: 'column', width: 'auto', height: 'auto', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', textDecoration: 'none', border: '1px solid var(--border-color)', background: 'rgba(15,15,15,0.6)' }}>
                  <img src={cover} alt={p.name} style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 'var(--space-2)' }}>{p.name}</span>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--accent-gold)' }}>{formatPaise(p.price_paise)}</span>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* Recommendations matching tag or category */}
      {recommendedProducts.length > 0 && (
        <section className={styles.carouselSection}>
          <h2 className={styles.carouselTitle}>Recommended Products</h2>
          <div className={styles.recommendationsGrid}>
            {recommendedProducts.map(p => {
              const cover = getPublicUrl(p.images?.[0]) || '/product-1.png';
              return (
                <a href={`/product/${p.slug}`} key={p.id} style={{ display: 'flex', flexDirection: 'column', padding: 'var(--space-3)', textDecoration: 'none', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'rgba(15,15,15,0.6)', transition: 'all 0.2s' }}>
                  <img src={cover} alt={p.name} style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 'var(--space-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--accent-gold)', marginTop: '2px' }}>{formatPaise(p.price_paise)}</span>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* Recently Viewed carousel */}
      {recentlyViewedProducts.length > 0 && (
        <section className={styles.carouselSection}>
          <h2 className={styles.carouselTitle}>Recently Viewed</h2>
          <div className={styles.horizontalScroll}>
            {recentlyViewedProducts.map(p => {
              const cover = getPublicUrl(p.images?.[0]) || '/product-1.png';
              return (
                <a href={`/product/${p.slug}`} key={p.id} style={{ flex: '0 0 180px', display: 'flex', flexDirection: 'column', padding: 'var(--space-3)', textDecoration: 'none', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'rgba(15,15,15,0.6)' }}>
                  <img src={cover} alt={p.name} style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-primary)', marginTop: 'var(--space-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold)' }}>{formatPaise(p.price_paise)}</span>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* Reviews & Q&As Tab Area */}
      <div className={styles.tabContainer}>
        <div className={styles.tabHeader}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'reviews' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('reviews')}
          >
            Reviews ({reviews.length})
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'qa' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('qa')}
          >
            Questions & Answers ({qas.length})
          </button>
        </div>

        {activeTab === 'reviews' ? (
          <div>
            <div className={styles.reviewSummaryCard}>
              <div className={styles.ratingBig}>
                <span className={styles.ratingBigNum}>{averageRating > 0 ? averageRating : '—'}</span>
                <div className={styles.ratingStars}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i}>{i < Math.round(averageRating) ? '★' : '☆'}</span>
                  ))}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Based on {reviews.length} reviews</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--text-secondary)' }}>
                  Verified reviews from our premium patrons. Every purchase guarantees unmatched craftsmanship.
                </p>
              </div>
            </div>

            {reviews.length > 0 ? (
              <div className={styles.reviewsList}>
                {reviews.map(r => (
                  <div key={r.id} className={`${styles.reviewItem} ${r.is_pinned ? styles.reviewItemPinned : ''}`}>
                    {r.is_pinned && <span className={styles.pinnedPill}>Pinned</span>}
                    <div className={styles.reviewHeader}>
                      <div className={styles.reviewerInfo}>
                        <span className={styles.reviewerName}>
                          {r.reviewer_name}
                          {r.is_verified_purchase && <span className={styles.verifiedBadge}>Verified</span>}
                        </span>
                        <div className={styles.ratingStars} style={{ margin: '2px 0' }}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} style={{ fontSize: '0.75rem' }}>{i < r.rating ? '★' : '☆'}</span>
                          ))}
                        </div>
                      </div>
                      <span className={styles.reviewDate}>{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                    {r.title && <h4 className={styles.reviewTitle}>{r.title}</h4>}
                    <p className={styles.reviewContent}>{r.content}</p>
                    <div className={styles.reviewFooter}>
                      <button className={styles.helpfulBtn} onClick={() => handleHelpfulIncrement(r.id)}>
                        👍 Helpful ({r.helpful_count})
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-6) 0' }}>No reviews yet. Be the first to review this piece.</p>
            )}

            {/* Write a Review form */}
            <div className={styles.formCard}>
              <h3 className={styles.formTitle}>Write a Review</h3>
              {reviewSuccess && <p className="input-success-text">{reviewSuccess}</p>}
              {reviewError && <p className="input-error-text">{reviewError}</p>}
              <form onSubmit={handleReviewSubmit} className={styles.formGrid}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <label className="input-label">Overall Rating</label>
                  <div style={{ display: 'flex', gap: '8px', cursor: 'pointer', fontSize: '1.5rem', color: 'var(--accent-gold)' }}>
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <span key={idx} onClick={() => setReviewRating(idx + 1)}>
                        {idx < reviewRating ? '★' : '☆'}
                      </span>
                    ))}
                  </div>

                  <label className="input-label" style={{ marginTop: 'var(--space-2)' }}>Review Title</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Masterful craftsmanship"
                    value={reviewTitle}
                    onChange={e => setReviewTitle(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <label className="input-label">Review Details</label>
                  <textarea
                    rows={4}
                    className="input-field"
                    placeholder="Tell us about the drape, the texture, and your experience..."
                    value={reviewContent}
                    onChange={e => setReviewContent(e.target.value)}
                    required
                    style={{ resize: 'vertical' }}
                  />
                  <button type="submit" className="btn btn-primary" style={{ marginTop: 'var(--space-2)' }}>
                    Submit Review
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <div>
            {qas.length > 0 ? (
              <div className={styles.qaList}>
                {qas.map(item => (
                  <div key={item.id} className={styles.qaItem}>
                    <h4 className={styles.qaQuestion}>Q: {item.question}</h4>
                    <p className={styles.qaAnswer}>
                      <strong>PANTHER Admin:</strong> {item.answer || 'We will update you with an answer shortly.'}
                    </p>
                    <span className={styles.qaMeta}>Asked on {new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-6) 0' }}>No questions have been asked yet.</p>
            )}

            {/* Ask a Question form */}
            <div className={styles.formCard}>
              <h3 className={styles.formTitle}>Ask a Question</h3>
              {qaSuccess && <p className="input-success-text">{qaSuccess}</p>}
              {qaError && <p className="input-error-text">{qaError}</p>}
              <form onSubmit={handleQuestionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <textarea
                  rows={3}
                  className="input-field"
                  placeholder="Ask us anything about materials, dimensions, or styling..."
                  value={qaQuestion}
                  onChange={e => setQaQuestion(e.target.value)}
                  required
                />
                <button type="submit" className="btn btn-primary" style={{ width: 'fit-content' }}>
                  Submit Question
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Sticky CTAs & Wishlist integration */}
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
          <button
            className={`${styles.wishlistBtn} ${isWishlisted(product.id) ? styles.wishlistBtnActive : ''}`}
            onClick={() => toggleWishlist(product.id)}
            aria-label="Wishlist"
            style={{ width: '48px', height: '48px', margin: 0 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill={isWishlisted(product.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>
      </div>
      <div className={styles.mobileCtaSpacer} />

      {/* Fullscreen Zoom Modal */}
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
