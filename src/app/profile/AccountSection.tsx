'use client';

import { useId, useState, type ReactNode } from 'react';
import styles from './account.module.css';

/**
 * Generic dashboard section card.
 *
 * Two modes:
 *
 *   1. Static (default) — renders a regular card. Header is plain
 *      text, body + footer are always visible. Used for the Orders
 *      card whose recent-orders preview must always be in view.
 *
 *   2. Collapsible — pass `collapsible`. The header becomes a button
 *      that toggles a body region with proper aria-expanded /
 *      aria-controls wiring. `defaultExpanded` chooses the initial
 *      state; `summary` is shown next to the title while collapsed
 *      (e.g. "2 saved addresses") so the user can read the row's
 *      shape without expanding it.
 *
 * Critical invariants:
 *   - The component is a client component (state lives here), but it
 *     accepts server-rendered children safely; React preserves the
 *     server tree on hydration.
 *   - Disabled and collapsed are independent. A disabled section
 *     cannot be toggled.
 */
interface CommonProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  disabled?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
}

interface CollapsibleProps extends CommonProps {
  collapsible: true;
  defaultExpanded?: boolean;
  /**
   * Short summary line shown next to the title while collapsed —
   * e.g. "2 saved addresses". Hidden when expanded so it doesn't
   * duplicate the body.
   */
  summary?: string;
}

interface StaticProps extends CommonProps {
  collapsible?: false;
  defaultExpanded?: never;
  summary?: never;
}

type Props = CollapsibleProps | StaticProps;

export default function AccountSection(props: Props) {
  const {
    icon,
    title,
    description,
    disabled = false,
    children,
    footer,
  } = props;

  const collapsible = props.collapsible === true;
  const initialExpanded = collapsible ? props.defaultExpanded !== false : true;
  const summary = collapsible ? props.summary : undefined;

  const [expanded, setExpanded] = useState(initialExpanded);
  const bodyId = useId();

  const open = !collapsible || expanded;

  return (
    <section
      className={`${styles.section} ${disabled ? styles.sectionDisabled : ''} ${collapsible ? styles.sectionCollapsible : ''} ${open ? styles.sectionOpen : ''}`}
      aria-disabled={disabled || undefined}
    >
      {collapsible ? (
        <button
          type="button"
          className={styles.sectionHeaderBtn}
          aria-expanded={expanded}
          aria-controls={bodyId}
          disabled={disabled}
          onClick={() => setExpanded(v => !v)}
        >
          <span className={styles.sectionHeader}>
            {icon ? (
              <span className={styles.sectionIcon} aria-hidden="true">
                {icon}
              </span>
            ) : null}
            <span className={styles.sectionHeaderText}>
              <span className={styles.sectionTitleRow}>
                <h3 className={styles.sectionTitle}>{title}</h3>
                {summary && !expanded ? (
                  <span className={styles.sectionSummary}>{summary}</span>
                ) : null}
              </span>
              {description ? (
                <p className={styles.sectionDescription}>{description}</p>
              ) : null}
            </span>
          </span>
          <span aria-hidden="true" className={styles.sectionChevron}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>
      ) : (
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
      )}

      {open && children ? (
        <div id={bodyId} className={styles.sectionBody}>
          {children}
        </div>
      ) : null}

      {open && footer ? (
        <div className={styles.sectionFooter}>{footer}</div>
      ) : null}
    </section>
  );
}
