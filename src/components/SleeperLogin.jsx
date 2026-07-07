import { useState } from 'react';
import { useSleeperAuth } from '../contexts/SleeperAuthContext';

export default function SleeperLogin({ onClose }) {
  const { sleeperLogin } = useSleeperAuth();
  const [username, setUsername] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const val = username.trim();
    if (!val) { setError('Enter your Sleeper username.'); return; }
    setError('');
    setLoading(true);
    try {
      await sleeperLogin(val);
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--card-border)',
        borderRadius: '14px', width: '100%', maxWidth: '400px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--card-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Log in with Sleeper
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Save your watchlist and goals for this league
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text-secondary)',
              fontSize: '20px', cursor: 'pointer', lineHeight: 1, padding: '2px 6px',
            }}
          >×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          <label style={{
            fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)',
            display: 'block', marginBottom: '6px',
          }}>
            Sleeper username
          </label>
          <input
            value={username}
            onChange={e => { setUsername(e.target.value); setError(''); }}
            placeholder='e.g. ekleiner1123'
            autoFocus
            disabled={loading}
            style={{
              width: '100%', padding: '9px 12px',
              background: 'var(--page-bg)', border: '1px solid var(--card-border)',
              borderRadius: '8px', color: 'var(--text-primary)',
              fontSize: '13px', outline: 'none', marginBottom: '12px',
            }}
          />

          {error && (
            <div style={{
              padding: '8px 12px', background: 'var(--red-bg)', color: 'var(--red)',
              borderRadius: '8px', fontSize: '12px', marginBottom: '12px',
            }}>
              {error}
            </div>
          )}

          <button
            type='submit'
            disabled={loading}
            style={{
              width: '100%', padding: '10px',
              background: '#3182ce', border: 'none',
              borderRadius: '8px', color: '#fff',
              fontSize: '14px', fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Verifying…' : 'Log in with Sleeper'}
          </button>
        </form>
      </div>
    </div>
  );
}
