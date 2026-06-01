import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Login({ setPage }) {
  const { login } = useAuth();
  const [email,       setEmail]       = useState(''); // email or username
  const [password,    setPassword]    = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      setPage('home');
    } catch (err) {
      const code = err.code;
      if (err.message && !code) {
        setError(err.message); // username-not-found or other pre-auth errors
      } else if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Incorrect email or password.');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Try again later.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--page-bg)', padding: '2rem',
    }}>
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--card-border)',
        borderRadius: '16px', padding: '2.5rem', width: '100%', maxWidth: '400px',
      }}>
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
            Wilson's Moms House
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px' }}>
            Sign in
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)',
                            display: 'block', marginBottom: '6px' }}>
              Email or Sleeper username
            </label>
            <input
              type='text'
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete='username'
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)',
                            display: 'block', marginBottom: '6px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete='current-password'
                style={{ ...inputStyle, paddingRight: '40px' }}
              />
              <button
                type='button'
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: 'absolute', right: '10px', top: '50%',
                  transform: 'translateY(-50%)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: '2px',
                  color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1,
                }}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ fontSize: '13px', color: 'var(--red)',
                          background: 'var(--red-bg)', borderRadius: '8px',
                          padding: '10px 12px' }}>
              {error}
            </div>
          )}

          <button
            type='submit'
            disabled={loading}
            style={primaryBtnStyle}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '13px',
                      color: 'var(--text-secondary)' }}>
          No account?{' '}
          <button
            onClick={() => setPage('signup')}
            style={{ background: 'none', border: 'none', color: 'var(--blue)',
                     fontSize: '13px', cursor: 'pointer', padding: 0, fontWeight: 500 }}
          >
            Sign up
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '9px 12px',
  background: 'var(--page-bg)', border: '1px solid var(--card-border)',
  borderRadius: '8px', fontSize: '14px', color: 'var(--text-primary)',
  outline: 'none',
};

const primaryBtnStyle = {
  width: '100%', padding: '10px',
  background: '#3182ce', border: 'none',
  borderRadius: '8px', color: '#fff',
  fontSize: '14px', fontWeight: 600, cursor: 'pointer',
  marginTop: '4px',
};
