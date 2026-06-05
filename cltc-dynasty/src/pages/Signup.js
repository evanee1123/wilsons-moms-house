import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Signup({ setPage }) {
  const { signup } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [username, setUsername] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signup(email, password, username.trim());
      setPage('home');
    } catch (err) {
      const code = err.code;
      if (err.message && !code) {
        // Our own validation errors from AuthContext
        setError(err.message);
      } else if (code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Try signing in.');
      } else if (code === 'auth/weak-password') {
        setError('Password must be at least 6 characters.');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError('Sign up failed. Please try again.');
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
            CLTC 8 2017
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px' }}>
            Create account
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px' }}>
            Only members of the CLTC 8 2017 league can sign up.
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Sleeper Username</label>
            <input
              type='text'
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              placeholder='e.g. ekleiner1123'
              autoComplete='off'
              style={inputStyle}
            />
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Must match your exact Sleeper username.
            </div>
          </div>

          <div>
            <label style={labelStyle}>Email</label>
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
            <label style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete='new-password'
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
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              At least 6 characters.
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
            {loading ? 'Verifying…' : 'Create account'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '13px',
                      color: 'var(--text-secondary)' }}>
          Already have an account?{' '}
          <button
            onClick={() => setPage('login')}
            style={{ background: 'none', border: 'none', color: 'var(--blue)',
                     fontSize: '13px', cursor: 'pointer', padding: 0, fontWeight: 500 }}
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)',
  display: 'block', marginBottom: '6px',
};

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
