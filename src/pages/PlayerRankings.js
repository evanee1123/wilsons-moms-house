import { useState, useMemo } from 'react'

const positions = ['ALL', 'QB', 'RB', 'WR', 'TE']

const TIER_COLORS = {
  'Cornerstone':           { bg: '#f6e05e', color: '#744210' },
  'Upside Premier':        { bg: '#b794f4', color: '#322659' },
  'Foundational':          { bg: '#90cdf4', color: '#1a3f5c' },
  'Mainstay':              { bg: '#9ae6b4', color: '#1a5436' },
  'Productive Vet':        { bg: '#76e4f7', color: '#065666' },
  'Short-term Winner':     { bg: '#f6ad55', color: '#652b19' },
  'Upside Shot':           { bg: '#c6f6d5', color: '#1a5436' },
  'Short-term Production': { bg: '#faf089', color: '#744210' },
  'Serviceable':           { bg: '#90cdf4', color: '#1a3f5c' },
  'Jag Developmental':     { bg: '#fc8181', color: '#63171b' },
  'Jag Insurance':         { bg: '#feb2b2', color: '#63171b' },
  'Replaceable':           { bg: '#e2e8f0', color: '#4a5568' },
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

export default function PlayerRankings({ data }) {
  const [search,   setSearch]   = useState('')
  const [position, setPosition] = useState('ALL')
  const [showAll,  setShowAll]  = useState(false)
  const [sortBy,   setSortBy]   = useState('KTC Value')
  const [sortDir,  setSortDir]  = useState('desc')

  // Build position rank lookup from playerUniverse
  const posRanks = useMemo(() => {
    const ranks = {}
    positions.filter(p => p !== 'ALL').forEach(pos => {
      const sorted = [...(data?.playerUniverse || [])]
        .filter(p => p.Position === pos)
        .sort((a, b) => parseFloat(b['KTC Value']) - parseFloat(a['KTC Value']))
      sorted.forEach((p, i) => { ranks[p.Player] = i + 1 })
    })
    return ranks
  }, [data])

  // Build merged player list for "show all" mode
  // Rostered players come from playerUniverse (full data)
  // Unrostered players come from ktcRankings (limited data)
const mergedAllPlayers = useMemo(() => {
  const rosteredList = data?.playerUniverse || []
  
  // Normalize names for matching — lowercase, remove suffixes, remove spaces
  function normalizeName(name) {
    return name
      .toLowerCase()
      .replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '')
      .replace(/[^a-z]/g, '')
  }

  const rosteredNormalized = new Set(
    rosteredList.map(p => normalizeName(p.Player))
  )

  const unrostered = (data?.ktcRankings || [])
    .filter(p => {
      const name = p['Player / Pick']
      if (!name) return false
      return !rosteredNormalized.has(normalizeName(name))
    })
    .map(p => ({
      Player:                  p['Player / Pick'],
      Position:                p.Position || '—',
      'NFL Team':              '—',
      Age:                     '—',
      'KTC Value':             p['KTC Value'],
      'Combined Score':        p['Combined Score'],
      'Multi-Year Prod Score': p['Multi-Year Prod Score'],
      'Avg PPG':               '—',
      Tier:                    p.Tier || '—',
      'Dynasty Owner':         'Unrostered',
      'On Taxi':               'False',
    }))

  return [...rosteredList, ...unrostered]
}, [data])

  const players = useMemo(() => {
    const source = showAll ? mergedAllPlayers : (data?.playerUniverse || [])

    let filtered = source.filter(p => {
      const name         = p.Player || ''
      const matchSearch  = name.toLowerCase().includes(search.toLowerCase())
      const matchPos     = position === 'ALL' || p.Position === position
      return matchSearch && matchPos
    })

    filtered = [...filtered].sort((a, b) => {
      const av = parseFloat(a[sortBy]) || 0
      const bv = parseFloat(b[sortBy]) || 0
      if (sortBy === 'Age') return sortDir === 'desc' ? bv - av : av - bv
      return sortDir === 'desc' ? bv - av : av - bv
    })

    return filtered
  }, [data, search, position, showAll, sortBy, sortDir, mergedAllPlayers])

  const handleSort = col => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const SortTh = ({ col, label, align = 'left' }) => (
    <th onClick={() => handleSort(col)} style={{
      cursor: 'pointer', userSelect: 'none', textAlign: align
    }}>
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
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap',
                    marginBottom: '1rem', alignItems: 'center' }}>

        {/* Position tabs */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {positions.map(pos => (
            <button key={pos} onClick={() => setPosition(pos)} style={{
              padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
              border: '1px solid var(--card-border)', cursor: 'pointer',
              background: position === pos ? 'var(--blue)' : 'var(--card-bg)',
              color: position === pos ? '#fff' : 'var(--text-secondary)',
            }}>
              {pos}
            </button>
          ))}
        </div>

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

        {/* Toggle */}
        <button onClick={() => setShowAll(s => !s)} style={{
          padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
          border: '1px solid var(--card-border)', cursor: 'pointer',
          background: 'var(--card-bg)', color: 'var(--text-secondary)',
        }}>
          {showAll ? 'Rostered only' : 'Show all players'}
        </button>
      </div>

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
                <th
                  onClick={() => handleSort('Avg PPG')}
                  style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}
                >
                  Avg PPG{' '}
                  {sortBy === 'Avg PPG' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  <Tooltip text="Average fantasy points per game using the best 3 of the last 4 seasons, normalized within position. Protects against outlier injury seasons." />
                </th>
                <th>Tier</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => {
                const onTaxi  = p['On Taxi'] === 'True'
                const posRank = posRanks[p.Player]
                const isUnrostered = p['Dynasty Owner'] === 'Unrostered'

                return (
                  <tr key={i} style={{
                    background: onTaxi
                      ? 'rgba(246,224,94,0.08)'
                      : isUnrostered
                      ? 'var(--page-bg)'
                      : 'transparent',
                    opacity: isUnrostered ? 0.7 : 1,
                  }}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{p.Player}</td>
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
                      {p['Avg PPG'] && p['Avg PPG'] !== '—'
                        ? parseFloat(p['Avg PPG']).toFixed(1) : '—'}
                    </td>
                    <td><TierBadge tier={p.Tier} /></td>
                    <td style={{ color: isUnrostered
                      ? 'var(--text-muted)' : 'var(--text-secondary)', fontSize: '12px' }}>
                      {isUnrostered ? 'Unrostered' : (p['Dynasty Owner'] || '—')}
                    </td>
                    {!showAll && (
                      <td>
                        {onTaxi && <span className='badge badge-yellow'>TAXI</span>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}