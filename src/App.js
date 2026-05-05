import { useState } from 'react'
import { useData } from './hooks/useData'
import Sidebar from './components/Sidebar'
import Home from './pages/Home'
import TeamDeepDive from './pages/TeamDeepDive'
import PlayerRankings from './pages/PlayerRankings'
import PickPortfolio from './pages/PickPortfolio'
import TradeCalculator from './pages/TradeCalculator'
import './App.css'

export default function App() {
  const [page,  setPage]  = useState('home')
  const [owner, setOwner] = useState('')
  const { data, loading, error, refresh } = useData()

  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', flexDirection: 'column', gap: '1rem'
    }}>
      <div style={{ fontSize: '24px', fontWeight: 500 }}>Wilson's Moms House</div>
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

  const pages = { home: Home, team: TeamDeepDive, players: PlayerRankings,
                  picks: PickPortfolio, trade: TradeCalculator }
  const PageComponent = pages[page] || Home

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        page={page}
        setPage={setPage}
        owner={owner}
        setOwner={setOwner}
        lastUpdated={data?.lastUpdated}
        refresh={refresh}
        owners={[...new Set(data?.teamOverview?.map(t => t.Owner) || [])]}
      />
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--page-bg)' }}>
        <PageComponent data={data} owner={owner} setPage={setPage} />
      </main>
    </div>
  )
}
