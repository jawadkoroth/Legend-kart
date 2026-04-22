'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

const STORY_STEPS = [
  { img: '/story-1.png', title: 'From Raw Thread to Premium Masterpiece', desc: 'Starting strictly with the finest, sustainably harvested organic black linen. Hand-selected for extreme durability, a flawless minimalist weave, and an uncompromising premium texture.' },
  { img: '/story-2.png', title: 'Precision Craftsmanship', desc: 'Expertly tailored by master artisans using continuous high-tension stitching for a perfect drape.' },
  { img: '/story-3.png', title: 'Intense Quality Check', desc: 'Meticulous three-point inspection granting flawless seams and a continuous midnight-black finish.' },
  { img: '/story-4.png', title: 'Signature Packaging', desc: 'Encased seamlessly in our timeless Noir matte luxury box.' },
  { img: '/story-5.png', title: 'Expedited Transit', desc: 'Handled efficiently and dispatched directly to your location with guaranteed care.' },
  { img: '/story-6.png', title: 'The Noir Essential', desc: 'A minimalist masterpiece crafted to endure. Designed to define.' },
];

export default function LandingPage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Preload Audio
  useEffect(() => {
    audioRef.current = new Audio('/whoosh.mp3');
    audioRef.current.volume = 0.15;
  }, []);

  const playSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {}); // Catch autoplay rejections safely
    }
  }, []);

  // Desktop Hover Handler
  const handleHover = (idx: number) => {
    if (window.innerWidth < 1024) return; // Prevent hover logic triggering on mobile layout
    if (idx !== activeIndex) {
      setActiveIndex(idx);
      playSound();
    }
  };

  // Mobile Centering Observer
  useEffect(() => {
    if (window.innerWidth >= 1024) return;

    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const newIdx = parseInt(entry.target.getAttribute('data-story-idx') || '0', 10);
          setActiveIndex(prev => {
            if (prev !== newIdx) {
              playSound();
              return newIdx;
            }
            return prev;
          });
        }
      });
    }, {
      root: null, // viewport
      rootMargin: '0px -50% 0px -50%', // center line
      threshold: 0
    });

    const elements = document.querySelectorAll('[data-story-idx]');
    elements.forEach(el => observerRef.current?.observe(el));

    return () => observerRef.current?.disconnect();
  }, [playSound]);


  return (
    <div className={styles.page}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroOverlay} />
        <video
          autoPlay
          loop
          muted
          playsInline
          className={styles.heroVideo}
          poster="/product-3.png"
        >
          <source src="https://ajyubbfheptelvjvpzts.supabase.co/storage/v1/object/sign/test%20-video-noir/Man_wearing_linen_202604220055.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8yZjUzZTAxZC01MzE3LTQxMmEtYmM5YS0yYzU4NmZmZmUwNzQiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0ZXN0IC12aWRlby1ub2lyL01hbl93ZWFyaW5nX2xpbmVuXzIwMjYwNDIyMDA1NS5tcDQiLCJpYXQiOjE3NzY3OTk2NTMsImV4cCI6MjA5MjE1OTY1M30.9MYJihhB73Ms3KO4U_JnAOa_p4YEQzk0gqNEp-ZfFHY" type="video/mp4" />
        </video>
        <div className={styles.heroContent}>
          <p className={styles.heroTag}>Premium Essentials</p>
          <h1 className={styles.heroTitle}>Crafted in&nbsp;Black</h1>
          <p className={styles.heroSubtitle}>
            Minimal design. Premium linen. Made&nbsp;for&nbsp;those who know.
          </p>
        </div>
      </section>

      {/* Brand Story Slider */}
      <section className={styles.storySection}>
        <div className="container-wide">
          <div className={styles.storyHeader}>
            <p className={styles.storySub}>Our Process</p>
            <h2 className={styles.storyTitle}>From Thread to Tailor</h2>
          </div>
          
          <div className={styles.storyStackContainer}>
            {STORY_STEPS.map((step, idx) => {
              const diff = idx - activeIndex;

              // Compute Desktop Transforms
              let deskTransform = 'translateX(0) scale(1)';
              let deskOpacity = 1;
              let deskZ = 10;
              let deskPointer = 'auto';

              if (diff > 0) {
                // Stacked to the right behind
                deskTransform = `translateX(${diff * 60}px) scale(${1 - diff * 0.05})`;
                deskOpacity = Math.max(1 - diff * 0.25, 0);
                deskZ = 10 - diff;
              } else if (diff < 0) {
                // Pushed away to the left & hidden fully
                deskTransform = `translateX(${diff * 80}px) scale(${1 + diff * 0.05})`;
                deskOpacity = 0;
                deskZ = 10 + diff;
                deskPointer = 'none';
              }

              // Dynamic Inline Style variables for Desktop
              const inlineStyles = {
                '--desk-transform': deskTransform,
                '--desk-opacity': deskOpacity,
                '--desk-z': deskZ,
                '--desk-pointer': deskPointer,
              } as React.CSSProperties;

              return (
                <div
                  key={idx}
                  data-story-idx={idx}
                  className={`${styles.storyCardWrapper} ${idx === activeIndex ? styles.storyCardWrapperActive : ''}`}
                  style={inlineStyles}
                  onMouseEnter={() => handleHover(idx)}
                >
                  <div className={styles.storyCard}>
                    <div className={styles.storyImgWrap}>
                      <img src={step.img} alt={step.title} loading="lazy" />
                      <div className={styles.storyOverlay} />
                      <div className={styles.storyStepNum}>0{idx + 1}</div>
                    </div>
                    <div className={styles.storyInfo}>
                      <h3 className={styles.storyItemTitle}>{step.title}</h3>
                      <p className={styles.storyItemDesc}>{step.desc}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Featured Product */}
      <section className={styles.featured}>
        <div className={styles.featuredInner}>
          <div className={styles.featuredImageWrap}>
            <img
              src="/product-1.png"
              alt="The Noir Linen Shirt"
              className={styles.featuredImage}
            />
          </div>
          <div className={styles.featuredInfo}>
            <p className={styles.featuredLabel}>Featured</p>
            <h2 className={styles.featuredTitle}>The Noir Linen&nbsp;Shirt</h2>
            <p className={styles.featuredDesc}>
              Handcrafted from premium black linen. Breathable fabric with a relaxed fit
              that transitions effortlessly from day to&nbsp;night.
            </p>
            <div className={styles.featuredMeta}>
              <span className={styles.featuredPrice}>₹1,299</span>
              <span className={styles.featuredBadge}>Free Shipping</span>
            </div>
            <Link href="/product/noir-linen-shirt" className={styles.featuredCta}>
              VIEW PRODUCT →
            </Link>
          </div>
        </div>
      </section>

      {/* Brand Values */}
      <section className={styles.values}>
        <div className={styles.valuesGrid}>
          <div className={styles.valueCard}>
            <h3 className={styles.valueTitle}>Premium Fabric</h3>
            <p className={styles.valueDesc}>100% natural linen, sourced and stitched with care</p>
          </div>
          <div className={styles.valueCard}>
            <h3 className={styles.valueTitle}>Minimal Design</h3>
            <p className={styles.valueDesc}>No logos, no noise — just timeless simplicity</p>
          </div>
          <div className={styles.valueCard}>
            <h3 className={styles.valueTitle}>Made in India</h3>
            <p className={styles.valueDesc}>Designed and crafted with pure Indian craftsmanship</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <span className={styles.footerLogo}>NOIR</span>
        <p className={styles.footerText}>Premium Black Fashion — Made in India</p>
        <div className={styles.footerLinks}>
          <span>🚚 Free Shipping</span>
          <span>💰 COD Available</span>
          <span>↩️ Easy Returns</span>
        </div>
      </footer>
    </div>
  );
}
