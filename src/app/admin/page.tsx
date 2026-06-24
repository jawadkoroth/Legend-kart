'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/AuthProvider';
import styles from './page.module.css';

export default function AdminLogin() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.userAgent.includes('PANTHER_MOBILE')) {
      setIsMobile(true);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/admin/dashboard');
    }
  }, [user, authLoading, router]);

  if (isMobile && authLoading) {
    return (
      <div style={{
        display: 'flex',
        height: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0B0B0B',
        color: '#8A8A8A',
        fontFamily: 'monospace',
        fontSize: '0.8rem',
        letterSpacing: '0.1em'
      }}>
        RESTORING SESSION...
      </div>
    );
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (!data.user) {
        setError('Login failed');
        setLoading(false);
        return;
      }

      // Verify admin role
      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('id')
        .eq('id', data.user.id)
        .single();

      if (!adminUser) {
        await supabase.auth.signOut();
        setError('Not authorized as admin');
        setLoading(false);
        return;
      }

      // Cookies are now set by the SSR browser client. Force a server
      // re-evaluation so the protected admin layout (RSC) sees the new
      // session before navigation lands.
      router.refresh();
      router.replace('/admin/dashboard');
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>NOIR</div>
        <h1 className={styles.heading}>Admin Login</h1>
        <form onSubmit={handleLogin} className={styles.form}>
          <div className="input-group">
            <input
              className="input-field"
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <input
              className="input-field"
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="input-error-text">{error}</p>}
          <button
            className={`btn btn-primary ${loading ? 'btn-loading' : ''}`}
            type="submit"
            disabled={loading}
          >
            LOGIN
          </button>
        </form>
      </div>
    </div>
  );
}
