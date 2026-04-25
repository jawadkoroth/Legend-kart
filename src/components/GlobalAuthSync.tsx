'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function GlobalAuthSync() {
  useEffect(() => {
    let mounted = true;
    const supabase = createClient();
    
    // Attempt syncing active session on direct mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && mounted) syncProfile(session.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user && mounted) {
        syncProfile(session.user);
      }
    });

    async function syncProfile(user: any) {
      if (!user) return;
      
      const { error } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();
        
      // PGRST116 means 0 rows found implicitly on .single() constraints
      if (error && error.code === 'PGRST116') {
        const nameFallback = user.user_metadata?.full_name || user.user_metadata?.name || '';
        const emailFallback = user.user_metadata?.email || user.email || '';
        const phoneFallback = user.user_metadata?.phone || null;
        
        await supabase.from('profiles').insert({
          id: user.id,
          email: emailFallback,
          name: nameFallback,
          phone: phoneFallback,
        });
      }
    }

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
