'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './account.module.css';

/**
 * Sidebar (or mobile-top) summary card: avatar + name + email + sign out.
 *
 * Stays a thin client component because of the `Sign Out` action — the
 * data itself comes pre-resolved from the parent server component, so
 * we never duplicate the profile fetch.
 */
export default function ProfileCard({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  const initial = (name || email || 'U').charAt(0).toUpperCase();

  return (
    <aside className={styles.summary} aria-label="Account summary">
      <div className={styles.avatar} aria-hidden="true">
        {initial}
      </div>
      <h2 className={styles.summaryName}>{name || 'Your account'}</h2>
      <p className={styles.summaryEmail}>{email}</p>

      <div className={styles.summaryDivider} role="presentation" />

      <button
        type="button"
        onClick={handleSignOut}
        className={styles.signOut}
      >
        Sign out
      </button>
    </aside>
  );
}
