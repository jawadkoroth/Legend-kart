import Link from 'next/link';
import styles from './page.module.css';

export default function LandingPage() {
  return (
    <div className={styles.page}>
      {/* Navbar */}
      <nav className={styles.navbar}>
        <span className={styles.logo}>NOIR</span>
        <Link href="/product/noir-linen-shirt" className={styles.navLink}>Shop</Link>
      </nav>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroOverlay} />
        <img
          src="/product-3.png"
          alt="Premium Black Fashion"
          className={styles.heroImage}
        />
        <div className={styles.heroContent}>
          <p className={styles.heroTag}>Premium Essentials</p>
          <h1 className={styles.heroTitle}>Crafted in&nbsp;Black</h1>
          <p className={styles.heroSubtitle}>
            Minimal design. Premium linen. Made&nbsp;for&nbsp;those who know.
          </p>
          <Link href="/product/noir-linen-shirt" className={styles.heroCta}>
            SHOP NOW →
          </Link>
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
            <span className={styles.valueIcon}>✦</span>
            <h3 className={styles.valueTitle}>Premium Fabric</h3>
            <p className={styles.valueDesc}>100% natural linen, sourced and stitched with care</p>
          </div>
          <div className={styles.valueCard}>
            <span className={styles.valueIcon}>◈</span>
            <h3 className={styles.valueTitle}>Minimal Design</h3>
            <p className={styles.valueDesc}>No logos, no noise — just timeless simplicity</p>
          </div>
          <div className={styles.valueCard}>
            <span className={styles.valueIcon}>⬡</span>
            <h3 className={styles.valueTitle}>Made in India</h3>
            <p className={styles.valueDesc}>Designed and crafted with Indian craftsmanship</p>
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
