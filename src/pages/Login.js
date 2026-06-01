import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Login({ setPage }) {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      setPage('home');
    } catch (err) {
      const code = err.code;
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
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
              Email
            </label>
            <input
              type='email'
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete='email'
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)',
                            display: 'block', marginBottom: '6px' }}>
              Password
            </label>
            <input
              type='password'
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete='current-password'
              style={inputStyle}
            />
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
