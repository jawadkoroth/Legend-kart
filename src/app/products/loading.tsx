import styles from './page.module.css';

/**
 * Skeleton for /products. Mirrors the real grid's `aspect-ratio` and
 * card heights so navigation produces zero CLS.
 */
export default function Loading() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div
            className="skeleton"
            style={{ width: 110, height: 12, marginBottom: 12 }}
          />
          <div className="skeleton" style={{ width: 220, height: 36 }} />
        </div>
        <div className="skeleton" style={{ width: 200, height: 32 }} />
      </div>

      <div className={styles.grid} aria-hidden>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md, 6px)',
              overflow: 'hidden',
              background: 'var(--bg-secondary)',
            }}
          >
            <div
              className="skeleton"
              style={{ width: '100%', aspectRatio: '1 / 1' }}
            />
            <div style={{ padding: '16px' }}>
              <div
                className="skeleton"
                style={{ width: '70%', height: 14, marginBottom: 8 }}
              />
              <div className="skeleton" style={{ width: '40%', height: 14 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
