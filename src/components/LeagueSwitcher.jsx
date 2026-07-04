import { useState } from 'react';
import { useLeague } from '../contexts/LeagueContext';

const WMH_LEAGUE_ID   = '1312130103358021632';
const WMH_LEAGUE_NAME = "Wilson's Moms House";
const CURRENT_SEASON  = '2026';

export default function LeagueSwitcher({ onClose }) {
  const { setLeague } = useLeague();
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [leagues,   setLeagues]   = useState(null); // list from username lookup

  async function handleFind() {
    const val = input.trim();
    if (!val) { setError('Enter a Sleeper username or league ID.'); return; }
    setError('');
    setLeagues(null);
    setLoading(true);

    try {
      if (/^\d{15,}$/.test(val)) {
        // Looks like a league ID — fetch directly
        const res = await fetch(`https://api.sleeper.app/v1/league/${val}`);
        if (!res.ok) throw new Error(`League not found (HTTP ${res.status}).`);
        const league = await res.json();
        if (!league?.league_id) throw new Error('Invalid league ID.');
        const name = league.name || `League ${val}`;
        setLeague(val, name);
        onClose();
      } else {
        // Treat as username
        const userRes = await fetch(`https://api.sleeper.app/v1/user/${val}`);
        if (!userRes.ok) throw new Error(`Sleeper username "${val}" not found.`);
        const user = await userRes.json();
        if (!user?.user_id) throw new Error(`Sleeper username "${val}" not found.`);

        const leaguesRes = await fetch(
          `https://api.sleeper.app/v1/user/${user.user_id}/leagues/nfl/${CURRENT_SEASON}`
        );
        if (!leaguesRes.ok) throw new Error('Could not fetch leagues for this user.');
        const leagueList = await leaguesRes.json();
        if (!leagueList || leagueList.length === 0) {
          throw new Error(`No NFL leagues found for "${val}" in ${CURRENT_SEASON}.`);
        }
        setLeagues(leagueList);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleSelectLeague(league) {
    setLeague(league.league_id, league.name || `League ${league.league_id}`);
    onClose();
  }

  function handleReset() {
    setLeague(WMH_LEAGUE_ID, WMH_LEAGUE_NAME);
    onClose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleFind();
    if (e.key === 'Escape') onClose();
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
        borderRadius: '14px', width: '100%', maxWidth: '440px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--card-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Switch League
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Enter a Sleeper username or league ID
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

        {/* Body */}
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input
              value={input}
              onChange={e => { setInput(e.target.value); setError(''); setLeagues(null); }}
              onKeyDown={handleKeyDown}
              placeholder="e.g. ekleiner1123 or 1312130103358021632"
              autoFocus
              style={{
                flex: 1, padding: '9px 12px',
                background: 'var(--page-bg)',
                border: '1px solid var(--card-border)',
                borderRadius: '8px', color: 'var(--text-primary)',
                fontSize: '13px', outline: 'none',
              }}
            />
            <button
              onClick={handleFind}
              disabled={loading}
              style={{
                padding: '9px 16px', background: '#3182ce', border: 'none',
                color: '#fff', borderRadius: '8px', fontSize: '13px',
                fontWeight: 600, cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.7 : 1, whiteSpace: 'nowrap',
              }}
            >
              {loading ? 'Loading…' : 'Find Leagues'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: '8px 12px', background: 'var(--red-bg)', color: 'var(--red)',
              borderRadius: '8px', fontSize: '12px', marginBottom: '12px',
            }}>
              {error}
            </div>
          )}

          {/* Loading spinner */}
          {loading && (
            <div style={{
              textAlign: 'center', padding: '16px 0',
              color: 'var(--text-secondary)', fontSize: '13px',
            }}>
              <div style={{ marginBottom: '6px' }}>
                <Spinner />
              </div>
              Fetching leagues…
            </div>
          )}

          {/* League list from username lookup */}
          {leagues && !loading && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{
                fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px',
              }}>
                {leagues.length} league{leagues.length !== 1 ? 's' : ''} found — select one
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                {leagues.map(league => (
                  <button
                    key={league.league_id}
                    onClick={() => handleSelectLeague(league)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 12px',
                      background: 'var(--page-bg)', border: '1px solid var(--card-border)',
                      borderRadius: '8px', cursor: 'pointer',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#3182ce'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--card-border)'}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {league.name || 'Unnamed League'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {league.total_rosters} teams · Season {league.season} · ID {league.league_id}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reset to demo */}
          <button
            onClick={handleReset}
            style={{
              width: '100%', padding: '9px',
              background: 'rgba(0,0,0,0)', border: '1px solid var(--card-border)',
              color: 'var(--text-secondary)', borderRadius: '8px',
              fontSize: '12px', cursor: 'pointer',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#3182ce'; e.currentTarget.style.color = '#3182ce'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            Use Wilson's Moms House (Demo)
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: '16px', height: '16px',
      border: '2px solid var(--card-border)',
      borderTopColor: '#3182ce',
      borderRadius: '50%',
      animation: 'ls-spin 0.7s linear infinite',
    }} />
  );
}
