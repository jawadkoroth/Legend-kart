'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatPaise } from '@/lib/format';
import styles from './gift-card.module.css';

export default function GiftCardPage() {
  const router = useRouter();
  
  // Purchase form states
  const [amount, setAmount] = useState('2000');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [senderName, setSenderName] = useState('');
  const [giftMessage, setGiftMessage] = useState('');

  // Balance query states
  const [checkCode, setCheckCode] = useState('');
  const [checkResult, setCheckResult] = useState<number | null>(null);
  const [checkError, setCheckError] = useState('');
  const [checking, setChecking] = useState(false);

  const handlePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail || !amount) return;

    const amountPaise = parseFloat(amount) * 100;
    if (isNaN(amountPaise) || amountPaise <= 0) return;

    const params = new URLSearchParams({
      type: 'gift_card',
      amount_paise: amountPaise.toString(),
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      sender_name: senderName,
      gift_message: giftMessage
    });

    router.push(`/checkout?${params.toString()}`);
  };

  const handleCheckBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkCode.trim()) return;

    setChecking(true);
    setCheckError('');
    setCheckResult(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('gift_cards')
        .select('current_balance_paise')
        .eq('code', checkCode.trim().toUpperCase())
        .maybeSingle();

      if (error) {
        setCheckError(error.message);
      } else if (data) {
        setCheckResult(data.current_balance_paise);
      } else {
        setCheckError('Gift card code not found.');
      }
    } catch (err) {
      setCheckError('Failed to query balance. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.titleSection}>
        <h1 className={styles.title}>Digital Gift Cards</h1>
        <p className={styles.subtitle}>GIVE THE GIFT OF MONOCHROME LUXURY</p>
      </div>

      <div className={styles.cardGlow}>
        <form onSubmit={handlePurchase} className={styles.form}>
          <div className={styles.formGroup}>
            <label className="input-label">Gift Amount (INR)</label>
            <div className={styles.inputGroup}>
              <span className={styles.currencySymbol}>₹</span>
              <input
                type="number"
                min="500"
                max="50000"
                className={styles.amountInput}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
              />
            </div>
            <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Min ₹500, Max ₹50,000</span>
          </div>

          <div className={styles.formGroup}>
            <label className="input-label">Recipient Email</label>
            <input
              type="email"
              className="input-field"
              placeholder="recipient@email.com"
              value={recipientEmail}
              onChange={e => setRecipientEmail(e.target.value)}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className="input-label">Recipient Name</label>
            <input
              type="text"
              className="input-field"
              placeholder="Their Name"
              value={recipientName}
              onChange={e => setRecipientName(e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label className="input-label">Your Name</label>
            <input
              type="text"
              className="input-field"
              placeholder="Your Name"
              value={senderName}
              onChange={e => setSenderName(e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label className="input-label">Personal Message</label>
            <textarea
              rows={3}
              className="input-field"
              placeholder="Write a message..."
              value={giftMessage}
              onChange={e => setGiftMessage(e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>

          <button type="submit" className={styles.submitBtn}>
            Purchase Gift Card
          </button>
        </form>

        {/* Balance Query Widget */}
        <div className={styles.balanceCheck}>
          <h2 className={styles.balanceTitle}>Check Card Balance</h2>
          <form onSubmit={handleCheckBalance} className={styles.balanceRow}>
            <input
              type="text"
              placeholder="PANTHER-XXXX-XXXX"
              className="input-field"
              style={{ textTransform: 'uppercase', flex: 1 }}
              value={checkCode}
              onChange={e => setCheckCode(e.target.value)}
            />
            <button type="submit" className="btn btn-secondary" style={{ width: 'auto' }} disabled={checking}>
              {checking ? 'Checking...' : 'Check'}
            </button>
          </form>

          {checkError && <p className="input-error-text" style={{ marginTop: '8px' }}>{checkError}</p>}
          
          {checkResult !== null && (
            <div className={styles.balanceResult}>
              <span className={styles.balanceLabel}>Current Balance</span>
              <div className={styles.balanceValue}>{formatPaise(checkResult)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
