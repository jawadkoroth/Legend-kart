import type { ReactNode } from 'react';
import styles from './account.module.css';

/**
 * Generic dashboard section card.
 *
 * Pure presentational component (server-friendly). Used for Profile,
 * Orders, Addresses, and Settings tiles in /profile. Future surfaces
 * (returns, subscriptions, payment methods, etc.) plug in by re-using
 * this component — that's the scalability hook.
 */
export default function AccountSection({
  icon,
  title,
  description,
  disabled = false,
  children,
  footer,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  disabled?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section
      className={`${styles.section} ${disabled ? styles.sectionDisabled : ''}`}
      aria-disabled={disabled || undefined}
    >
      <header className={styles.sectionHeader}>
        {icon ? (
          <span className={styles.sectionIcon} aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div>
          <h3 className={styles.sectionTitle}>{title}</h3>
          {description ? (
            <p className={styles.sectionDescription}>{description}</p>
          ) : null}
        </div>
      </header>

      {children ? <div className={styles.sectionBody}>{children}</div> : null}

      {footer ? <div className={styles.sectionFooter}>{footer}</div> : null}
    </section>
  );
}
