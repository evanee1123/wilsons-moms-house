// Shared year-grouped pick card layout used by both Team Deep Dive and the
// league-wide Pick Portfolio page.

const TIER_BADGE_CLASS = {
  Early: 'badge-green',
  Mid:   'badge-yellow',
  Late:  'badge-red',
}

// Accent color per round — shown on the big round number and as a subtle
// top-border on the card. Round 3 keeps the original green.
const ROUND_ACCENT = {
  1: 'var(--amber)',
  2: 'var(--blue)',
  3: 'var(--green)',
  4: 'var(--purple)',
}

// 10 visually distinct colors for league-wide ALL-mode team accenting, cycled
// by index so any number of owners gets a stable, repeatable assignment.
const TEAM_COLOR_PALETTE = [
  '#F87171', '#FB923C', '#FBBF24', '#A3E635', '#34D399',
  '#22D3EE', '#60A5FA', '#818CF8', '#C084FC', '#F472B6',
]

const ROUND_ORDINAL = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' }
const ROUND_WORD     = { 1: 'first',  2: 'second',  3: 'third',  4: 'fourth' }
const ROUND_WORD_PL  = { 1: 'firsts', 2: 'seconds', 3: 'thirds', 4: 'fourths' }

export function roundOrdinal(round) {
  const r = parseInt(round)
  return ROUND_ORDINAL[r] || `${r}th`
}

function roundAccent(round) {
  return ROUND_ACCENT[parseInt(round)] || 'var(--green)'
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

// Assigns each owner a stable color from TEAM_COLOR_PALETTE, sorted
// alphabetically so the mapping doesn't shift as filters change.
export function buildTeamColorMap(owners) {
  const sorted = [...new Set(owners || [])].sort()
  const map = {}
  sorted.forEach((owner, i) => {
    map[owner] = TEAM_COLOR_PALETTE[i % TEAM_COLOR_PALETTE.length]
  })
  return map
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

function PickCard({ pick, viewerOwner, compact, teamColor }) {
  const round     = parseInt(pick.Round)
  const accent    = roundAccent(round)
  const isOwn     = pick['Original Owner'] === pick['Current Owner']
  const tierClass = TIER_BADGE_CLASS[pick.Tier] || 'badge-blue'

  const footerLeft = isOwn
    ? (viewerOwner ? 'Your original pick' : 'Own pick')
    : `From ${pick['Original Owner']}`

  // ALL mode (teamColor set): top border carries the team color, and the
  // card background gets a subtle team-color tint so cards group visually
  // by team. Round color is then conveyed only through the round number
  // text below. Team-filtered / Team Deep Dive (no teamColor): top border
  // stays the round accent, as before.
  const background = teamColor
    ? `linear-gradient(${teamColor}1A, ${teamColor}1A), var(--pick-card-bg)`
    : 'var(--pick-card-bg)'

  return (
    <div style={{
      background,
      border: '1px solid var(--pick-card-border)',
      borderTop: `3px solid ${teamColor || accent}`,
      borderRadius: '10px',
      padding: compact ? '8px 10px' : '12px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: compact ? '16px' : '22px', fontWeight: 800, color: accent, lineHeight: 1 }}>
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
        marginTop: viewerOwner ? (compact ? '10px' : '14px') : (compact ? '5px' : '8px'),
      }}>
        <span style={{
          fontSize: compact ? '11px' : '12px', color: 'var(--text-secondary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '8px',
        }}>
          {footerLeft}
        </span>
        <span style={{ fontSize: compact ? '12px' : '13px', fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>
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
// compact       — league-wide ALL view only: smaller cards, tighter grid, more columns
// teamColors    — league-wide ALL view only: { owner: color } map for the left-border accent
export function PickYearGroup({ year, ownedPicks, sentPicks = [], allRoundsForYear, viewerOwner, compact = false, teamColors }) {
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
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(${compact ? 140 : 200}px, 1fr))`,
          gap: compact ? '8px' : '10px',
        }}>
          {ownedPicks.map((p, i) => (
            <PickCard
              key={i}
              pick={p}
              viewerOwner={viewerOwner}
              compact={compact}
              teamColor={teamColors ? teamColors[p['Current Owner']] : undefined}
            />
          ))}
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
            <span style={{ color: roundCounts[r] ? roundAccent(r) : 'inherit' }}>{roundCounts[r] || 0}x</span> {roundOrdinal(r)}
          </span>
        ))}
      </div>
    </div>
  )
}
