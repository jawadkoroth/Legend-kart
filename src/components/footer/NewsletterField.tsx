'use client';

import { useState, type FormEvent } from 'react';
import styles from './NewsletterField.module.css';

/**
 * Newsletter field — small client island inside the otherwise
 * server-rendered footer.
 *
 * Editorial tone: the input asks for an email with no leading copy
 * about discounts. Submission status is announced via aria-live so
 * keyboard / screen-reader users get feedback without a popup.
 *
 * Failure modes degrade quietly. We don't expose backend error
 * detail; ops watches `newsletter.insert_failed` events for that.
 */

type Status = 'idle' | 'loading' | 'ok' | 'error';

export default function NewsletterField({
  source = 'footer',
}: {
  source?: 'footer' | 'about' | 'journal' | 'product';
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'loading') return;

    const trimmed = email.trim();
    if (!trimmed) {
      setStatus('error');
      setMessage('Please enter your email.');
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, source }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Could not subscribe right now.');
        return;
      }
      setStatus('ok');
      setMessage('Noted.');
      setEmail('');
    } catch {
      setStatus('error');
      setMessage('Could not subscribe right now.');
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <label className={styles.label} htmlFor="newsletter-email">
        Occasional releases and editorial updates.
      </label>
      <div className={styles.row}>
        <input
          id="newsletter-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="email"
          className={styles.input}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status !== 'idle') {
              setStatus('idle');
              setMessage('');
            }
          }}
          disabled={status === 'loading'}
          required
        />
        <button
          type="submit"
          className={styles.submit}
          disabled={status === 'loading' || status === 'ok'}
          aria-label="Subscribe"
        >
          {status === 'loading' ? '…' : '→'}
        </button>
      </div>
      <p
        className={`${styles.status} ${
          status === 'error' ? styles.statusError : ''
        } ${status === 'ok' ? styles.statusOk : ''}`}
        aria-live="polite"
      >
        {message || '\u00A0'}
      </p>
    </form>
  );
}
