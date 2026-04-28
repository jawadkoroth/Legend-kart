import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import ProfileCompleteClient from './ProfileCompleteClient';

/**
 * Server-rendered onboarding shell for finishing the profile (phone).
 *
 * Reads `?next=` to know where to send the user after completion.
 * Auth is enforced here (and by middleware) — the client form never
 * has to second-guess session state.
 */
export default async function ProfileCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const rawNext = params.next ?? '/profile';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/profile';

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth?next=${encodeURIComponent('/profile/complete')}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('phone, name')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.phone) {
    redirect(next);
  }

  return (
    <ProfileCompleteClient
      userId={user.id}
      userEmail={user.email ?? ''}
      initialName={profile?.name ?? ''}
      next={next}
    />
  );
}
