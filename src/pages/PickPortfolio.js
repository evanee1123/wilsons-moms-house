import { useState, useMemo } from 'react'

export default function PickPortfolio({ data }) {
  const [ownerFilter, setOwnerFilter] = useState('ALL')
  const [yearFilter,  setYearFilter]  = useState('ALL')
  const [sortBy,      setSortBy]      = useState('KTC Value')
  const [sortDir,     setSortDir]     = useState('desc')

  const picks = useMemo(() => data?.pickPortfolio || [], [data])

  const years = useMemo(() => (
    ['ALL', ...new Set(picks.map(p => p.Year).filter(Boolean))]
  ), [picks])

  const owners = useMemo(() => (
    ['ALL', ...new Set(picks.map(p => p['Current Owner']).filter(Boolean))]
  ), [picks])

  const ownerSummary = useMemo(() => {
    return owners.filter(o => o !== 'ALL').map(owner => {
      const ownerPicks  = picks.filter(p => p['Current Owner'] === owner)
      const totalValue  = ownerPicks.reduce((sum, p) => sum + parseFloat(p['KTC Value'] || 0), 0)
      const firstRounds = ownerPicks.filter(p => p.Round === '1' || p.Round === 1).length
      return { owner, totalValue, firstRounds }
    }).sort((a, b) => b.totalValue - a.totalValue)
  }, [picks, owners])

  const filtered = useMemo(() => {
    let result = picks.filter(p => {
      const matchOwner = ownerFilter === 'ALL' || p['Current Owner'] === ownerFilter
      const matchYear  = yearFilter  === 'ALL' || p.Year === yearFilter
      return matchOwner && matchYear
    })
    return [...result].sort((a, b) => {
      const av = parseFloat(a[sortBy]) || 0
      const bv = parseFloat(b[sortBy]) || 0
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [picks, ownerFilter, yearFilter, sortBy, sortDir])

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

  function getRoundLabel(round) {
    const r = parseInt(round)
    if (r === 1) return '1st'
    if (r === 2) return '2nd'
    if (r === 3) return '3rd'
    return '4th'
  }

  return (
    <div className='page'>
      <div className='page-title'>Pick Portfolio</div>
      <div className='page-subtitle'>
        League-wide draft capital · {filtered.length} picks shown
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: '10px', marginBottom: '1.25rem' }}>
        {ownerSummary.map((s, i) => (
          <div
            key={s.owner}
            onClick={() => setOwnerFilter(ownerFilter === s.owner ? 'ALL' : s.owner)}
            style={{
              background: ownerFilter === s.owner ? 'var(--blue)' : 'var(--card-bg)',
              border: `1px solid ${ownerFilter === s.owner ? 'var(--blue)' : 'var(--card-border)'}`,
              borderRadius: '10px', padding: '12px', cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '2px',
                          color: ownerFilter === s.owner
                            ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)' }}>
              #{i + 1} by value
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          color: ownerFilter === s.owner ? '#fff' : 'var(--text-primary)' }}>
              {s.owner}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span style={{ color: ownerFilter === s.owner
                ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)' }}>Total value</span>
              <span style={{ fontWeight: 600,
                             color: ownerFilter === s.owner ? '#fff' : 'var(--text-primary)' }}>
                {s.totalValue.toLocaleString()}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between',
                          fontSize: '11px', marginTop: '3px' }}>
              <span style={{ color: ownerFilter === s.owner
                ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)' }}>1st rounders</span>
              <span style={{ fontWeight: 600,
                             color: ownerFilter === s.owner ? '#fff' : 'var(--text-primary)' }}>
                {s.firstRounds}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem',
                    flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {years.map(y => (
            <button key={y} onClick={() => setYearFilter(y)} style={{
              padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
              border: '1px solid var(--card-border)', cursor: 'pointer',
              background: yearFilter === y ? 'var(--blue)' : 'var(--card-bg)',
              color: yearFilter === y ? '#fff' : 'var(--text-secondary)',
            }}>
              {y}
            </button>
          ))}
        </div>

        <select
          value={ownerFilter}
          onChange={e => setOwnerFilter(e.target.value)}
          style={{
            padding: '6px 12px', borderRadius: '6px', fontSize: '13px',
            border: '1px solid var(--card-border)', background: 'var(--card-bg)',
            color: 'var(--text-primary)', cursor: 'pointer'
          }}
        >
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>

        {(ownerFilter !== 'ALL' || yearFilter !== 'ALL') && (
          <button onClick={() => { setOwnerFilter('ALL'); setYearFilter('ALL') }} style={{
            padding: '6px 12px', borderRadius: '6px', fontSize: '12px',
            border: '1px solid var(--card-border)', cursor: 'pointer',
            background: 'var(--card-bg)', color: 'var(--text-secondary)',
          }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Pick table */}
      <div className='card'>
        <div className='card-header'>
          <h3>All Picks</h3>
          <span>{filtered.length} picks</span>
        </div>
        <div className='table-scroll'>
          <table>
            <thead>
              <tr>
                <th>Pick Name</th>
                <SortTh col='Year'      label='Year' />
                <SortTh col='Round'     label='Round' />
                <th>Tier</th>
                <th>Original Owner</th>
                <th>Current Owner</th>
                <SortTh col='KTC Value' label='KTC Value' align='right' />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{p['Pick Name']}</td>
                  <td>{p.Year}</td>
                  <td>{getRoundLabel(p.Round)}</td>
                  <td>
                    <span className={
                      p.Tier === 'Early' ? 'badge badge-green' :
                      p.Tier === 'Mid'   ? 'badge badge-yellow' : 'badge badge-red'
                    }>{p.Tier}</span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{p['Original Owner']}</td>
                  <td style={{ fontWeight: 500 }}>{p['Current Owner']}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {parseInt(p['KTC Value'] || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}