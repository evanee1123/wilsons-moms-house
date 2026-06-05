import { useState, useEffect } from 'react'
import { useData } from './hooks/useData'
import { AuthProvider, useAuth } from './contexts/AuthContext'
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
import './App.css'

function AppInner() {
  const [page,        setPage]        = useState('home')
  const [owner,       setOwner]       = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { data, loading, error, refresh } = useData()
  const { userProfile } = useAuth()

  // Auto-select logged-in user's team in the public team selector
  useEffect(() => {
    if (userProfile?.rosterOwnerName) {
      setOwner(userProfile.rosterOwnerName)
    }
  }, [userProfile])

  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', flexDirection: 'column', gap: '1rem'
    }}>
      <div style={{ fontSize: '24px', fontWeight: 500 }}>CLTC 8 2017</div>
      <div style={{ color: '#888' }}>Loading league data...</div>
    </div>
  )

  if (error) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', flexDirection: 'column', gap: '1rem'
    }}>
      <div style={{ fontSize: '18px', fontWeight: 500, color: '#e24b4a' }}>
        Error loading data
      </div>
      <div style={{ color: '#888', fontSize: '14px' }}>{error}</div>
      <button onClick={refresh}>Try again</button>
    </div>
  )

  if (page === 'login')  return <Login  setPage={setPage} />
  if (page === 'signup') return <Signup setPage={setPage} />

  const pages = {
    home:    Home,
    team:    TeamDeepDive,
    players: PlayerRankings,
    picks:   PickPortfolio,
    trade:   TradeCalculator,
    tradehistory: TradeHistory,
    history:      LeagueHistory,
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
          <span style={{ fontWeight: 600, fontSize: '15px' }}>CLTC 8 2017</span>
          <div style={{ width: '52px' }} />
        </div>
        <div style={{ flex: 1 }}>
          {page === 'blueprint'
            ? <ProtectedRoute setPage={setPage}><Blueprint data={data} setPage={setPage} /></ProtectedRoute>
            : <PageComponent data={data} owner={owner} setPage={setPage} />
          }
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}