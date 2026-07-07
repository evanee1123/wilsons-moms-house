import { useState, useEffect } from 'react'
import { useData } from './hooks/useData'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LeagueProvider, useLeague } from './contexts/LeagueContext'
import { SleeperAuthProvider, useSleeperAuth } from './contexts/SleeperAuthContext'
import Sidebar from './components/Sidebar'
import Home from './pages/Home'
import TeamDeepDive from './pages/TeamDeepDive'
import PlayerRankings from './pages/PlayerRankings'
import PickPortfolio from './pages/PickPortfolio'
import TradeCalculator from './pages/TradeCalculator'
import TradeHistory from './pages/TradeHistory'
import LeagueHistory from './pages/LeagueHistory'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ProtectedRoute from './components/ProtectedRoute'
import Blueprint from './pages/Blueprint'
import PowerRankings from './pages/PowerRankings'
import WilsonsOnly from './components/WilsonsOnly'
import LeagueSwitcher from './components/LeagueSwitcher'
import './App.css'

const WILSONS_ONLY_PAGES = {}

function AppInner() {
  const [page,          setPage]          = useState('home')
  const [owner,         setOwner]         = useState('')
  const [sidebarOpen,   setSidebarOpen]   = useState(false)
  const [switcherOpen,  setSwitcherOpen]  = useState(false)
  const { data, loading, error, refresh } = useData()
  const { userProfile } = useAuth()
  const { sleeperUser } = useSleeperAuth()
  const { leagueId } = useLeague()
  const isWilsonsLeague = leagueId === '1312130103358021632'

  // Reset selected owner when the active league changes
  useEffect(() => {
    setOwner('')
  }, [leagueId])

  // Auto-select logged-in user's team whenever data or auth state changes.
  // Using functional update (prev => prev || candidate) so a manual dropdown
  // selection is never overridden; it only fills in the '' reset left by the
  // leagueId effect above.  Falls back to sleeperUsername so external-league
  // display_names (which match the Sleeper username) are also recognised.
  // Also checks sleeperUser (Sleeper-only login, external leagues) — display_name
  // and username, same matching pattern as the Firebase profile fields.
  useEffect(() => {
    if (!data?.teamOverview) return;
    const ownersList = [...new Set(data.teamOverview.map(t => t.Owner))];
    const candidate = [
      userProfile?.rosterOwnerName, userProfile?.sleeperUsername,
      sleeperUser?.display_name, sleeperUser?.username,
    ].find(n => n && ownersList.includes(n));
    if (candidate) setOwner(prev => prev || candidate);
  }, [data, userProfile, sleeperUser]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', flexDirection: 'column', gap: '1rem',
      background: 'var(--page-bg)', color: 'var(--text-primary)',
    }}>
      <div style={{ fontSize: '24px', fontWeight: 500 }}>Wilson's Moms House</div>
      <div style={{ color: 'var(--text-secondary)' }}>Loading league data...</div>
    </div>
  )

  if (error) return (
    <>
      {switcherOpen && <LeagueSwitcher onClose={() => setSwitcherOpen(false)} />}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', flexDirection: 'column', gap: '1rem',
        background: 'var(--page-bg)', color: 'var(--text-primary)',
      }}>
        <div style={{ fontSize: '18px', fontWeight: 500, color: '#e24b4a' }}>
          Error loading data
        </div>
        {!isWilsonsLeague && (
          <div style={{
            color: 'var(--text-secondary)', fontSize: '14px',
            textAlign: 'center', maxWidth: '380px',
          }}>
            Could not load league data. The league ID may be invalid.
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button onClick={refresh} style={{
            padding: '7px 16px', borderRadius: '8px', border: '1px solid var(--card-border)',
            background: 'var(--card-bg)', color: 'var(--text-primary)',
            fontSize: '13px', cursor: 'pointer',
          }}>
            Try again
          </button>
          <button onClick={() => setSwitcherOpen(true)} style={{
            padding: '7px 16px', borderRadius: '8px', border: 'none',
            background: '#3182ce', color: '#fff',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}>
            Switch League
          </button>
        </div>
      </div>
    </>
  )

  if (page === 'login')  return <Login  setPage={setPage} />
  if (page === 'signup') return <Signup setPage={setPage} />

  const pages = {
    home:    Home,
    team:    TeamDeepDive,
    players: PlayerRankings,
    picks:   PickPortfolio,
    trade:   TradeCalculator,
    tradehistory:   TradeHistory,
    history:        LeagueHistory,
    powerrankings:  PowerRankings,
  }
  const PageComponent = pages[page] || Home

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className='mobile-overlay'
        />
      )}
      <Sidebar
        page={page}
        setPage={setPage}
        owner={owner}
        setOwner={setOwner}
        lastUpdated={data?.lastUpdated}
        refresh={refresh}
        owners={[...new Set(data?.teamOverview?.map(t => t.Owner) || [])]}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--page-bg)',
                     display: 'flex', flexDirection: 'column' }}>
        <div className='mobile-header'>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '1rem', color: 'var(--text-primary)', fontSize: '20px',
              lineHeight: 1
            }}
          >☰</button>
          <span style={{ fontWeight: 600, fontSize: '15px' }}>Wilson's Moms House</span>
          <div style={{ width: '52px' }} />
        </div>
        <div style={{ flex: 1 }}>
          {!isWilsonsLeague && WILSONS_ONLY_PAGES[page]
            ? <WilsonsOnly pageName={WILSONS_ONLY_PAGES[page]} setPage={setPage} />
            : page === 'blueprint'
              // Wilson's Blueprint still requires Firebase login (unchanged). External
              // leagues have no Firebase signup path, so Blueprint renders directly —
              // Goals/Watchlist gate on Sleeper login internally instead (see Blueprint.js).
              ? isWilsonsLeague
                ? <ProtectedRoute setPage={setPage}><Blueprint data={data} owner={owner} setPage={setPage} /></ProtectedRoute>
                : <Blueprint data={data} owner={owner} setPage={setPage} />
              : <PageComponent data={data} owner={owner} setPage={setPage} />
          }
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <LeagueProvider>
      <AuthProvider>
        <SleeperAuthProvider>
          <AppInner />
        </SleeperAuthProvider>
      </AuthProvider>
    </LeagueProvider>
  )
}