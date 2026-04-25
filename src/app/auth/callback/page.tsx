'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function AuthCallback() {
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const handleAuth = async () => {
      const { data } = await supabase.auth.getSession()

      if (data.session) {
        router.push('/') // Redirect home on success
      } else {
        router.push('/auth')
      }
    }

    handleAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
      <div className="animate-pulse">Authenticating your session...</div>
    </div>
  )
}
