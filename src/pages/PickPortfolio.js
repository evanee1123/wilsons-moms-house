import { useState, useMemo } from 'react'
import { useLeague } from '../contexts/LeagueContext'
import { PickYearGroup, dedupePicks, buildTeamColorMap } from '../components/PickPortfolioCards'

export default function PickPortfolio({ data }) {
  const { leagueId } = useLeague()
  // eslint-disable-next-line no-unused-vars
  const isWilsonsLeague = leagueId === '1312130103358021632'
  const [ownerFilter, setOwnerFilter] = useState('ALL')
  const [yearFilter,  setYearFilter]  = useState('ALL')

  const picks = useMemo(() => dedupePicks(data?.pickPortfolio || []), [data])

  const allYears = useMemo(() => (
    [...new Set(picks.map(p => p.Year).filter(Boolean))].sort((a, b) => a - b)
  ), [picks])

  const years = useMemo(() => ['ALL', ...allYears], [allYears])

  const owners = useMemo(() => (
    ['ALL', ...new Set(picks.map(p => p['Current Owner']).filter(Boolean))]
  ), [picks])

  const ownerSummary = useMemo(() => {
    return owners.filter(o => o !== 'ALL').map(owner => {
      const ownerPicks  = picks.filter(p => p['Current Owner'] === owner)
      const totalValue  = ownerPicks.reduce((sum, p) => sum + parseFloat(p['KTC Value'] || 0), 0)
      const firstRounds = ownerPicks.filter(p => parseInt(p.Round) === 1).length
      return { owner, totalValue, firstRounds }
    }).sort((a, b) => b.totalValue - a.totalValue)
  }, [picks, owners])

  const viewerOwner = ownerFilter === 'ALL' ? undefined : ownerFilter
  const isAllMode   = !viewerOwner

  const teamColorMap = useMemo(() => (
    buildTeamColorMap(owners.filter(o => o !== 'ALL'))
  ), [owners])

  const yearGroups = useMemo(() => {
    const yearsToShow = yearFilter === 'ALL' ? allYears : [yearFilter]
    return yearsToShow.map(year => {
      const yearPicks = picks.filter(p => p.Year === year)
      const allRoundsForYear = [...new Set(yearPicks.map(p => parseInt(p.Round)))].sort((a, b) => a - b)

      const ownedPicks = (viewerOwner
        ? yearPicks.filter(p => p['Current Owner'] === viewerOwner)
        : [...yearPicks]
      ).sort((a, b) => parseInt(a.Round) - parseInt(b.Round) || (parseFloat(b['KTC Value']) || 0) - (parseFloat(a['KTC Value']) || 0))

      const sentPicks = viewerOwner
        ? yearPicks
            .filter(p => p['Original Owner'] === viewerOwner && p['Current Owner'] !== viewerOwner)
            .sort((a, b) => parseInt(a.Round) - parseInt(b.Round))
        : []

      return { year, ownedPicks, sentPicks, allRoundsForYear }
    }).filter(g => g.ownedPicks.length > 0 || g.sentPicks.length > 0)
  }, [yearFilter, allYears, picks, viewerOwner])

  const totalShown = yearGroups.reduce((sum, g) => sum + g.ownedPicks.length, 0)

  return (
    <div className='page'>
      <div className='page-title'>Pick Portfolio</div>
      <div className='page-subtitle'>
        League-wide draft capital · {totalShown} picks shown
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

      {/* Pick cards */}
      <div className='card'>
        <div className='card-header'>
          <h3>{viewerOwner ? `${viewerOwner}'s Picks` : 'All Picks'}</h3>
          <span>{totalShown} picks</span>
        </div>
        <div style={{ padding: '16px' }}>
          {isAllMode && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {Object.entries(teamColorMap).map(([owner, color]) => (
                <div key={owner} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{
                    display: 'inline-block', width: '8px', height: '8px',
                    borderRadius: '50%', background: color, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{owner}</span>
                </div>
              ))}
            </div>
          )}
          {yearGroups.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No picks match these filters.</div>
          )}
          {yearGroups.map(g => (
            <PickYearGroup
              key={g.year}
              year={g.year}
              ownedPicks={g.ownedPicks}
              sentPicks={g.sentPicks}
              allRoundsForYear={g.allRoundsForYear}
              viewerOwner={viewerOwner}
              compact={isAllMode}
              teamColors={isAllMode ? teamColorMap : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
