'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import styles from './page.module.css';

const STORY_STEPS = [
  { img: '/story-1.png', title: 'Raw Material', desc: 'Sourcing the finest organic black linen.' },
  { img: '/story-2.png', title: 'Craftsmanship', desc: 'Precision stitching by master tailors.' },
  { img: '/story-3.png', title: 'Quality Check', desc: 'Rigorous inspection for flawless details.' },
  { img: '/story-4.png', title: 'Packaging', desc: 'Minimalist luxury matte box.' },
  { img: '/story-5.png', title: 'Shipping', desc: 'Secure transit to your doorstep.' },
  { img: '/story-6.png', title: 'The Noir Shirt', desc: 'Timeless style, ready to wear.' },
];

export default function LandingPage() {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: false, dragFree: true, containScroll: 'trimSnaps' }
  );

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
          
          <div className={styles.emblaViewport} ref={emblaRef}>
            <div className={styles.emblaContainer}>
              {STORY_STEPS.map((step, idx) => (
                <div key={idx} className={styles.emblaSlide}>
                  <div className={styles.storyCard}>
                    <div className={styles.storyImgWrap}>
                      <img src={step.img} alt={step.title} loading="lazy" />
                      <div className={styles.storyStepNum}>0{idx + 1}</div>
                    </div>
                    <div className={styles.storyInfo}>
                      <h3 className={styles.storyItemTitle}>{step.title}</h3>
                      <p className={styles.storyItemDesc}>{step.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
