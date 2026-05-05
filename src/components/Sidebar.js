export default function Sidebar({ page, setPage, owner, setOwner,
                                   lastUpdated, refresh, owners,
                                   sidebarOpen, setSidebarOpen }) {
  const navItems = [
    { id: 'home',    label: 'Home',             icon: '⊞' },
    { id: 'team',    label: 'Team Deep Dive',   icon: '◉' },
    { id: 'players', label: 'Player Rankings',  icon: '☰' },
    { id: 'picks',   label: 'Pick Portfolio',   icon: '◈' },
    { id: 'trade',   label: 'Trade Calculator', icon: '⇄' },
  ]

  return (
    <aside
      className={sidebarOpen ? 'open' : ''}
      style={{
        width: '220px', minHeight: '100vh', background: '#1a1f2e',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        borderRight: '1px solid rgba(255,255,255,0.06)',
        position: 'relative'
      }}
    >
      <div style={{ padding: '1.25rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
            Wilson's Moms House
          </div>
          <div style={{ fontSize: '11px', color: '#718096', marginTop: '2px' }}>
            Dynasty League
          </div>
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

      <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: '11px', color: '#718096', marginBottom: '4px' }}>
          Viewing as
        </div>
        <select
          value={owner}
          onChange={e => setOwner(e.target.value)}
          style={{
            width: '100%', background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff', borderRadius: '6px', padding: '6px 8px',
            fontSize: '12px', cursor: 'pointer'
          }}
        >
          <option value=''>Select team...</option>
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>

        {lastUpdated && (
          <div style={{ fontSize: '10px', color: '#4a5568', marginTop: '8px' }}>
            Updated {lastUpdated}
          </div>
        )}

        <button
          onClick={refresh}
          style={{
            width: '100%', marginTop: '8px', padding: '6px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#a0aec0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
          }}
        >
          Refresh data
        </button>
      </div>
    </aside>
  )
}