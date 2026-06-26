import styles from './orders.module.css';

export default function Loading() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className="skeleton" style={{ width: 140, height: 32, marginBottom: 8 }} />
        <div className="skeleton" style={{ width: 80, height: 14 }} />
      </header>

      <div className={styles.list}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.card} style={{ pointerEvents: 'none', minHeight: 74 }}>
            <div className={styles.cardHeader}>
              <div className="skeleton" style={{ width: 100, height: 16 }} />
              <div className="skeleton" style={{ width: 60, height: 20, borderRadius: 999 }} />
            </div>
            <div className={styles.cardMeta} style={{ marginTop: 8 }}>
              <div className="skeleton" style={{ width: 80, height: 14 }} />
              <div className="skeleton" style={{ width: 60, height: 14 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
