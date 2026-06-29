// Shared year-grouped pick card layout used by both Team Deep Dive and the
// league-wide Pick Portfolio page.

const TIER_BADGE_CLASS = {
  Early: 'badge-green',
  Mid:   'badge-yellow',
  Late:  'badge-red',
}

const ROUND_ORDINAL = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' }
const ROUND_WORD     = { 1: 'first',  2: 'second',  3: 'third',  4: 'fourth' }
const ROUND_WORD_PL  = { 1: 'firsts', 2: 'seconds', 3: 'thirds', 4: 'fourths' }

export function roundOrdinal(round) {
  const r = parseInt(round)
  return ROUND_ORDINAL[r] || `${r}th`
}

function roundWord(round, count) {
  const r = parseInt(round)
  const word = count === 1 ? ROUND_WORD[r] : ROUND_WORD_PL[r]
  return word || (count === 1 ? `${r}th` : `${r}ths`)
}

export function formatKtc(value) {
  const v = parseFloat(value) || 0
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`
  return Math.round(v).toLocaleString()
}

// Picks for the furthest synthetic year are generated per-slot (not per-trade),
// so they're deduped by name+current-owner only; real years dedupe by the full
// name+original+current triple (mirrors the logic already used on the league
// Pick Portfolio page).
export function dedupePicks(rawPicks) {
  const years = [...new Set((rawPicks || []).map(p => p.Year))].sort()
  const syntheticYear = years[years.length - 1]
  const seen = new Set()
  return (rawPicks || []).filter(p => {
    const key = p.Year === syntheticYear
      ? `${p['Pick Name']}|${p['Current Owner']}`
      : `${p['Pick Name']}|${p['Original Owner']}|${p['Current Owner']}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function PickCard({ pick, viewerOwner }) {
  const round     = parseInt(pick.Round)
  const isOwn     = pick['Original Owner'] === pick['Current Owner']
  const tierClass = TIER_BADGE_CLASS[pick.Tier] || 'badge-blue'

  const footerLeft = isOwn
    ? (viewerOwner ? 'Your original pick' : 'Own pick')
    : `From ${pick['Original Owner']}`

  return (
    <div style={{
      background: 'var(--pick-card-bg)',
      border: '1px solid var(--pick-card-border)',
      borderRadius: '10px',
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--green)', lineHeight: 1 }}>
          {roundOrdinal(round)}
        </div>
        <span className={`badge ${tierClass}`}>{pick.Tier}</span>
      </div>

      {!viewerOwner && (
        <div style={{
          fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)',
          marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {pick['Current Owner']}
        </div>
      )}

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginTop: viewerOwner ? '14px' : '8px',
      }}>
        <span style={{
          fontSize: '12px', color: 'var(--text-secondary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '8px',
        }}>
          {footerLeft}
        </span>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>
          {formatKtc(pick['KTC Value'])}
        </span>
      </div>
    </div>
  )
}

// ownedPicks    — picks rendered as cards (already filtered to the relevant team/ALL scope)
// sentPicks     — picks rendered as "Sent" badges; pass [] when there's no single-team perspective
// allRoundsForYear — every round present in the league's pick data for this year (drives the
//                    round summary pills, including zero counts) — never hardcode 1-4
// viewerOwner   — the team whose perspective this is ("Your original pick" framing); omit for
//                  the league-wide ALL view
export function PickYearGroup({ year, ownedPicks, sentPicks = [], allRoundsForYear, viewerOwner }) {
  const totalValue = ownedPicks.reduce((sum, p) => sum + (parseFloat(p['KTC Value']) || 0), 0)

  const roundCounts = {}
  ownedPicks.forEach(p => {
    const r = parseInt(p.Round)
    roundCounts[r] = (roundCounts[r] || 0) + 1
  })

  const breakdown = allRoundsForYear
    .filter(r => roundCounts[r] > 0)
    .map(r => `${roundCounts[r]} ${roundWord(r, roundCounts[r])}`)
    .join(' / ')

  return (
    <div style={{ marginBottom: '1.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>{year}</span>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {ownedPicks.length} pick{ownedPicks.length !== 1 ? 's' : ''}
          {breakdown && ` · ${breakdown}`}
          {' · '}{formatKtc(totalValue)} value
        </span>
      </div>

      {ownedPicks.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px',
        }}>
          {ownedPicks.map((p, i) => <PickCard key={i} pick={p} viewerOwner={viewerOwner} />)}
        </div>
      )}

      {viewerOwner && sentPicks.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
          {sentPicks.map((p, i) => (
            <span key={i} style={{
              display: 'inline-block', fontSize: '11px', fontWeight: 600,
              padding: '2px 9px', borderRadius: '99px',
              border: '1px solid var(--yellow)', color: 'var(--yellow)',
              textDecoration: 'line-through', whiteSpace: 'nowrap',
            }}>
              Sent {roundOrdinal(p.Round)}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
        {allRoundsForYear.map(r => (
          <span key={r} style={{
            display: 'inline-block', fontSize: '11px', fontWeight: 600,
            padding: '2px 9px', borderRadius: '99px',
            border: '1px solid var(--card-border)',
            color: roundCounts[r] ? 'var(--text-secondary)' : 'var(--text-muted)',
            opacity: roundCounts[r] ? 1 : 0.6,
          }}>
            {roundCounts[r] || 0}x {roundOrdinal(r)}
          </span>
        ))}
      </div>
    </div>
  )
}
