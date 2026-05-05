import { useState } from 'react'

const OUTLOOK_BADGE = {
  'Contender':                    'badge-green',
  'Contender (needs production)': 'badge-green',
  'Window Contender':             'badge-orange',
  'Reload':                       'badge-blue',
  'Reload (sell vets for youth)': 'badge-blue',
  'Rebuild':                      'badge-red',
  'Rebuild (future value)':       'badge-red',
}

function TeamCard({ team }) {
  const badgeClass = OUTLOOK_BADGE[team.Outlook] || 'badge-blue'
  return (
    <div style={{
      flexShrink: 0, width: '160px', background: 'var(--card-bg)',
      border: '1px solid var(--card-border)', borderRadius: '10px', padding: '12px'
    }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        #{team['Value Rank']} Value
      </div>
      <div style={{
        fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
        margin: '3px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
      }}>
        {team.Owner}
      </div>
      <span className={`badge ${badgeClass}`}>{team.Outlook}</span>
      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {[
          ['Val%',  team['Value Share %'] + '%'],
          ['Prod%', team['Production Share %'] + '%'],
          ['C+F',   team['C+F Total']],
        ].map(([label, value]) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: '11px', color: 'var(--text-secondary)'
          }}>
            <span>{label}</span>
            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StandingsTable({ standings, teamOverview, owner }) {
  const [sortBy,  setSortBy]  = useState('avgPF')
  const [sortDir, setSortDir] = useState('desc')

  const valRankMap = {}
  teamOverview?.forEach(t => { valRankMap[t.Owner] = t['Value Rank'] })

  const merged = standings.map(s => ({
    ...s, valRank: valRankMap[s.owner] || '-'
  }))

  const sorted = [...merged].sort((a, b) => {
    const av = parseFloat(a[sortBy]) || 0
    const bv = parseFloat(b[sortBy]) || 0
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const handleSort = col => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const SortHeader = ({ col, label }) => (
    <th onClick={() => handleSort(col)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      {label} {sortBy === col ? (sortDir === 'desc' ? '↓' : '↑') : ''}
    </th>
  )

  return (
    <div className='card'>
      <div className='card-header'>
        <h3>League Standings</h3>
        <span>{new Date().getFullYear()} Regular Season · Weeks 1–14</span>
      </div>
      <div className='table-scroll'>
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <SortHeader col='wins'    label='Record' />
              <SortHeader col='avgPF'   label='Avg PF' />
              <SortHeader col='avgPA'   label='Avg PA' />
              <SortHeader col='valRank' label='Val Rank' />
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => (
              <tr key={s.owner} className={s.owner === owner ? 'my-row' : ''}>
                <td style={{ fontWeight: s.owner === owner ? 600 : 400 }}>{s.owner}</td>
                <td>{s.wins}–{s.losses}</td>
                <td>{s.avgPF}</td>
                <td>{s.avgPA}</td>
                <td>#{s.valRank}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PositionalRankings({ rosterGrades, label }) {
  const positions = ['QB', 'RB', 'WR', 'TE']
  const gradeKey  = label === 'KTC' ? 'Starter Val' : 'Grade'

  const ranked = positions.reduce((acc, pos) => {
    const sorted = [...(rosterGrades || [])].sort((a, b) =>
      parseFloat(b[`${pos} ${gradeKey}`] || 0) - parseFloat(a[`${pos} ${gradeKey}`] || 0)
    )
    acc[pos] = sorted.map((t, i) => ({ owner: t.Owner, rank: i + 1 }))
    return acc
  }, {})

  const owners = [...new Set(rosterGrades?.map(t => t.Owner) || [])]

  function getColor(rank) {
    if (rank === 1)  return { bg: '#9ae6b4', color: '#1a5436' }
    if (rank <= 3)   return { bg: '#90cdf4', color: '#1a3f5c' }
    if (rank <= 5)   return { bg: '#faf089', color: '#744210' }
    if (rank <= 7)   return { bg: '#f6ad55', color: '#652b19' }
    if (rank <= 9)   return { bg: '#fc8181', color: '#63171b' }
    return                  { bg: '#b794f4', color: '#322659' }
  }

  return (
    <div className='card'>
      <div className='card-header'>
        <h3>Positional Rankings — {label}</h3>
      </div>
      <div className='table-scroll'>
        <table>
          <thead>
            <tr>
              <th>Team</th>
              {positions.map(p => <th key={p}>{p}</th>)}
            </tr>
          </thead>
          <tbody>
            {owners.map(owner => (
              <tr key={owner}>
                <td style={{ fontWeight: 500 }}>{owner}</td>
                {positions.map(pos => {
                  const entry = ranked[pos]?.find(r => r.owner === owner)
                  const rank  = entry?.rank || '-'
                  const { bg, color } = typeof rank === 'number'
                    ? getColor(rank) : { bg: '', color: '' }
                  return (
                    <td key={pos} style={{
                      background: bg, color, fontWeight: 600, textAlign: 'center'
                    }}>
                      #{rank}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Home({ data, owner }) {
  if (!data) return null

  const sorted = [...(data.teamOverview || [])].sort(
    (a, b) => parseFloat(a['Value Rank']) - parseFloat(b['Value Rank'])
  )

  return (
    <div className='page'>
      <div className='page-title'>League Overview</div>
      <div className='page-subtitle'>
        2025 Season · 10 teams · Last updated {data.lastUpdated}
      </div>

      <div style={{
        display: 'flex', gap: '10px', overflowX: 'auto',
        marginBottom: '1.25rem', paddingBottom: '4px'
      }}>
        {sorted.map(t => <TeamCard key={t.Owner} team={t} />)}
      </div>

      <StandingsTable
        standings={data.standings || []}
        teamOverview={data.teamOverview || []}
        owner={owner}
      />

      <PositionalRankings rosterGrades={data.rosterGrades} label='KTC' />
      <PositionalRankings rosterGrades={data.rosterGrades} label='Combined' />
    </div>
  )
}