'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import styles from './FeedbackButton.module.css';

export default function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  if (pathname.startsWith('/admin')) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !message.trim()) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), phone: phone.trim() || null, message: message.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setDone(true);
        setTimeout(() => { setOpen(false); setDone(false); setEmail(''); setPhone(''); setMessage(''); }, 2000);
      } else {
        setError(data.error || 'Failed to submit');
      }
    } catch {
      setError('Network error');
    }
    setSubmitting(false);
  }

  return (
    <>
      <button className={styles.fab} onClick={() => setOpen(true)} aria-label="Feedback">
        💬
      </button>

      {open && (
        <div className={styles.overlay} onClick={() => setOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            {done ? (
              <div className={styles.success}>
                <span className={styles.successIcon}>✓</span>
                <p>Thank you for your feedback!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className={styles.modalHeader}>
                  <h3>Send Feedback</h3>
                  <button type="button" className={styles.closeBtn} onClick={() => setOpen(false)}>✕</button>
                </div>
                <div className="input-group" style={{ marginBottom: 'var(--space-3)' }}>
                  <input className="input-field" placeholder="Email *" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="input-group" style={{ marginBottom: 'var(--space-3)' }}>
                  <input className="input-field" placeholder="Phone (optional)" value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
                <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                  <textarea className="input-field" placeholder="Your message *" value={message} onChange={e => setMessage(e.target.value)} rows={4} required style={{ resize: 'vertical', minHeight: '80px' }} />
                </div>
                {error && <p className="input-error-text" style={{ marginBottom: 'var(--space-3)' }}>{error}</p>}
                <button className={`btn btn-primary ${submitting ? 'btn-loading' : ''}`} type="submit" disabled={submitting}>
                  SEND FEEDBACK
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
