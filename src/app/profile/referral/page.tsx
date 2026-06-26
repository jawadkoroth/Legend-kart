import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import ReferralClient from './ReferralClient';
import styles from './referral.module.css';

export const dynamic = 'force-dynamic';

export default async function ReferralPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth?next=/profile/referral');
  }

  // 1. Fetch profile with referral code and loyalty points
  let { data: profile } = await supabase
    .from('profiles')
    .select('name, email, referral_code, loyalty_points')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    redirect('/profile/complete?next=/profile/referral');
  }

  // 2. Generate referral code if missing
  let referralCode = profile.referral_code;
  if (!referralCode) {
    const random = Math.floor(1000 + Math.random() * 9000);
    const code = `PANTHER-${user.id.slice(0, 4).toUpperCase()}-${random}`;
    
    // Save to DB
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ referral_code: code })
      .eq('id', user.id);

    if (!updateErr) {
      referralCode = code;
    }
  }

  // 3. Fetch loyalty ledger history
  const { data: ledger } = await supabase
    .from('loyalty_ledger')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // 4. Fetch referrals made
  const { data: referrals } = await supabase
    .from('referrals')
    .select('*')
    .eq('referrer_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <div className={styles.container}>
      <Link href="/profile" className={styles.backBtn}>
        ← Back to Profile
      </Link>
      
      <div className={styles.titleSection}>
        <h1 className={styles.title}>Patron Program</h1>
        <p className={styles.subtitle}>Loyalty Ledger & Referral Rewards</p>
      </div>

      <ReferralClient
        referralCode={referralCode || 'PANTHER-MEMBER'}
        loyaltyPoints={profile.loyalty_points || 0}
        ledger={ledger || []}
        referrals={referrals || []}
      />
    </div>
  );
}
