'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

const STORY_STEPS = [
  { img: '/story-1.png', title: 'Raw Black Linen', desc: 'Hand-selected organic linen. Sourced for extreme durability and an uncompromising minimal weave.' },
  { img: '/story-2.png', title: 'Precision Craft', desc: 'Expertly tailored by master artisans. High-tension continuous stitching ensures a flawless drape.' },
  { img: '/story-3.png', title: 'Intense Check', desc: 'Meticulous three-point inspection. We guarantee flawless seams and a midnight-black finish.' },
  { img: '/story-4.png', title: 'Signature Pack', desc: 'Encased seamlessly in our timeless Noir luxury box for maximum premium protection.' },
  { img: '/story-5.png', title: 'Expedited Transit', desc: 'Handled efficiently and dispatched directly to your location with guaranteed expedited care.' },
  { img: '/story-6.png', title: 'The Noir Essential', desc: 'A minimalist masterpiece crafted to endure seamlessly. Designed to define your aesthetic.' },
];

export default function LandingPage() {
  const [sliderValue, setSliderValue] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [storyVisible, setStoryVisible] = useState(false);
  
  const storyRef = useRef<HTMLElement>(null);
  const audioPool = useRef<HTMLAudioElement[]>([]);
  const poolIndex = useRef(0);
  const lastPlay = useRef(0);
  const audioUnlocked = useRef(false);

  // Preload Audio Pool and establish global Interaction Unlock
  useEffect(() => {
    const POOL_SIZE = 5;
    const pool: HTMLAudioElement[] = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const audio = new Audio('/whoosh.mp3');
      audio.preload = 'auto';
      audio.volume = 0.15;
      pool.push(audio);
    }
    audioPool.current = pool;

    // Silent Unlock mechanism to bypass browser auto-play policies
    const unlockAudio = () => {
      if (audioUnlocked.current) return;
      audioUnlocked.current = true;
      
      pool.forEach(audio => {
        audio.muted = true;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.muted = false;
          }).catch(() => {});
        }
      });

      // Cleanup
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };

    window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
    window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
    window.addEventListener('keydown', unlockAudio, { once: true, passive: true });

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const playSound = useCallback(() => {
    if (!audioUnlocked.current) return; // Prevent spamming rejected promises

    const now = Date.now();
    
    // 50ms micro-throttle prevents digital distortion but permits rapid flurries
    if (now - lastPlay.current > 50) {
      if (audioPool.current.length > 0) {
        const audio = audioPool.current[poolIndex.current];
        
        audio.currentTime = 0;
        // Subtle pitch variation for organic mechanics (0.95 to 1.05)
        audio.playbackRate = 0.95 + Math.random() * 0.1;
        
        audio.play().catch(() => {});
        
        // Cycle securely through hardware pool
        poolIndex.current = (poolIndex.current + 1) % audioPool.current.length;
        lastPlay.current = now;
      }
    }
  }, []);

  // Observer for Cinematic Intro
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setStoryVisible(true);
        }
      },
      { threshold: 0.2, rootMargin: '0px 0px -50px 0px' }
    );
    if (storyRef.current) observer.observe(storyRef.current);
    return () => observer.disconnect();
  }, []);

  // Desktop Hover Handler
  const handleHover = (idx: number) => {
    if (window.innerWidth < 1024) return; 
    setSliderValue(idx);
    
    // Throttle sound during hover
    if (Math.abs(sliderValue - idx) > 0.5) playSound();
  };

  // Mobile Continuous Slider Handler
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setSliderValue(val);
    
    // Sound on tick
    if (Math.abs(val - Math.round(val)) < 0.1) playSound();
  };




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
          className={`${styles.heroVideo} ${isVideoReady ? styles.heroVideoReady : ''}`}
          onCanPlay={() => setIsVideoReady(true)}
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
      <section 
        className={`${styles.storySection} ${storyVisible ? styles.storySectionVisible : ''}`}
        ref={storyRef}
      >
        <div className="container-wide">
          <div className={styles.storyHeader}>
            <p className={styles.storySub}>Our Process</p>
            <h2 className={styles.storyTitle}>From Thread to Tailor</h2>
          </div>
          
          <div className={styles.storyStackContainer}>
            {STORY_STEPS.map((step, idx) => {
              const diff = idx - sliderValue;
              const absDiff = Math.abs(diff);
              const direction = Math.sign(diff); // 1 = right stack, -1 = left stack

              // 3D Apple Carousel Math tailored for float transitions
              let translateX = 0;
              let scale = 1;
              let rotateY = 0;
              let z = 10;
              let opacity = 1;
              let blur = 0;

              if (diff !== 0) {
                // Determine shifts ensuring side tiles peek heavily but shrink
                translateX = direction * (10 + absDiff * 60); // Shifts apart iteratively (base 10%, scale + 60%)
                scale = 1 - (absDiff * 0.15); // Scales down 0.85 -> 0.70 ...
                rotateY = direction * -12; // Rotate inwards towards camera
                opacity = 1 - (absDiff * 0.45); // Fade heavily into depth
                z = 10 - absDiff;
                blur = absDiff * 4; // Increment blur per depth stage
              }

              const transformString = `perspective(1000px) translateX(${translateX}%) scale(${scale}) rotateY(${rotateY}deg)`;
              
              // We derive pseudo 'active' status when exact or closest
              const isActive = absDiff < 0.3;

              const inlineStyles = {
                transform: transformString,
                opacity: Math.max(0, opacity),
                zIndex: Math.round(z),
                filter: `blur(${blur}px)`,
                pointerEvents: opacity < 0.1 ? 'none' : 'auto', // disable hover on deeply hidden cards
                transition: isDragging ? 'none' : 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.5s ease, filter 0.5s ease',
              } as React.CSSProperties;

              return (
                <div
                  key={idx}
                  className={`${styles.storyCardWrapper} ${isActive ? styles.storyCardWrapperActive : ''}`}
                  style={inlineStyles}
                  onMouseEnter={() => handleHover(idx)}
                >
                  <div className={styles.storyCard}>
                    <div className={styles.storyImgWrap}>
                      <img src={step.img} alt={step.title} loading="lazy" />
                      {diff !== 0 && <div className={styles.storyOverlay} style={{ opacity: Math.min(absDiff, 1) }} />}
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
          
          <div className={styles.sliderControlWrapper}>
            <input 
              type="range"
              min="0"
              max={STORY_STEPS.length - 1}
              step="0.01"
              value={sliderValue}
              onChange={handleSliderChange}
              onMouseDown={() => setIsDragging(true)}
              onMouseUp={() => setIsDragging(false)}
              onTouchStart={() => setIsDragging(true)}
              onTouchEnd={() => setIsDragging(false)}
              className={styles.glassSlider}
            />
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
