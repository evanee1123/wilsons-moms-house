import { useState, useMemo } from 'react'

const positions = ['QB', 'RB', 'WR', 'TE']

const TIER_ORDER = [
  'Cornerstone', 'Foundational', 'Upside Premier', 'Mainstay',
  'Productive Vet', 'Short-term Winner', 'Upside Shot',
  'Short-term Production', 'Serviceable', 'Jag Developmental',
  'Jag Insurance', 'Replaceable'
]

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

const TIER_DESCRIPTIONS = {
  'Cornerstone':           'Elite dynasty assets. High value, proven production, long runway. Build around these players.',
  'Foundational':          'Strong proven assets just below Cornerstone. Reliable contributors with good runway.',
  'Upside Premier':        'Elite young prospects with high KTC but limited NFL proof. Buy and hold.',
  'Mainstay':              'Solid contributors. Reliable but not elite. Good depth pieces.',
  'Productive Vet':        'Older players still producing at a high level. Limited runway.',
  'Short-term Winner':     'Veterans with elite production but very limited runway. Win-now assets.',
  'Upside Shot':           'Younger players with upside but unproven. Lottery tickets with potential.',
  'Short-term Production': 'Older players with decent production. Selling window is open.',
  'Serviceable':           'Depth players. Some upside or production but not reliable starters.',
  'Jag Developmental':     'Young backups with some developmental potential. Stash candidates.',
  'Jag Insurance':         'Low value depth players. Roster fillers.',
  'Replaceable':           'Barely rostered. Minimal dynasty value.',
}

function Tooltip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-block', marginLeft: '4px' }}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '14px', height: '14px', borderRadius: '50%', fontSize: '10px',
          fontWeight: 700, cursor: 'help', background: 'var(--card-border)',
          color: 'var(--text-secondary)', userSelect: 'none'
        }}
      >?</span>
      {show && (
        <div style={{
          position: 'absolute', top: '120%', left: '50%', transform: 'translateX(-50%)',
          background: '#1a202c', color: '#fff', fontSize: '11px', lineHeight: '1.5',
          padding: '8px 10px', borderRadius: '6px', width: '280px', zIndex: 1000,
          whiteSpace: 'normal', wordWrap: 'break-word',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', pointerEvents: 'none'
        }}>
          {text}
          <div style={{
            position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
            borderWidth: '4px', borderStyle: 'solid',
            borderColor: 'transparent transparent #1a202c transparent'
          }}/>
        </div>
      )}
    </span>
  )
}

function TierBadge({ tier }) {
  const colors = TIER_COLORS[tier] || { bg: '#e2e8f0', color: '#4a5568' }
  return (
    <span style={{
      background: colors.bg, color: colors.color,
      fontSize: '11px', fontWeight: 600, padding: '2px 8px',
      borderRadius: '99px', whiteSpace: 'nowrap'
    }}>
      {tier || '—'}
    </span>
  )
}

function StatBar({ value, max, color = '#4299e1' }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        flex: 1, height: '6px', background: 'var(--card-border)',
        borderRadius: '3px', overflow: 'hidden'
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: color, borderRadius: '3px',
          transition: 'width 0.4s ease'
        }} />
      </div>
      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: '40px', textAlign: 'right' }}>
        {typeof value === 'number' ? value.toFixed(value % 1 === 0 ? 0 : 2) : value}
      </span>
    </div>
  )
}

