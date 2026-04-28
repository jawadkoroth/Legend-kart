import styles from './page.module.css';

/**
 * Skeleton for the product detail page. Mirrors the real layout's
 * gallery aspect-ratio (4:5 mobile / sticky max 560px desktop) and
 * content column width to avoid CLS on data load.
 */
export default function Loading() {
  return (
    <div className={styles.page}>
      <div className={styles.desktopLayout}>
        <div className={styles.galleryWrap}>
          <div className={styles.heroSkeleton}>
            <div className="skeleton" style={{ width: '100%', height: '100%' }} />
          </div>
        </div>

        <div className={styles.content}>
          <div className="skeleton" style={{ width: '70%', height: 32, marginBottom: 16 }} />
          <div className="skeleton" style={{ width: 140, height: 24, marginBottom: 24 }} />
          <div className="skeleton" style={{ width: '100%', height: 14, marginBottom: 8 }} />
          <div className="skeleton" style={{ width: '90%', height: 14, marginBottom: 8 }} />
          <div className="skeleton" style={{ width: '80%', height: 14, marginBottom: 32 }} />

          <div className="skeleton" style={{ width: 100, height: 14, marginBottom: 12 }} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ width: 56, height: 44 }} />
            ))}
          </div>

          <div className="skeleton" style={{ width: '100%', height: 48, marginBottom: 12 }} />
          <div className="skeleton" style={{ width: '100%', height: 48 }} />
        </div>
      </div>
    </div>
  );
}
