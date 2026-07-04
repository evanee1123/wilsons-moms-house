import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLeague } from '../contexts/LeagueContext';
import LeagueSwitcher from './LeagueSwitcher';

const ALL_OWNERS = [
  'ekleiner1123', 'Herschey6153', 'jsinykin', 'SvenMoney34', 'Akracoon',
  'GiantHawkTua', 'nchernandez19', 'sethfriedman12', 'GreyWaedekin27', 'gavinw20',
];

export default function Sidebar({ page, setPage, owner, setOwner,
                                   lastUpdated, refresh, owners,
                                   sidebarOpen, setSidebarOpen }) {
  const { currentUser, userProfile, viewAsOwner, setViewAsOwner, logout } = useAuth();
  const { leagueName } = useLeague();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const isAdmin = userProfile?.sleeperUsername === 'ekleiner1123';

  const navItems = [
    { id: 'home',    label: 'Home',             icon: '⊞' },
    { id: 'team',    label: 'Team Deep Dive',   icon: '◉' },
    { id: 'players', label: 'Player Rankings',  icon: '☰' },
    { id: 'picks',   label: 'Pick Portfolio',   icon: '◈' },
    { id: 'trade',   label: 'Trade Calculator', icon: '⇄' },
    { id: 'tradehistory',   label: 'Trade History',    icon: '📋' },
    { id: 'history',       label: 'League History',   icon: '🏆' },
    { id: 'powerrankings', label: 'Power Rankings',   icon: '⚡' },
    { id: 'blueprint',     label: 'My Blueprint',     icon: '◎' },
  ];

  async function handleLogout() {
    await logout();
    setPage('home');
  }

  function handleViewAs(e) {
    const name = e.target.value;
    setViewAsOwner(name || null);
    if (name) setOwner(name);
  }

  return (
    <>
      {switcherOpen && <LeagueSwitcher onClose={() => setSwitcherOpen(false)} />}
      <aside
        className={sidebarOpen ? 'open' : ''}
        style={{
          width: '220px', minHeight: '100vh', background: '#1a1f2e',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          position: 'relative'
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.25rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
              Wilson's Moms House
            </div>
            {/* League indicator pill */}
            <button
              onClick={() => setSwitcherOpen(true)}
              title="Switch league"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                marginTop: '5px', padding: '2px 8px',
                background: 'rgba(49,130,206,0.18)',
                border: '1px solid rgba(49,130,206,0.35)',
                borderRadius: '99px', cursor: 'pointer',
                color: '#63b3ed', fontSize: '10px', fontWeight: 600,
                maxWidth: '100%', overflow: 'hidden',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(49,130,206,0.3)'; e.currentTarget.style.borderColor = 'rgba(49,130,206,0.6)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(49,130,206,0.18)'; e.currentTarget.style.borderColor = 'rgba(49,130,206,0.35)'; }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {leagueName}
              </span>
              <span style={{ opacity: 0.7, flexShrink: 0 }}>⇄</span>
            </button>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              display: 'none', background: 'none', border: 'none',
              color: '#718096', fontSize: '20px', cursor: 'pointer',
              padding: '2px 6px', lineHeight: 1
            }}
            className='mobile-close-btn'
          >×</button>
        </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0.5rem 0' }}>
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => { setPage(item.id); setSidebarOpen(false) }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 1rem', background: page === item.id
                ? 'rgba(255,255,255,0.08)' : 'transparent',
              border: 'none', borderLeft: page === item.id
                ? '2px solid #3182ce' : '2px solid transparent',
              color: page === item.id ? '#fff' : '#718096',
              fontSize: '13px', cursor: 'pointer', textAlign: 'left',
              transition: 'all 0.15s'
            }}
          >
            <span style={{ fontSize: '14px' }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Bottom section */}
      <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>

        {/* Auth state */}
        {currentUser ? (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', color: '#718096', marginBottom: '4px' }}>
              Signed in as
            </div>
            <div style={{ fontSize: '12px', color: '#fff', fontWeight: 600,
                          marginBottom: '8px', wordBreak: 'break-all' }}>
              {userProfile?.sleeperUsername || currentUser.email}
            </div>

            {/* Admin "View As" */}
            {isAdmin && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', color: '#718096', marginBottom: '4px' }}>
                  Admin — View as
                </div>
                <select
                  value={viewAsOwner || ''}
                  onChange={handleViewAs}
                  style={selectStyle}
                >
                  <option value=''>Myself (ekleiner1123)</option>
                  {ALL_OWNERS.filter(o => o !== 'ekleiner1123').map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                {viewAsOwner && (
                  <div style={{
                    marginTop: '6px', fontSize: '11px', color: '#f6e05e',
                    background: 'rgba(246,224,94,0.1)', borderRadius: '6px',
                    padding: '4px 8px',
                  }}>
                    Viewing as {viewAsOwner}
                  </div>
                )}
              </div>
            )}

            <button onClick={handleLogout} style={ghostBtnStyle}>
              Log out
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            <button
              onClick={() => { setPage('login'); setSidebarOpen(false) }}
              style={{ ...ghostBtnStyle, flex: 1 }}
            >
              Log in
            </button>
            <button
              onClick={() => { setPage('signup'); setSidebarOpen(false) }}
              style={{ ...primaryBtnStyle, flex: 1 }}
            >
              Sign up
            </button>
          </div>
        )}

        {/* Public team selector */}
        <div style={{ fontSize: '11px', color: '#718096', marginBottom: '4px' }}>
          Viewing as
        </div>
        <select
          value={owner}
          onChange={e => setOwner(e.target.value)}
          style={selectStyle}
        >
          <option value=''>Select team...</option>
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>

        {lastUpdated && (
          <div style={{ fontSize: '10px', color: '#4a5568', marginTop: '8px' }}>
            Updated {lastUpdated}
          </div>
        )}

        <button onClick={refresh} style={{ ...ghostBtnStyle, marginTop: '8px' }}>
          Refresh data
        </button>
      </div>
    </aside>
    </>
  )
}

const selectStyle = {
  width: '100%', background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff', borderRadius: '6px', padding: '6px 8px',
  fontSize: '12px', cursor: 'pointer',
};

const ghostBtnStyle = {
  width: '100%', padding: '6px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#a0aec0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
};

const primaryBtnStyle = {
  padding: '6px',
  background: '#3182ce', border: 'none',
  color: '#fff', borderRadius: '6px', fontSize: '12px',
  cursor: 'pointer', fontWeight: 600,
};
