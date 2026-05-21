import { useState, useMemo } from 'react'

function ChampionBanner({ champions }) {
  if (!champions || champions.length === 0) return null
  const sorted = [...champions].sort((a, b) => parseInt(b.Season) - parseInt(a.Season))
  return (
    <div className='card' style={{ marginBottom: '1.25rem' }}>
      <div className='card-header'><h3>🏆 Champions</h3></div>
      <div style={{ display: 'flex', gap: '12px', padding: '1rem', flexWrap: 'wrap' }}>
        {sorted.map(c => (
          <div key={c.Season} style={{
            padding: '12px 16px', borderRadius: '10px', textAlign: 'center',
            background: 'linear-gradient(135deg, #f6e05e22, #f6ad5522)',
            border: '1px solid #f6e05e66', minWidth: '120px'
          }}>
            <div style={{ fontSize: '24px' }}>🏆</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>{c.Champion}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{c.Season} Season</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AllTimeStandings({ data }) {
  if (!data || data.length === 0) return null
  return (
    <div className='card' style={{ marginBottom: '1.25rem' }}>
      <div className='card-header'><h3>All-Time Standings</h3></div>
      <div className='table-scroll'>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Owner</th>
              <th style={{ textAlign: 'right' }}>Seasons</th>
              <th style={{ textAlign: 'right' }}>Record</th>
              <th style={{ textAlign: 'right' }}>Win %</th>
              <th style={{ textAlign: 'right' }}>PF</th>
              <th style={{ textAlign: 'right' }}>PA</th>
              <th style={{ textAlign: 'right' }}>PPG</th>
              <th style={{ textAlign: 'right' }}>Max PF</th>
              <th style={{ textAlign: 'right' }}>Best Score</th>
              <th style={{ textAlign: 'right' }}>🏆</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={r.Owner}>
                <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{r.Rank || i + 1}</td>
                <td style={{ fontWeight: 600 }}>{r.Owner}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{r.Seasons}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{r.Wins}-{r.Losses}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{r['Win %']}%</td>
                <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{parseFloat(r.PF).toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{parseFloat(r.PA).toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{r.PPG}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{parseFloat(r['Max PF']).toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{r['Best Score']}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#d69e2e' }}>
                  {parseInt(r.Championships) > 0 ? `${r.Championships}x` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// eslint-disable-next-line no-unused-vars
function PlayoffBracket({ standings, winnersRaw, losersRaw, playoffMatchups, ridToOwner }) {
  if (!winnersRaw || winnersRaw.length === 0) return null

  // Build score lookup: roster_id -> week -> points
  const scores = {}
  if (playoffMatchups) {
    Object.entries(playoffMatchups).forEach(([week, matchups]) => {
      if (!matchups) return
      matchups.forEach(team => {
        if (!scores[team.roster_id]) scores[team.roster_id] = {}
        scores[team.roster_id][parseInt(week)] = team.points || 0
      })
    })
  }

  function getOwner(rid) {
    if (!rid) return '?'
    return ridToOwner?.[rid] || ridToOwner?.[String(rid)] || `Team ${rid}`
  }

  function getScore(rid, week) {
    const pts = scores[rid]?.[week]
    return pts != null ? pts.toFixed(2) : '—'
  }

  // Organize bracket by round
  const rounds = {}
  winnersRaw.forEach(m => {
    if (!rounds[m.r]) rounds[m.r] = []
    rounds[m.r].push(m)
  })

  const numRounds = Math.max(...Object.keys(rounds).map(Number))
  const weekMap = { 1: 15, 2: 16, 3: 17 }

  const roundLabels = {
    1: numRounds === 3 ? 'Quarterfinals' : 'Semifinals',
    2: numRounds === 3 ? 'Semifinals' : 'Championship',
    3: 'Championship'
  }

  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
        Playoff Bracket
      </div>
      <div style={{ display: 'flex', gap: '0', overflowX: 'auto' }}>
        {Object.entries(rounds).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([round, matchups]) => {
          const roundNum = parseInt(round)
          const week     = weekMap[roundNum]
          return (
            <div key={round} style={{ display: 'flex', flexDirection: 'column', minWidth: '200px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', paddingLeft: '12px' }}>
                {roundLabels[roundNum] || `Round ${round}`}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', flex: 1, gap: '16px', padding: '0 8px' }}>
                {matchups.map(m => {
                  const t1  = m.t1_from ? null : m.t1
                  const t2  = m.t2_from ? null : m.t2
                  const rid1 = t1 || m.t1
                  const rid2 = t2 || m.t2
                  const win  = m.w
                  const pts1 = week ? getScore(rid1, week) : '—'
                  const pts2 = week ? getScore(rid2, week) : '—'

                  return (
                    <div key={m.m} style={{
                      border: '1px solid var(--card-border)', borderRadius: '8px',
                      overflow: 'hidden', background: 'var(--card-bg)'
                    }}>
                      {[{ rid: rid1, pts: pts1 }, { rid: rid2, pts: pts2 }].map(({ rid, pts }, idx) => {
                        const isWinner = rid === win
                        const owner    = getOwner(rid)
                        return (
                          <div key={idx} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '8px 10px',
                            background: isWinner ? 'rgba(72,187,120,0.12)' : 'transparent',
                            borderBottom: idx === 0 ? '1px solid var(--card-border)' : 'none',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {isWinner && <span style={{ fontSize: '10px' }}>✓</span>}
                              <span style={{
                                fontSize: '12px', fontWeight: isWinner ? 700 : 400,
                                color: isWinner ? '#48bb78' : 'var(--text-secondary)',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                maxWidth: '110px'
                              }}>{owner}</span>
                            </div>
                            <span style={{
                              fontSize: '12px', fontWeight: isWinner ? 700 : 400,
                              color: isWinner ? '#48bb78' : 'var(--text-muted)',
                              marginLeft: '8px', whiteSpace: 'nowrap'
                            }}>{pts}</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SeasonModal({ season, standings, historyStandings, champions, data, onClose }) {
  const seasonStandings = historyStandings?.filter(r => r.Season === season) || []
  const champion = champions?.find(c => c.Season === season)?.Champion || '—'

  // Get bracket data from history player games / top weeks (we don't have raw bracket in sheets)
  // Build a simplified bracket from the playoff matchup data we stored

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--card-bg)', borderRadius: '12px', width: '100%',
        maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)', border: '1px solid var(--card-border)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--card-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 10
        }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {season} Season
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              🏆 Champion: <span style={{ fontWeight: 600, color: '#d69e2e' }}>{champion}</span>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: '22px', lineHeight: 1
          }}>×</button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Season standings */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
              Regular Season Standings
            </div>
            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'var(--page-bg)' }}>
                    {['#','Owner','W','L','PF','PA','PPG','Max PF','Best'].map(h => (
                      <th key={h} style={{
                        padding: '8px 10px', textAlign: h === 'Owner' || h === '#' ? 'left' : 'right',
                        fontWeight: 600, color: 'var(--text-muted)', fontSize: '11px',
                        borderBottom: '1px solid var(--card-border)', whiteSpace: 'nowrap'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {seasonStandings.map((r, i) => (
                    <tr key={r.Owner} style={{
                      background: r.Champion === 'TRUE' || r.Champion === true ? 'rgba(246,224,94,0.08)' : i % 2 === 0 ? 'transparent' : 'var(--page-bg)',
                      borderBottom: '1px solid var(--card-border)'
                    }}>
                      <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontSize: '12px' }}>{r.Rank}</td>
                      <td style={{ padding: '7px 10px', fontWeight: 500 }}>
                        {r.Owner} {(r.Champion === 'TRUE' || r.Champion === true) && '🏆'}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.Wins}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.Losses}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{parseFloat(r.PF).toFixed(2)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{parseFloat(r.PA).toFixed(2)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.PPG}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{parseFloat(r['Max PF']).toFixed(2)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r['Best Score']}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Playoff bracket placeholder — bracket data not in sheets yet */}
          <div style={{
            padding: '1rem', borderRadius: '8px', background: 'var(--page-bg)',
            border: '1px solid var(--card-border)', textAlign: 'center',
            color: 'var(--text-muted)', fontSize: '13px'
          }}>
            Playoff bracket coming soon — requires additional data pipeline work
          </div>

        </div>
      </div>
    </div>
  )
}

function Top10Table({ title, data, cols }) {
  if (!data || data.length === 0) return null
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>{title}</div>
      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: 'var(--page-bg)' }}>
              <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: '11px', borderBottom: '1px solid var(--card-border)' }}>#</th>
              {cols.map(c => (
                <th key={c.key} style={{
                  padding: '7px 10px', textAlign: c.align || 'left',
                  fontWeight: 600, color: 'var(--text-muted)', fontSize: '11px',
                  borderBottom: '1px solid var(--card-border)', whiteSpace: 'nowrap'
                }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} style={{
                borderBottom: i < data.length - 1 ? '1px solid var(--card-border)' : 'none',
                background: i % 2 === 0 ? 'transparent' : 'var(--page-bg)'
              }}>
                <td style={{ padding: '7px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>{i + 1}</td>
                {cols.map(c => (
                  <td key={c.key} style={{
                    padding: '7px 10px', textAlign: c.align || 'left',
                    color: c.highlight ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: c.highlight ? 600 : 400, whiteSpace: 'nowrap'
                  }}>{row[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function LeagueHistory({ data }) {
  const [selectedSeason, setSelectedSeason] = useState(null)

  const seasons = useMemo(() => {
    const s = [...new Set(data?.historyStandings?.map(r => r.Season) || [])]
    return s.sort((a, b) => parseInt(b) - parseInt(a))
  }, [data])

  const topWeeks = useMemo(() => data?.historyTopWeeks || [], [data])

  const playerGames = useMemo(() => {
    const all = data?.historyPlayerGames || []
    return {
      overall: all.filter(r => r.Category === 'Overall'),
      QB:      all.filter(r => r.Category === 'QB'),
      RB:      all.filter(r => r.Category === 'RB'),
      WR:      all.filter(r => r.Category === 'WR'),
      TE:      all.filter(r => r.Category === 'TE'),
    }
  }, [data])

  const weekCols = [
    { key: 'Owner',  label: 'Owner',  highlight: true },
    { key: 'Points', label: 'Points', align: 'right', highlight: true },
    { key: 'Week',   label: 'Week',   align: 'right' },
  ]

  const playerCols = [
    { key: 'Player',   label: 'Player',  highlight: true },
    { key: 'Position', label: 'Pos' },
    { key: 'Points',   label: 'Points',  align: 'right', highlight: true },
    { key: 'Week',     label: 'Week',    align: 'right' },
    { key: 'Owner',    label: 'Owner' },
    { key: 'Started',  label: 'Status' },
  ]

  const posCols = [
    { key: 'Player',  label: 'Player',  highlight: true },
    { key: 'Points',  label: 'Points',  align: 'right', highlight: true },
    { key: 'Week',    label: 'Week',    align: 'right' },
    { key: 'Owner',   label: 'Owner' },
    { key: 'Started', label: 'Status' },
  ]

  return (
    <div className='page'>
      <div className='page-title'>League History</div>
      <div className='page-subtitle'>
        {seasons.length} seasons · {data?.historyChampions?.length || 0} champions
      </div>

      {/* Champions */}
      <ChampionBanner champions={data?.historyChampions} />

      {/* All-time standings */}
      <AllTimeStandings data={data?.historyAllTime} />

      {/* Season selector */}
      <div className='card' style={{ marginBottom: '1.25rem' }}>
        <div className='card-header'><h3>Season Breakdown</h3><span>Click a season to view details</span></div>
        <div style={{ padding: '1rem', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {seasons.map(season => {
            const champ = data?.historyChampions?.find(c => c.Season === season)?.Champion
            return (
              <button
                key={season}
                onClick={() => setSelectedSeason(season)}
                style={{
                  padding: '12px 20px', borderRadius: '10px', cursor: 'pointer',
                  border: '1px solid var(--card-border)', background: 'var(--page-bg)',
                  textAlign: 'left', minWidth: '140px'
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{season}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>🏆 {champ || '—'}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Top 10s */}
      <div className='card' style={{ padding: '1.25rem' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1.25rem' }}>
          All-Time Records
        </div>

        <Top10Table
          title="🔥 Top 10 Highest Scoring Weeks"
          data={topWeeks}
          cols={weekCols}
        />

        <Top10Table
          title="⭐ Top 10 Player Games (All Positions)"
          data={playerGames.overall}
          cols={playerCols}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          {['QB', 'RB', 'WR', 'TE'].map(pos => (
            <Top10Table
              key={pos}
              title={`Top 10 ${pos} Games`}
              data={playerGames[pos]}
              cols={posCols}
            />
          ))}
        </div>
      </div>

      {/* Season modal */}
      {selectedSeason && (
        <SeasonModal
          season={selectedSeason}
          historyStandings={data?.historyStandings}
          champions={data?.historyChampions}
          data={data}
          onClose={() => setSelectedSeason(null)}
        />
      )}
    </div>
  )
}