function PlayerDetailModal({ player, onClose }) {
  if (!player) return null

  const pos       = player.Position
  const tierColor = TIER_COLORS[player.Tier] || { bg: '#e2e8f0', color: '#4a5568' }
  const epa       = parseFloat(player['EPA vs Avg'])
  const snap      = parseFloat(player['Snap Pct'])
  const tshare    = parseFloat(player['Target Share'])
  const yprr      = parseFloat(player['YPRR'])
  const rz5       = parseFloat(player['RZ5 Carries'])
  const rushYds   = parseFloat(player['Rush Yards'])
  const draft     = parseFloat(player['Draft Value'])
  const draftRnd  = player['Draft Round']
  const draftPick = player['Draft Pick']
  const ktc       = parseFloat(player['KTC Value'])
  const ppg       = parseFloat(player['Avg PPG'])
  const seasons   = parseFloat(player['Seasons'])
  const games     = parseFloat(player['Games Played'])

  const fmt = (v, decimals = 1) =>
    isNaN(v) || v === 0 ? '—' : v.toFixed(decimals)
  const fmtPct = v =>
    isNaN(v) || v === 0 ? '—' : `${(v * 100).toFixed(1)}%`

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card-bg)', borderRadius: '12px', width: '100%',
          maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          border: '1px solid var(--card-border)'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--card-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
        }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {player.Player}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '12px', fontWeight: 600, padding: '2px 8px',
                borderRadius: '99px', background: 'var(--card-border)',
                color: 'var(--text-secondary)'
              }}>{pos}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {player['NFL Team']} · Age {player.Age && player.Age !== '—' ? parseFloat(player.Age).toFixed(1) : '—'}
              </span>
              <TierBadge tier={player.Tier} />
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '20px', padding: '0',
              lineHeight: 1, marginLeft: '8px'
            }}
          >×</button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Tier explanation */}
          <div style={{
            padding: '10px 14px', borderRadius: '8px',
            background: tierColor.bg + '22',
            border: `1px solid ${tierColor.bg}`,
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: tierColor.color, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {player.Tier}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              {TIER_DESCRIPTIONS[player.Tier] || '—'}
            </div>
          </div>

          {/* Key numbers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {[
              { label: 'KTC Value', value: isNaN(ktc) ? '—' : ktc.toLocaleString() },
              { label: 'Avg PPG', value: fmt(ppg) },
              { label: 'Seasons', value: isNaN(seasons) ? '—' : seasons.toFixed(0) },
              { label: 'Owner', value: player['Dynasty Owner'] || '—', span: 3 },
            ].map(({ label, value, span }) => (
              <div key={label} style={{
                gridColumn: span ? `span ${span}` : undefined,
                padding: '10px 12px', borderRadius: '8px',
                background: 'var(--page-bg)', border: '1px solid var(--card-border)'
              }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Advanced stats — position specific */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
              Advanced Stats
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

              {/* EPA — all positions */}
              {!isNaN(epa) && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>EPA vs Position Avg</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: epa >= 0 ? '#48bb78' : '#fc8181' }}>
                      {epa >= 0 ? '+' : ''}{epa.toFixed(3)}
                    </span>
                  </div>
                  <StatBar
                    value={epa + 0.3}
                    max={0.9}
                    color={epa >= 0 ? '#48bb78' : '#fc8181'}
                  />
                </div>
              )}

              {/* Snap share — all positions */}
              {!isNaN(snap) && snap > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Snap Share</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmtPct(snap)}</span>
                  </div>
                  <StatBar value={snap} max={1} color='#4299e1' />
                </div>
              )}

              {/* WR/TE — target share */}
              {(pos === 'WR' || pos === 'TE') && !isNaN(tshare) && tshare > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Target Share</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmtPct(tshare)}</span>
                  </div>
                  <StatBar value={tshare} max={0.35} color='#9f7aea' />
                </div>
              )}

              {/* WR/TE — YPRR */}
              {(pos === 'WR' || pos === 'TE') && !isNaN(yprr) && yprr > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Yards per Route Run</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(yprr)}</span>
                  </div>
                  <StatBar value={yprr} max={15} color='#ed8936' />
                </div>
              )}

              {/* RB — red zone */}
              {pos === 'RB' && !isNaN(rz5) && rz5 > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>RZ Carries (inside 5)</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(rz5, 0)}</span>
                  </div>
                  <StatBar value={rz5} max={50} color='#f56565' />
                </div>
              )}

              {/* QB — rush yards */}
              {pos === 'QB' && !isNaN(rushYds) && rushYds > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Rush Yards (2yr)</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(rushYds, 0)}</span>
                  </div>
                  <StatBar value={rushYds} max={1200} color='#48bb78' />
                </div>
              )}

              {/* Games played */}
              {!isNaN(games) && games > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Games Played (2yr)</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(games, 0)}</span>
                </div>
              )}

            </div>
          </div>

          {/* Draft capital */}
          {!isNaN(draft) && draft > 0 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                Draft Capital
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {[
                  { label: 'Round', value: draftRnd || '—' },
                  { label: 'Pick', value: draftPick || '—' },
                  { label: 'OTC Value', value: isNaN(draft) ? '—' : draft.toLocaleString() },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    padding: '10px 12px', borderRadius: '8px',
                    background: 'var(--page-bg)', border: '1px solid var(--card-border)'
                  }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{label}</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

function FilterPanel({ filters, setFilters, onClose, tiers, owners }) {
  const { positions: selPositions, tiers: selTiers, owners: selOwners } = filters

  const toggle = (key, val) => {
    setFilters(f => {
      const curr = f[key]
      const next = curr.includes(val) ? curr.filter(v => v !== val) : [...curr, val]
      return { ...f, [key]: next }
    })
  }

  const clearAll = () => setFilters({ positions: [], tiers: [], owners: [] })
  const totalActive = selPositions.length + selTiers.length + selOwners.length

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        zIndex: 999, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
        padding: '60px 1rem 1rem'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card-bg)', borderRadius: '12px', width: '280px',
          maxHeight: '80vh', overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          border: '1px solid var(--card-border)'
        }}
      >
        <div style={{
          padding: '1rem 1.25rem', borderBottom: '1px solid var(--card-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span style={{ fontWeight: 700, fontSize: '14px' }}>Filters</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {totalActive > 0 && (
              <button onClick={clearAll} style={{
                fontSize: '11px', color: 'var(--blue)', background: 'none',
                border: 'none', cursor: 'pointer', padding: 0
              }}>Clear all</button>
            )}
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '18px', lineHeight: 1, padding: 0
            }}>×</button>
          </div>
        </div>

        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Position */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Position</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {positions.map(pos => (
                <button key={pos} onClick={() => toggle('positions', pos)} style={{
                  padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                  border: '1px solid var(--card-border)', cursor: 'pointer',
                  background: selPositions.includes(pos) ? 'var(--blue)' : 'var(--page-bg)',
                  color: selPositions.includes(pos) ? '#fff' : 'var(--text-secondary)',
                }}>{pos}</button>
              ))}
            </div>
          </div>

          {/* Tier */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Tier</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {TIER_ORDER.map(tier => {
                const colors = TIER_COLORS[tier] || { bg: '#e2e8f0', color: '#4a5568' }
                const selected = selTiers.includes(tier)
                return (
                  <button key={tier} onClick={() => toggle('tiers', tier)} style={{
                    padding: '5px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                    border: `1px solid ${selected ? colors.color + '44' : 'var(--card-border)'}`,
                    cursor: 'pointer', textAlign: 'left',
                    background: selected ? colors.bg : 'var(--page-bg)',
                    color: selected ? colors.color : 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center', gap: '8px'
                  }}>
                    <span style={{
                      width: '10px', height: '10px', borderRadius: '50%',
                      background: colors.bg, flexShrink: 0
                    }} />
                    {tier}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Owner */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Owner</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {owners.map(owner => (
                <button key={owner} onClick={() => toggle('owners', owner)} style={{
                  padding: '5px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                  border: '1px solid var(--card-border)', cursor: 'pointer', textAlign: 'left',
                  background: selOwners.includes(owner) ? 'var(--blue)' : 'var(--page-bg)',
                  color: selOwners.includes(owner) ? '#fff' : 'var(--text-secondary)',
                }}>{owner}</button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default function PlayerRankings({ data }) {
  const [search,       setSearch]       = useState('')
  const [showAll,      setShowAll]      = useState(false)
  const [sortBy,       setSortBy]       = useState('KTC Value')
  const [sortDir,      setSortDir]      = useState('desc')
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [showFilters,  setShowFilters]  = useState(false)
  const [filters,      setFilters]      = useState({ positions: [], tiers: [], owners: [] })

  const activeFilterCount = filters.positions.length + filters.tiers.length + filters.owners.length

  // Build position rank lookup
  const posRanks = useMemo(() => {
    const ranks = {}
    positions.forEach(pos => {
      const sorted = [...(data?.playerUniverse || [])]
        .filter(p => p.Position === pos)
        .sort((a, b) => parseFloat(b['KTC Value']) - parseFloat(a['KTC Value']))
      sorted.forEach((p, i) => { ranks[p.Player] = i + 1 })
    })
    return ranks
  }, [data])

  // Build merged player list
  const mergedAllPlayers = useMemo(() => {
    const rosteredList = data?.playerUniverse || []
    function normalizeName(name) {
      return name.toLowerCase().replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '').replace(/[^a-z]/g, '')
    }
    const rosteredNormalized = new Set(rosteredList.map(p => normalizeName(p.Player)))
    const unrostered = (data?.ktcRankings || [])
      .filter(p => {
        const name = p['Player / Pick']
        if (!name) return false
        return !rosteredNormalized.has(normalizeName(name))
      })
      .map(p => ({
        Player: p['Player / Pick'], Position: p.Position || '—',
        'NFL Team': '—', Age: '—', 'KTC Value': p['KTC Value'],
        'Combined Score': p['Combined Score'], 'Multi-Year Prod Score': p['Multi-Year Prod Score'],
        'Avg PPG': '—', Tier: p.Tier || '—', 'Dynasty Owner': 'Unrostered', 'On Taxi': 'False',
      }))
    return [...rosteredList, ...unrostered]
  }, [data])

  // Get unique owners for filter panel
  const allOwners = useMemo(() => {
    const source = data?.playerUniverse || []
    return [...new Set(source.map(p => p['Dynasty Owner']).filter(Boolean))].sort()
  }, [data])

  const players = useMemo(() => {
    const source = showAll ? mergedAllPlayers : (data?.playerUniverse || [])
    let filtered = source.filter(p => {
      const name        = p.Player || ''
      const matchSearch = name.toLowerCase().includes(search.toLowerCase())
      const matchPos    = filters.positions.length === 0 || filters.positions.includes(p.Position)
      const matchTier   = filters.tiers.length === 0 || filters.tiers.includes(p.Tier)
      const matchOwner  = filters.owners.length === 0 || filters.owners.includes(p['Dynasty Owner'])
      return matchSearch && matchPos && matchTier && matchOwner
    })
    filtered = [...filtered].sort((a, b) => {
      const av = parseFloat(a[sortBy]) || 0
      const bv = parseFloat(b[sortBy]) || 0
      return sortDir === 'desc' ? bv - av : av - bv
    })
    return filtered
  }, [data, search, filters, showAll, sortBy, sortDir, mergedAllPlayers])

  const handleSort = col => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const SortTh = ({ col, label, align = 'left' }) => (
    <th onClick={() => handleSort(col)} style={{ cursor: 'pointer', userSelect: 'none', textAlign: align }}>
      {label} {sortBy === col ? (sortDir === 'desc' ? '↓' : '↑') : ''}
    </th>
  )

  return (
    <div className='page'>
      <div className='page-title'>Player Rankings</div>
      <div className='page-subtitle'>
        {showAll ? 'All players' : 'Rostered players only'} · {players.length} shown
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder='Search players...'
          style={{
            padding: '6px 12px', borderRadius: '6px', fontSize: '13px',
            border: '1px solid var(--card-border)', background: 'var(--card-bg)',
            color: 'var(--text-primary)', flex: 1, minWidth: '160px'
          }}
        />

        {/* Filter button */}
        <button onClick={() => setShowFilters(s => !s)} style={{
          padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
          border: `1px solid ${activeFilterCount > 0 ? 'var(--blue)' : 'var(--card-border)'}`,
          cursor: 'pointer',
          background: activeFilterCount > 0 ? 'var(--blue)' : 'var(--card-bg)',
          color: activeFilterCount > 0 ? '#fff' : 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          ⚙ Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
        </button>

        {/* Show all toggle */}
        <button onClick={() => setShowAll(s => !s)} style={{
          padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
          border: '1px solid var(--card-border)', cursor: 'pointer',
          background: 'var(--card-bg)', color: 'var(--text-secondary)',
        }}>
          {showAll ? 'Rostered only' : 'Show all'}
        </button>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          {filters.positions.map(p => (
            <span key={p} onClick={() => setFilters(f => ({ ...f, positions: f.positions.filter(v => v !== p) }))}
              style={{
                padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
                background: 'var(--blue)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
              }}>
              {p} ×
            </span>
          ))}
          {filters.tiers.map(t => {
            const c = TIER_COLORS[t] || { bg: '#e2e8f0', color: '#4a5568' }
            return (
              <span key={t} onClick={() => setFilters(f => ({ ...f, tiers: f.tiers.filter(v => v !== t) }))}
                style={{
                  padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
                  background: c.bg, color: c.color, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                }}>
                {t} ×
              </span>
            )
          })}
          {filters.owners.map(o => (
            <span key={o} onClick={() => setFilters(f => ({ ...f, owners: f.owners.filter(v => v !== o) }))}
              style={{
                padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
                background: 'var(--card-border)', color: 'var(--text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px'
              }}>
              {o} ×
            </span>
          ))}
        </div>
      )}

      <div className='card'>
        <div className='table-scroll'>
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th>Player</th>
                <th>Pos</th>
                <th>NFL Team</th>
                <SortTh col='Age'            label='Age'      align='right' />
                <SortTh col='KTC Value'      label='KTC'      align='right' />
                <th style={{ textAlign: 'right' }}>Pos Rank</th>
                <SortTh col='Combined Score' label='Combined' align='right' />
                <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}
                  onClick={() => handleSort('Avg PPG')}>
                  Avg PPG {sortBy === 'Avg PPG' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  <Tooltip text="Average fantasy points per game using the best 3 of the last 4 seasons, normalized within position." />
                </th>
                <th>Tier</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => {
                const onTaxi       = p['On Taxi'] === 'True'
                const posRank      = posRanks[p.Player]
                const isUnrostered = p['Dynasty Owner'] === 'Unrostered'
                return (
                  <tr
                    key={i}
                    onClick={() => setSelectedPlayer(p)}
                    style={{
                      cursor: 'pointer',
                      background: onTaxi ? 'rgba(246,224,94,0.08)' : isUnrostered ? 'var(--page-bg)' : 'transparent',
                      opacity: isUnrostered ? 0.7 : 1,
                    }}
                  >
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>
                      {p.Player}
                      {onTaxi && <span className='badge badge-yellow' style={{ marginLeft: '6px', fontSize: '10px' }}>TAXI</span>}
                    </td>
                    <td>{p.Position}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{p['NFL Team']}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {p.Age && p.Age !== '—' ? parseFloat(p.Age).toFixed(1) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {parseInt(p['KTC Value'] || 0).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {posRank ? `#${posRank}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {parseInt(p['Combined Score'] || 0).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {p['Avg PPG'] && p['Avg PPG'] !== '—' ? parseFloat(p['Avg PPG']).toFixed(1) : '—'}
                    </td>
                    <td><TierBadge tier={p.Tier} /></td>
                    <td style={{ color: isUnrostered ? 'var(--text-muted)' : 'var(--text-secondary)', fontSize: '12px' }}>
                      {isUnrostered ? 'Unrostered' : (p['Dynasty Owner'] || '—')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <FilterPanel
          filters={filters}
          setFilters={setFilters}
          onClose={() => setShowFilters(false)}
          tiers={TIER_ORDER}
          owners={allOwners}
        />
      )}

      {/* Player detail modal */}
      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  )
}