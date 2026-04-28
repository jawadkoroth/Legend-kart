import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import ProfileClient from './ProfileClient';

/**
 * Server-rendered profile shell.
 *
 * Auth gating is also enforced upstream by middleware, but doing it
 * here as well guarantees the data fetch and the auth assertion stay
 * in the same place — no client-side flicker, no race against
 * `getUser()` in the browser.
 */
export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth?next=/profile');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, email, phone')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.phone) {
    redirect('/profile/complete?next=/profile');
  }

  return (
    <ProfileClient
      userId={user.id}
      initialProfile={{
        name: profile.name ?? '',
        email: profile.email ?? user.email ?? '',
        phone: profile.phone,
      }}
    />
  );
}
