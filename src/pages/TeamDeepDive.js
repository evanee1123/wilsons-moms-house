import { useState } from 'react'

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

const OUTLOOK_BADGE = {
  'Contender':                    'badge-green',
  'Contender (needs production)': 'badge-green',
  'Window Contender':             'badge-orange',
  'Reload':                       'badge-blue',
  'Reload (sell vets for youth)': 'badge-blue',
  'Rebuild':                      'badge-red',
  'Rebuild (future value)':       'badge-red',
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
      {tier}
    </span>
  )
}

function RosterSection({ players, position }) {
  const posPlayers = players
    .filter(p => p.Position === position)
    .sort((a, b) => parseFloat(b['KTC Value']) - parseFloat(a['KTC Value']))

  if (posPlayers.length === 0) return null

  return (
    <div style={{ marginBottom: '1.25rem', overflow: 'visible' }}>
      <div style={{
        fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px'
      }}>
        {position}
      </div>
      <div className='table-scroll'>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px',
                           color: 'var(--text-muted)', borderBottom: '1px solid var(--card-border)' }}>
                Player
              </th>
              <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px',
                           color: 'var(--text-muted)', borderBottom: '1px solid var(--card-border)' }}>
                Tier
              </th>
              <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '11px',
                           color: 'var(--text-muted)', borderBottom: '1px solid var(--card-border)' }}>
                KTC
              </th>
              <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: '11px',
                           color: 'var(--text-muted)', borderBottom: '1px solid var(--card-border)',
                           whiteSpace: 'nowrap' }}>
                Combined <Tooltip text="Blends KTC market value (60%) with multi-year fantasy production (40%), normalized within each position. Higher = more valuable overall." />
              </th>
              <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: '11px',
                           color: 'var(--text-muted)', borderBottom: '1px solid var(--card-border)',
                           whiteSpace: 'nowrap' }}>
                Avg PPG <Tooltip text="Average fantasy points per game using the best 3 of the last 4 seasons, normalized within position. Protects against outlier injury seasons." />
              </th>
            </tr>
          </thead>
          <tbody>
            {posPlayers.map(p => (
              <tr key={p.Player} style={{
                background: p['On Taxi'] === 'True' ? 'rgba(246,224,94,0.1)' : 'transparent'
              }}>
                <td style={{ padding: '7px 10px', fontWeight: 500, color: 'var(--text-primary)',
                             borderBottom: '1px solid var(--card-border)' }}>
                  {p.Player}
                  {p['On Taxi'] === 'True' && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)',
                                   marginLeft: '6px' }}>TAXI</span>
                  )}
                </td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--card-border)' }}>
                  <TierBadge tier={p.Tier} />
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'right',
                             borderBottom: '1px solid var(--card-border)',
                             color: 'var(--text-primary)', fontWeight: 500 }}>
                  {parseInt(p['KTC Value']).toLocaleString()}
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'center',
                             borderBottom: '1px solid var(--card-border)',
                             color: 'var(--text-secondary)' }}>
                  {parseInt(p['Combined Score']).toLocaleString()}
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'center',
                             borderBottom: '1px solid var(--card-border)',
                             color: 'var(--text-secondary)' }}>
                  {parseFloat(p['Avg PPG'] || 0).toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PickPortfolioSection({ picks, teamOwner }) {
  const myPicks = picks
    .filter(p => p['Current Owner'] === teamOwner)
    .sort((a, b) => {
      if (a.Year !== b.Year) return a.Year - b.Year
      return a.Round - b.Round
    })

  const totalValue = myPicks.reduce((sum, p) => sum + parseFloat(p['KTC Value'] || 0), 0)
  const firstRound = myPicks.filter(p => p.Round === '1' || p.Round === 1)

  return (
    <div className='card'>
      <div className='card-header'>
        <h3>Pick Portfolio</h3>
        <span>{firstRound.length} first rounders · Total value: {totalValue.toLocaleString()}</span>
      </div>
      <div className='table-scroll'>
        <table>
          <thead>
            <tr>
              <th>Pick</th>
              <th>Round</th>
              <th>Tier</th>
              <th>Original Owner</th>
              <th style={{ textAlign: 'right' }}>KTC Value</th>
            </tr>
          </thead>
          <tbody>
            {myPicks.map((p, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{p['Pick Name']}</td>
                <td>
                  {p.Round === '1' || p.Round === 1 ? '1st' :
                   p.Round === '2' || p.Round === 2 ? '2nd' :
                   p.Round === '3' || p.Round === 3 ? '3rd' : '4th'}
                </td>
                <td>
                  <span className={
                    p.Tier === 'Early' ? 'badge badge-green' :
                    p.Tier === 'Mid'   ? 'badge badge-yellow' : 'badge badge-red'
                  }>{p.Tier}</span>
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>{p['Original Owner']}</td>
                <td style={{ textAlign: 'right', fontWeight: 500 }}>
                  {parseInt(p['KTC Value']).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DynastyHealth({ teamData }) {
  if (!teamData) return null

  const metrics = [
    { label: 'Value Share',      value: teamData['Value Share %'] + '%',      sub: `#${teamData['Value Rank']} in league` },
    { label: 'Production Share', value: teamData['Production Share %'] + '%', sub: `#${teamData['Production Rank']} in league` },
    { label: 'Value Gap',        value: (parseFloat(teamData['Gap']) > 0 ? '+' : '') + teamData['Gap'] + '%', sub: 'value vs production' },
    { label: 'C+F Total',        value: teamData['C+F Total'],                sub: 'target: 5–7' },
    { label: '2026 Firsts',      value: teamData['2026 1sts'],                sub: teamData['2026 Status'] },
    { label: '2027 Firsts',      value: teamData['2027 1sts'],                sub: teamData['2027 Status'] },
    { label: '2028 Firsts',      value: teamData['2028 1sts'],                sub: teamData['2028 Status'] },
    { label: 'Total Value',      value: parseInt(teamData['Total Value']).toLocaleString(), sub: 'players + picks' },
  ]

  return (
    <div className='card'>
      <div className='card-header'>
        <h3>Dynasty Health</h3>
        <span className={`badge ${OUTLOOK_BADGE[teamData.Outlook] || 'badge-blue'}`}>
          {teamData.Outlook}
        </span>
      </div>
      <div style={{ padding: '1rem', display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        {metrics.map(m => (
          <div key={m.label} style={{
            background: 'var(--page-bg)', borderRadius: '8px', padding: '10px 12px'
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              {m.label}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {m.value}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {m.sub}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PositionalGrades({ rosterGrades, teamOwner }) {
  const teamGrades = rosterGrades?.find(t => t.Owner === teamOwner)
  const allGrades  = rosterGrades || []

  if (!teamGrades) return null

  const positions = ['QB', 'RB', 'WR', 'TE']

  function getRank(pos) {
    const sorted = [...allGrades].sort(
      (a, b) => parseFloat(b[`${pos} Grade`]) - parseFloat(a[`${pos} Grade`])
    )
    return sorted.findIndex(t => t.Owner === teamOwner) + 1
  }

  function getBarColor(rank) {
    if (rank <= 2) return '#38a169'
    if (rank <= 4) return '#3182ce'
    if (rank <= 6) return '#d69e2e'
    if (rank <= 8) return '#dd6b20'
    return '#e53e3e'
  }

  const maxGrade = Math.max(...allGrades.flatMap(t =>
    positions.map(p => parseFloat(t[`${p} Grade`]) || 0)
  ))

  return (
    <div className='card'>
      <div className='card-header'>
        <h3>
          Positional Grades vs League
          <Tooltip text="Grade = 70% average starter value + 30% average bench value at each position, using combined score." />
        </h3>
      </div>
      <div style={{ padding: '1rem' }}>
        {positions.map(pos => {
          const grade     = parseFloat(teamGrades[`${pos} Grade`]) || 0
          const rank      = getRank(pos)
          const pct       = maxGrade > 0 ? (grade / maxGrade) * 100 : 0
          const color     = getBarColor(rank)
          const topPlayer = teamGrades[`${pos} Top Player`]

          return (
            <div key={pos} style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                            alignItems: 'flex-start', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700,
                                 color: 'var(--text-primary)', width: '28px',
                                 paddingTop: '2px' }}>{pos}</span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500,
                                  color: 'var(--text-primary)' }}>{topPlayer}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)',
                                  marginTop: '1px' }}>Top player</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)',
                                  fontWeight: 500 }}>
                      {grade.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)',
                                  marginTop: '1px' }}>Position grade</div>
                  </div>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, color: '#fff',
                    background: color, padding: '2px 7px', borderRadius: '99px',
                    marginTop: '2px'
                  }}>
                    #{rank}
                  </span>
                </div>
              </div>
              <div style={{ height: '8px', background: 'var(--card-border)',
                            borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct}%`,
                  background: color, borderRadius: '99px',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TradeTargets({ tradeTargets, owner, selectedOwner }) {
  return null

  /*
  if (selectedOwner !== owner || !owner) return null

  const buyLines  = []
  const sellLines = []
  let   section   = null

  tradeTargets?.forEach(row => {
    if (row.Player === 'BUY TARGETS') {
      section = 'buy'
      return
    }
    if (row.Player === 'SELL CANDIDATES') {
      section = row.Owner === owner ? 'sell' : 'other'
      return
    }
    if (!row.Player || !row['KTC Value']) return
    if (section === 'buy')  buyLines.push(row)
    if (section === 'sell') sellLines.push(row)
  })

  return (
    <>
      <div className='card'>
        <div className='card-header'>
          <h3>Top Buy Targets</h3>
          <span>Based on your positional needs</span>
        </div>
        <div className='table-scroll'>
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Position</th>
                <th>Tier</th>
                <th>Current Owner</th>
                <th style={{ textAlign: 'right' }}>KTC Value</th>
                <th style={{ textAlign: 'right' }}>Buy Score</th>
              </tr>
            </thead>
            <tbody>
              {buyLines.slice(0, 15).map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{p.Player}</td>
                  <td>{p.Position}</td>
                  <td><TierBadge tier={p.Tier} /></td>
                  <td style={{ color: 'var(--text-secondary)' }}>{p['Current Owner']}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>
                    {parseInt(p['KTC Value']).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {parseFloat(p['Buy Score']).toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className='card'>
        <div className='card-header'>
          <h3>Sell Candidates</h3>
          <span>Players you might consider moving</span>
        </div>
        <div className='table-scroll'>
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Position</th>
                <th>Tier</th>
                <th style={{ textAlign: 'right' }}>KTC Value</th>
                <th style={{ textAlign: 'right' }}>Sell Score</th>
              </tr>
            </thead>
            <tbody>
              {sellLines.slice(0, 15).map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{p.Player}</td>
                  <td>{p.Position}</td>
                  <td><TierBadge tier={p.Tier} /></td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>
                    {parseInt(p['KTC Value']).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {parseFloat(p['Sell Score']).toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
  */
}

export default function TeamDeepDive({ data, owner }) {
  const owners = [...new Set(data?.leagueRosters?.map(p => p.Owner) || [])]
  const [selectedTeam, setSelectedTeam] = useState('')

  const teamOwner    = selectedTeam || owner || owners[0]
  const teamPlayers  = data?.leagueRosters?.filter(p => p.Owner === teamOwner) || []
  const teamOverview = data?.teamOverview?.find(t => t.Owner === teamOwner)
  const standings    = data?.standings?.find(s => s.owner === teamOwner)

  return (
    <div className='page'>
      <div style={{ display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <div className='page-title'>{teamOwner || 'Select a team'}</div>
          {standings && (
            <div className='page-subtitle'>
              {standings.wins}–{standings.losses} · {standings.avgPF} avg PF
            </div>
          )}
        </div>
        <select
          value={selectedTeam}
          onChange={e => setSelectedTeam(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
                   border: '1px solid var(--card-border)', background: 'var(--card-bg)',
                   color: 'var(--text-primary)', cursor: 'pointer' }}
        >
          <option value=''>Select team...</option>
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px',
                    gap: '1.25rem', alignItems: 'start' }}>
        <div>
          <div className='card' style={{ padding: '1rem', overflow: 'visible' }}>
            {['QB', 'RB', 'WR', 'TE'].map(pos => (
              <RosterSection key={pos} players={teamPlayers} position={pos} />
            ))}
          </div>
        </div>

        <div>
          <div className='card'>
            <div className='card-header'><h3>Schedule</h3></div>
            <div style={{ padding: '1rem', fontSize: '13px',
                          color: 'var(--text-secondary)', textAlign: 'center' }}>
              Season hasn't started yet
            </div>
          </div>
        </div>
      </div>

      <PickPortfolioSection picks={data?.pickPortfolio || []} teamOwner={teamOwner} />
      <DynastyHealth teamData={teamOverview} />
      <PositionalGrades rosterGrades={data?.rosterGrades} teamOwner={teamOwner} />
      <TradeTargets
        tradeTargets={data?.tradeTargets}
        owner={owner}
        selectedOwner={teamOwner}
      />
    </div>
  )
}