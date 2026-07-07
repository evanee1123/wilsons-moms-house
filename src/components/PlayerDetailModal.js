import { useMemo } from 'react'

const TIER_COLORS = {
  'Cornerstone':           { bg: '#f6e05e', color: '#744210' },
  'Upside Premier':        { bg: '#b794f4', color: '#322659' },
  'Foundational':          { bg: '#90cdf4', color: '#1a3f5c' },
  'Mainstay':              { bg: '#9ae6b4', color: '#1a5436' },
  'Productive Vet':        { bg: '#76e4f7', color: '#065666' },
  'Short-term Winner':     { bg: '#f6ad55', color: '#652b19' },
  'Upside Shot':           { bg: '#c6f6d5', color: '#276749' },
  'Short-term Production': { bg: '#faf089', color: '#744210' },
  'Serviceable':           { bg: '#cbd5e0', color: '#2d3748' },
  'Jag Developmental':     { bg: '#fc8181', color: '#63171b' },
  'Jag Insurance':         { bg: '#feb2b2', color: '#63171b' },
  'Replaceable':           { bg: '#e2e8f0', color: '#4a5568' },
}

function MiniBar({ value, max, color = '#4299e1', negative = false }) {
  const pct      = Math.min(100, Math.max(0, (Math.abs(value) / max) * 100))
  const barColor = negative ? (value >= 0 ? '#48bb78' : '#fc8181') : color
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ flex: 1, height: '5px', background: 'var(--card-border)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '3px' }} />
      </div>
    </div>
  )
}

function StatGrid({ stats }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
      {stats.filter(s => s.value !== '—' && s.value !== null).map(({ label, value, sub }) => (
        <div key={label} style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--page-bg)', border: '1px solid var(--card-border)' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{label}</div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
          {sub && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
        </div>
      ))}
    </div>
  )
}

