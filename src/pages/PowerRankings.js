import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, LabelList,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'

const OUTLOOK_BADGE = {
  'Contender':                    'badge-green',
  'Contender (needs production)': 'badge-green',
  'Window Contender':             'badge-orange',
  'Reload':                       'badge-blue',
  'Reload (sell vets for youth)': 'badge-blue',
  'Rebuild':                      'badge-red',
  'Rebuild (future value)':       'badge-red',
}

// Bar chart coloring follows its own outlook→color mapping (green/blue/amber/red)
// rather than reusing the badge classes above.
const OUTLOOK_BAR_COLOR = {
  'Contender':                    '#38a169',
  'Contender (needs production)': '#38a169',
  'Window Contender':             '#3182ce',
  'Reload':                       '#d69e2e',
  'Reload (sell vets for youth)': '#d69e2e',
  'Rebuild':                      '#e53e3e',
  'Rebuild (future value)':       '#e53e3e',
}

function PowerScoreTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const t = payload[0].payload
  return (
    <div style={{
      background: 'var(--card-bg)', border: '1px solid var(--card-border)',
      borderRadius: '8px', padding: '8px 10px', fontSize: '12px',
    }}>
      <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '2px' }}>
        #{t.rank} {t.team_name}
      </div>
      <div style={{ color: 'var(--text-secondary)' }}>{t.outlook}</div>
      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
        Power Score: {t.power_score}
      </div>
    </div>
  )
}

function PowerScoreYAxisTick({ x, y, payload, chartData }) {
  const entry = chartData.find(d => d.label === payload.value)
  const isMe  = entry?.isMe
  return (
    <text
      x={x} y={y} dy={4} textAnchor='end'
      fontSize={12}
      fontWeight={isMe ? 700 : 400}
      fill={isMe ? 'var(--text-primary)' : 'var(--text-secondary)'}
    >
      {payload.value}
    </text>
  )
}

function PowerScoreChart({ rankings, myOwner }) {
  const chartData = rankings.map(team => ({
    ...team,
    label: `#${team.rank}  ${team.team_name}`,
    isMe:  myOwner != null && team.owner === myOwner,
  }))

  return (
    <div className='card'>
      <div className='card-header'>
        <div>
          <h3>Power Rankings</h3>
          <span>AI-generated power score · 0–100 scale</span>
        </div>
      </div>
      <div style={{ padding: '1rem' }}>
        <ResponsiveContainer width='100%' height={Math.max(280, chartData.length * 36)}>
          <BarChart
            data={chartData} layout='vertical'
            margin={{ top: 4, right: 32, bottom: 0, left: 8 }}
          >
            <CartesianGrid stroke='var(--card-border)' horizontal={false} />
            <XAxis type='number' domain={[0, 100]} hide />
            <YAxis
              type='category' dataKey='label' width={180}
              axisLine={false} tickLine={false}
              tick={props => <PowerScoreYAxisTick {...props} chartData={chartData} />}
            />
            <RechartsTooltip content={<PowerScoreTooltip />} cursor={{ fill: 'var(--card-border)', opacity: 0.3 }} />
            <Bar dataKey='power_score' radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {chartData.map(entry => (
                <Cell
                  key={entry.owner}
                  fill={OUTLOOK_BAR_COLOR[entry.outlook] || '#94a3b8'}
                  fillOpacity={entry.isMe ? 1 : 0.65}
                />
              ))}
              <LabelList
                dataKey='power_score' position='right'
                style={{ fontSize: 12, fontWeight: 600, fill: 'var(--text-primary)' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function rankColor(rank) {
  if (rank === 1)  return '#d69e2e'
  if (rank <= 3)   return '#38a169'
  if (rank >= 9)   return '#e53e3e'
  if (rank >= 7)   return '#dd6b20'
  return 'var(--text-secondary)'
}

function formatGeneratedAt(ts) {
  if (!ts) return null
  try {
    return new Date(ts).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })
  } catch {
    return null
  }
}

export default function PowerRankings({ data }) {
  const { userProfile, viewAsOwner } = useAuth()
  const myOwner = viewAsOwner || userProfile?.rosterOwnerName || null

  const rankings    = (data?.powerRankings?.rankings || []).slice().sort((a, b) => a.rank - b.rank)
  const generatedAt = formatGeneratedAt(data?.powerRankings?.generated_at)

  return (
    <div className='page'>
      <div className='page-title'>Power Rankings</div>
      <div className='page-subtitle'>
        AI-generated dynasty power rankings
        {generatedAt ? ` · Last updated ${generatedAt}` : ' · Not yet generated'}
      </div>

      {rankings.length > 0 && rankings.every(t => typeof t.power_score === 'number') && (
        <div style={{ marginBottom: '1.25rem' }}>
          <PowerScoreChart rankings={rankings} myOwner={myOwner} />
        </div>
      )}

      {rankings.length === 0 ? (
        <div className='card' style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
          Power rankings haven't been generated yet. Run the <code>power_rankings</code> notebook or trigger the GitHub Actions workflow.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {rankings.map(team => {
            const badgeClass = OUTLOOK_BADGE[team.outlook] || 'badge-blue'
            const color      = rankColor(team.rank)

            return (
              <div key={team.rank} className='card' style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  <div style={{
                    fontSize: '28px', fontWeight: 800, color,
                    minWidth: '44px', lineHeight: 1.1, paddingTop: '3px', textAlign: 'center',
                  }}>
                    #{team.rank}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {team.team_name}
                      </span>
                      {team.team_name !== team.owner && (
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                          ({team.owner})
                        </span>
                      )}
                      <span className={`badge ${badgeClass}`}>{team.outlook}</span>
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                      {team.blurb}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: '1.25rem', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
        Rankings generated by Claude AI every Tuesday based on current dynasty values, outlook classifications, and roster composition. For entertainment purposes.
      </div>
    </div>
  )
}
