'use client';

import React, { useState } from 'react';
import styles from './referral.module.css';

interface LedgerEntry {
  id: string;
  points_changed: number;
  reason: string;
  created_at: string;
}

interface ReferralEntry {
  id: string;
  referred_email: string;
  status: 'pending' | 'signed_up' | 'purchased';
  reward_points: number;
  created_at: string;
}

interface ReferralClientProps {
  referralCode: string;
  loyaltyPoints: number;
  ledger: LedgerEntry[];
  referrals: ReferralEntry[];
}

export default function ReferralClient({
  referralCode,
  loyaltyPoints,
  ledger,
  referrals,
}: ReferralClientProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const getReferralUrl = () => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/auth?ref=${referralCode}`;
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getReferralUrl());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div>
      <div className={styles.dashboardGrid}>
        {/* Loyalty Balance Card */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Loyalty Status</h2>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span className={styles.statBig}>{loyaltyPoints}</span>
            <span className={styles.statDesc}>PATRON POINTS BALANCE</span>
          </div>
          <p style={{ fontSize: '0.8rem', opacity: 0.6, margin: '16px 0 0 0' }}>
            Earn 1 point per ₹100 spent. Redeem points directly at checkout for discounts.
          </p>
        </div>

        {/* Referral Card */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Referral Code</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Invite friends to PANTHER. They receive ₹500 off their first purchase, and you earn 100 loyalty points!
          </p>

          <div className={styles.codeBox}>
            <span className={styles.codeText}>{referralCode}</span>
            <button className={styles.copyBtn} onClick={handleCopyCode}>
              {copiedCode ? 'Copied' : 'Copy Code'}
            </button>
          </div>

          <div style={{ marginTop: '16px' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleCopyLink}
              style={{ width: '100%' }}
            >
              {copiedLink ? '✓ Link Copied' : 'Copy Invite Link'}
            </button>
          </div>
        </div>
      </div>

      {/* Referrals list */}
      <div className={styles.card} style={{ marginBottom: '24px' }}>
        <h2 className={styles.cardTitle}>Your Invites ({referrals.length})</h2>
        {referrals.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.ledgerTable}>
              <thead>
                <tr>
                  <th>Referred User</th>
                  <th>Status</th>
                  <th>Reward Points</th>
                  <th>Joined Date</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map(ref => (
                  <tr key={ref.id}>
                    <td>{ref.referred_email}</td>
                    <td>
                      <span style={{
                        textTransform: 'uppercase',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: ref.status === 'purchased' ? '#22c55e' : (ref.status === 'signed_up' ? '#3b82f6' : 'var(--text-muted)')
                      }}>
                        {ref.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      {ref.reward_points > 0 ? (
                        <span className={styles.pointsPlus}>+{ref.reward_points}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{new Date(ref.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '16px 0' }}>
            No invitations sent yet. Copy your link above to invite friends.
          </p>
        )}
      </div>

      {/* Points history ledger */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Points Ledger</h2>
        {ledger.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.ledgerTable}>
              <thead>
                <tr>
                  <th>Reason</th>
                  <th>Points</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map(entry => (
                  <tr key={entry.id}>
                    <td>{entry.reason}</td>
                    <td>
                      <span className={entry.points_changed > 0 ? styles.pointsPlus : styles.pointsMinus}>
                        {entry.points_changed > 0 ? `+${entry.points_changed}` : entry.points_changed}
                      </span>
                    </td>
                    <td>{new Date(entry.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '16px 0' }}>
            No point transactions found.
          </p>
        )}
      </div>
    </div>
  );
}
