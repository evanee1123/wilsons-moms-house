import { useState, useMemo } from 'react'
import PlayerDetailModal from '../components/PlayerDetailModal'

const VERDICT_COLORS = {
  win:  { bg: '#c6f6d5', color: '#276749', label: 'WIN' },
  loss: { bg: '#fed7d7', color: '#9b2c2c', label: 'LOSS' },
  fair: { bg: '#fefcbf', color: '#744210', label: 'FAIR' },
}

function getVerdict(surplus) {
  if (surplus > 500)  return 'win'
  if (surplus < -500) return 'loss'
  return 'fair'
}

export default function TradeHistory({ data, owner }) {
  const [ownerFilter,  setOwnerFilter]  = useState('ALL')
  const [seasonFilter, setSeasonFilter] = useState('ALL')
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [expandedTrade, setExpandedTrade] = useState(null)

  const trades = useMemo(() => data?.tradeHistory || [], [data])

  const owners = useMemo(() => (
    ['ALL', ...new Set([
      ...trades.map(t => t['Team A']),
      ...trades.map(t => t['Team B']),
    ].filter(Boolean))]
  ), [trades])

  const seasons = useMemo(() => (
    ['ALL', ...new Set(trades.map(t => t.Season).filter(Boolean))].sort().reverse()
  ), [trades])

  const filtered = useMemo(() => {
    return trades.filter(t => {
      const matchOwner  = ownerFilter === 'ALL' || t['Team A'] === ownerFilter || t['Team B'] === ownerFilter
      const matchSeason = seasonFilter === 'ALL' || t.Season === seasonFilter
      return matchOwner && matchSeason
    })
  }, [trades, ownerFilter, seasonFilter])

  // For a given trade row, get the perspective of the selected owner
  function getTradePerspective(trade) {
    const viewOwner = ownerFilter !== 'ALL' ? ownerFilter : owner
    if (!viewOwner) return null

    const isA = trade['Team A'] === viewOwner
    const isB = trade['Team B'] === viewOwner
    if (!isA && !isB) return null

    const mySurplus  = isA ? parseInt(trade['Surplus A'] || 0) : parseInt(trade['Surplus B'] || 0)
    const myReceived = isA ? trade['Team A Received'] : trade['Team B Received']
    const theyRecv   = isA ? trade['Team B Received'] : trade['Team A Received']
    const opponent   = isA ? trade['Team B'] : trade['Team A']
    const myAdj      = isA ? parseInt(trade['Team A Adjusted'] || 0) : parseInt(trade['Team B Adjusted'] || 0)
    const theirAdj   = isA ? parseInt(trade['Team B Adjusted'] || 0) : parseInt(trade['Team A Adjusted'] || 0)

    return { mySurplus, myReceived, theyRecv, opponent, myAdj, theirAdj }
  }

  function parseAssets(assetStr) {
    if (!assetStr) return []
    return assetStr.split(' | ').map(a => {
      const match = a.match(/^(.+)\s\(([0-9,]+)\)$/)
      if (!match) return { name: a, ktc: 0 }
      return { name: match[1].trim(), ktc: parseInt(match[2].replace(/,/g, '')) }
    })
  }

  function handleAssetClick(name) {
    const full = data?.playerUniverse?.find(u => u.Player === name)
    if (full) setSelectedPlayer(full)
  }

  const viewOwner = ownerFilter !== 'ALL' ? ownerFilter : owner

  // Summary stats for selected owner
  const ownerStats = useMemo(() => {
    if (!viewOwner) return null
    const myTrades = filtered.filter(t => t['Team A'] === viewOwner || t['Team B'] === viewOwner)
    let wins = 0, losses = 0, fair = 0, totalSurplus = 0
    myTrades.forEach(t => {
      const surplus = t['Team A'] === viewOwner ? parseInt(t['Surplus A'] || 0) : parseInt(t['Surplus B'] || 0)
      totalSurplus += surplus
      const v = getVerdict(surplus)
      if (v === 'win') wins++
      else if (v === 'loss') losses++
      else fair++
    })
    return { wins, losses, fair, totalSurplus, total: myTrades.length }
  }, [filtered, viewOwner])

  return (
    <div className='page'>
      <div className='page-title'>Trade History</div>
      <div className='page-subtitle'>
        Retroactive grades using current KTC values · {filtered.length} trades shown
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        <select
          value={ownerFilter}
          onChange={e => setOwnerFilter(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '13px', border: '1px solid var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: 'pointer' }}
        >
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>

        <div style={{ display: 'flex', gap: '4px' }}>
          {seasons.map(s => (
            <button key={s} onClick={() => setSeasonFilter(s)} style={{
              padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
              border: '1px solid var(--card-border)', cursor: 'pointer',
              background: seasonFilter === s ? 'var(--blue)' : 'var(--card-bg)',
              color: seasonFilter === s ? '#fff' : 'var(--text-secondary)',
            }}>{s}</button>
          ))}
        </div>

        {(ownerFilter !== 'ALL' || seasonFilter !== 'ALL') && (
          <button onClick={() => { setOwnerFilter('ALL'); setSeasonFilter('ALL') }} style={{
            padding: '6px 12px', borderRadius: '6px', fontSize: '12px',
            border: '1px solid var(--card-border)', cursor: 'pointer',
            background: 'var(--card-bg)', color: 'var(--text-secondary)',
          }}>Clear filters</button>
        )}
      </div>

      {/* Owner summary stats */}
      {ownerStats && viewOwner && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginBottom: '1.25rem' }}>
          {[
            { label: 'Trades', value: ownerStats.total },
            { label: 'Wins', value: ownerStats.wins, color: '#276749', bg: '#c6f6d5' },
            { label: 'Losses', value: ownerStats.losses, color: '#9b2c2c', bg: '#fed7d7' },
            { label: 'Fair', value: ownerStats.fair, color: '#744210', bg: '#fefcbf' },
            { label: 'Total Surplus', value: (ownerStats.totalSurplus > 0 ? '+' : '') + ownerStats.totalSurplus.toLocaleString(), color: ownerStats.totalSurplus > 0 ? '#276749' : '#9b2c2c' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} style={{ padding: '10px 12px', borderRadius: '8px', background: bg || 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{label}</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Trade list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtered.map((trade, i) => {
          const persp    = getTradePerspective(trade)
          const isExpanded = expandedTrade === i

          // If no owner perspective just show both sides
          const aAssets  = parseAssets(trade['Team A Received'])
          const bAssets  = parseAssets(trade['Team B Received'])
          const surplusA = parseInt(trade['Surplus A'] || 0)
          const verdictA = getVerdict(surplusA)
          const verdictB = getVerdict(-surplusA)
          const vc = persp ? VERDICT_COLORS[getVerdict(persp.mySurplus)] : null

          return (
            <div key={i} className='card' style={{ padding: 0, overflow: 'hidden' }}>
              {/* Trade header */}
              <div
                onClick={() => setExpandedTrade(isExpanded ? null : i)}
                style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{trade.Date}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Season {trade.Season}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {trade['Team A']} ⇄ {trade['Team B']}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {persp && vc && (
                    <span style={{ background: vc.bg, color: vc.color, fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px' }}>
                      {vc.label} {persp.mySurplus > 0 ? '+' : ''}{persp.mySurplus.toLocaleString()}
                    </span>
                  )}
                  <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--card-border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                    {/* Team A */}
                    <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--page-bg)', border: `1px solid ${verdictA === 'win' ? '#9ae6b4' : verdictA === 'loss' ? '#feb2b2' : 'var(--card-border)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{trade['Team A']}</span>
                        <span style={{ fontSize: '11px', fontWeight: 600, background: VERDICT_COLORS[verdictA].bg, color: VERDICT_COLORS[verdictA].color, padding: '1px 6px', borderRadius: '99px' }}>
                          {VERDICT_COLORS[verdictA].label} {surplusA > 0 ? '+' : ''}{surplusA.toLocaleString()}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Received:</div>
                      {aAssets.map((a, j) => (
                        <div key={j}
                          onClick={() => handleAssetClick(a.name)}
                          style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: j < aAssets.length - 1 ? '1px solid var(--card-border)' : 'none', cursor: 'pointer' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>{a.name}</span>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{a.ktc.toLocaleString()}</span>
                        </div>
                      ))}
                      <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        Face: {parseInt(trade['Team A Face'] || 0).toLocaleString()} · Adjusted: {parseInt(trade['Team A Adjusted'] || 0).toLocaleString()}
                      </div>
                    </div>

                    {/* Team B */}
                    <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--page-bg)', border: `1px solid ${verdictB === 'win' ? '#9ae6b4' : verdictB === 'loss' ? '#feb2b2' : 'var(--card-border)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{trade['Team B']}</span>
                        <span style={{ fontSize: '11px', fontWeight: 600, background: VERDICT_COLORS[verdictB].bg, color: VERDICT_COLORS[verdictB].color, padding: '1px 6px', borderRadius: '99px' }}>
                          {VERDICT_COLORS[verdictB].label} {-surplusA > 0 ? '+' : ''}{(-surplusA).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Received:</div>
                      {bAssets.map((a, j) => (
                        <div key={j}
                          onClick={() => handleAssetClick(a.name)}
                          style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: j < bAssets.length - 1 ? '1px solid var(--card-border)' : 'none', cursor: 'pointer' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>{a.name}</span>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{a.ktc.toLocaleString()}</span>
                        </div>
                      ))}
                      <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        Face: {parseInt(trade['Team B Face'] || 0).toLocaleString()} · Adjusted: {parseInt(trade['Team B Adjusted'] || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          data={data}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  )
}