export default function PlayerDetailModal({ player, onClose }) {
  const pos       = player?.Position
  const tierColor = TIER_COLORS[player?.Tier] || { bg: '#e2e8f0', color: '#4a5568' }

  const fmt    = (v, d = 1) => (isNaN(parseFloat(v)) || parseFloat(v) === 0) ? '—' : parseFloat(v).toFixed(d)

  const ktc      = parseFloat(player?.['KTC Value'])
  const ppg      = parseFloat(player?.['Avg PPG'])
  const seasons  = parseFloat(player?.['Seasons'])
  const games    = parseFloat(player?.['Games Played'])
  const snapPct  = parseFloat(player?.['Snap Pct'])

  const seasonData = useMemo(() => {
    if (!player) return []
    return [...(player.career_stats || [])].sort((a, b) => parseInt(b.Season) - parseInt(a.Season))
  }, [player])

  if (!player) return null

  const qbCols = [
    { key: 'Season', label: 'Year' }, { key: 'Games', label: 'G' },
    { key: 'Fantasy Pts', label: 'Pts' }, { key: 'PPG', label: 'PPG' },
    { key: 'Pos Rank', label: 'Rnk' }, { key: 'Completions', label: 'CMP' },
    { key: 'Attempts', label: 'ATT' }, { key: 'Comp %', label: 'CMP%' },
    { key: 'Pass Yards', label: 'P YDS' }, { key: 'Yds/Att', label: 'Y/A' },
    { key: 'Pass TDs', label: 'PTD' }, { key: 'INTs', label: 'INT' },
    { key: 'Rush Att', label: 'RATT' }, { key: 'Rush Yards', label: 'RYDS' },
    { key: 'Rush TDs', label: 'RTD' }, { key: 'Fumbles Lost', label: 'FL' },
  ]

  const rbCols = [
    { key: 'Season', label: 'Year' }, { key: 'Games', label: 'G' },
    { key: 'Fantasy Pts', label: 'Pts' }, { key: 'PPG', label: 'PPG' },
    { key: 'Pos Rank', label: 'Rnk' }, { key: 'Touches', label: 'TCH' },
    { key: 'Rush Att', label: 'ATT' }, { key: 'Rush Yards', label: 'RYDS' },
    { key: 'Yds/Carry', label: 'Y/C' }, { key: 'Rush TDs', label: 'RTD' },
    { key: 'Targets', label: 'TGT' }, { key: 'Receptions', label: 'REC' },
    { key: 'Catch %', label: 'CTH%' }, { key: 'Rec Yards', label: 'RCYDS' },
    { key: 'Yds/Target', label: 'Y/T' }, { key: 'Rec TDs', label: 'RCTD' },
    { key: 'Fumbles Lost', label: 'FL' },
  ]

  const wrTeCols = [
    { key: 'Season', label: 'Year' }, { key: 'Games', label: 'G' },
    { key: 'Fantasy Pts', label: 'Pts' }, { key: 'PPG', label: 'PPG' },
    { key: 'Pos Rank', label: 'Rnk' }, { key: 'Targets', label: 'TGT' },
    { key: 'Receptions', label: 'REC' }, { key: 'Catch %', label: 'CTH%' },
    { key: 'Rec Yards', label: 'YDS' }, { key: 'Yds/Target', label: 'Y/T' },
    { key: 'Yds/Rec', label: 'Y/R' }, { key: 'Rec TDs', label: 'TD' },
    { key: 'Air Yards', label: 'AIR' }, { key: 'YAC', label: 'YAC' },
    { key: 'Rush Att', label: 'RATT' }, { key: 'Rush Yards', label: 'RYDS' },
    { key: 'Rush TDs', label: 'RTD' }, { key: 'Fumbles Lost', label: 'FL' },
  ]

  const cols = pos === 'QB' ? qbCols : pos === 'RB' ? rbCols : wrTeCols

  const keyStats = [
    { label: 'KTC Value',      value: isNaN(ktc) ? '—' : ktc.toLocaleString() },
    { label: 'Combined Score', value: player['Combined Score'] ? parseInt(player['Combined Score']).toLocaleString() : '—' },
    { label: 'Avg PPG',        value: fmt(ppg) },
    { label: 'Pos Rank (KTC)', value: player['Pos Rank'] ? `#${player['Pos Rank']}` : '—' },
    { label: 'Seasons',        value: isNaN(seasons) ? '—' : seasons.toFixed(0) },
    { label: 'Games',          value: isNaN(games) ? '—' : games.toFixed(0) },
    { label: 'Owner',          value: player['Dynasty Owner'] || '—' },
  ]

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--card-bg)', borderRadius: '12px', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', border: '1px solid var(--card-border)' }}
      >
        {/* Sticky header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 10 }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{player.Player}</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: 'var(--card-border)', color: 'var(--text-secondary)' }}>{pos}</span>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                {player['NFL Team']} · Age {player.Age && player.Age !== '—' ? parseFloat(player.Age).toFixed(1) : '—'}
              </span>
              <span style={{ background: tierColor.bg, color: tierColor.color, fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px' }}>{player.Tier}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '22px', padding: '0', lineHeight: 1, marginLeft: '8px', flexShrink: 0 }}>×</button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Overview */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Overview</div>
            <StatGrid stats={keyStats} />
          </div>

          {/* Snap share */}
          {!isNaN(snapPct) && snapPct > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Snap Share</div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Offensive Snap Share (most recent season)</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{snapPct.toFixed(1)}%</span>
                </div>
                <MiniBar value={snapPct} max={100} color="#4299e1" />
              </div>
            </div>
          )}

          {/* Career season stats */}
          {seasonData.length > 0 ? (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Career Season Stats</div>
              <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--page-bg)' }}>
                      {cols.map(c => (
                        <th key={c.key} style={{ padding: '8px 10px', textAlign: c.key === 'Season' ? 'left' : 'right', fontWeight: 600, color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--card-border)' }}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {seasonData.map((row, i) => (
                      <tr key={i} style={{ borderBottom: i < seasonData.length - 1 ? '1px solid var(--card-border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'var(--page-bg)' }}>
                        {cols.map(c => {
                          const val    = row[c.key]
                          const isYear = c.key === 'Season'
                          const isRank = c.key === 'Pos Rank'
                          const numVal = parseFloat(val)
                          const display = isYear ? val
                            : isRank ? (val && val !== '0' ? `#${Math.round(numVal)}` : '—')
                            : isNaN(numVal) || numVal === 0 ? '—'
                            : Number.isInteger(numVal) ? numVal.toLocaleString()
                            : numVal.toFixed(1)
                          return (
                            <td key={c.key} style={{ padding: '7px 10px', textAlign: isYear ? 'left' : 'right', color: isYear ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isYear ? 600 : 400, whiteSpace: 'nowrap' }}>
                              {display}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '1rem 0' }}>
              No career stats available
            </div>
          )}

        </div>
      </div>
    </div>
  )
}