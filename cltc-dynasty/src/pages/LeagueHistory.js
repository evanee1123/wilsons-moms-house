import { useState, useMemo } from 'react'

// ─── Layout constants ──────────────────────────────────────────────
const CARD_W   = 210
const ROW_H    = 36
const CARD_H   = ROW_H * 2 + 1   // 73px  (two rows + divider)
const COL_W    = CARD_W + 56      // horizontal stride between columns
const SLOT_GAP = 20               // vertical gap between cards in same column

// ─── Helpers ──────────────────────────────────────────────────────
function rowColor(isWinner) {
  return isWinner ? 'rgba(72,187,120,0.13)' : 'transparent'
}
function rowTextColor(isWinner, hasOwner) {
  if (isWinner)  return '#48bb78'
  if (!hasOwner) return 'var(--text-muted)'
  return 'var(--text-secondary)'
}

// ─── Single matchup card (absolutely positioned) ───────────────────
function MatchupCard({ x, y, t1, t2, win, pts1, pts2, isByeSlot, isChamp }) {
  const w1 = win && t1 === win
  const w2 = win && t2 === win

  return (
    <div style={{ position: 'absolute', left: x, top: y, width: CARD_W }}>
      {isChamp && (
        <div style={{
          fontSize: 10, fontWeight: 700, color: '#d69e2e', textAlign: 'center',
          marginBottom: 4, letterSpacing: '0.5px', textTransform: 'uppercase'
        }}>🏆 Championship</div>
      )}
      <div style={{
        border: '1px solid var(--card-border)', borderRadius: 8,
        overflow: 'hidden', background: 'var(--card-bg)',
      }}>
        {/* Row 1 */}
        <div style={{
          height: ROW_H, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 10px', background: rowColor(w1),
          borderBottom: '1px solid var(--card-border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
            {w1 && <span style={{ fontSize: 9, color: '#48bb78', flexShrink: 0 }}>✓</span>}
            <span style={{
              fontSize: 12, fontWeight: w1 ? 700 : 400,
              color: rowTextColor(w1, !!t1),
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>{t1 || 'TBD'}</span>
          </div>
          {pts1 && <span style={{ fontSize: 12, fontWeight: w1 ? 700 : 400, color: rowTextColor(w1, true), marginLeft: 6, flexShrink: 0 }}>{pts1}</span>}
        </div>
        {/* Row 2 */}
        <div style={{
          height: ROW_H, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 10px', background: rowColor(w2)
        }}>
          {isByeSlot
            ? <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>BYE</span>
            : <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
                  {w2 && <span style={{ fontSize: 9, color: '#48bb78', flexShrink: 0 }}>✓</span>}
                  <span style={{
                    fontSize: 12, fontWeight: w2 ? 700 : 400,
                    color: rowTextColor(w2, !!t2),
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>{t2 || 'TBD'}</span>
                </div>
                {pts2 && <span style={{ fontSize: 12, fontWeight: w2 ? 700 : 400, color: rowTextColor(w2, true), marginLeft: 6, flexShrink: 0 }}>{pts2}</span>}
              </>
          }
        </div>
      </div>
    </div>
  )
}

// ─── Bracket for one section (winners or losers) ───────────────────
function BracketSection({ title, matchupsByRound, scoreLookup, colOffset = 0, roundLabels }) {
  if (!matchupsByRound || Object.keys(matchupsByRound).length === 0) return null

  const rounds     = Object.keys(matchupsByRound).map(Number).sort((a, b) => a - b)
  const numRounds  = rounds.length
  const lastRound  = rounds[numRounds - 1]

  // ── Step 1: assign Y positions working forwards from round 1 ──────
  const cardY = {}   // key = `r${round}_m${match}` → top-Y

  // Round 1: stack cards evenly
  const r1 = rounds[0]
  matchupsByRound[r1].forEach((m, mi) => {
    cardY[`r${r1}_m${m.Match}`] = mi * (CARD_H + SLOT_GAP)
  })

  // Each subsequent round: center each card between its two feeders
  for (let ri = 0; ri < numRounds - 1; ri++) {
    const r     = rounds[ri]
    const rNext = rounds[ri + 1]

    matchupsByRound[rNext]?.forEach(nm => {
      // Find the two feeder cards from current round
      const feeders = matchupsByRound[r].filter(m =>
        m.Win_Owner === nm.T1_Owner || m.Win_Owner === nm.T2_Owner ||
        (m.T1_Owner === nm.T1_Owner && !m.T2_Owner) ||
        (m.T1_Owner === nm.T2_Owner && !m.T2_Owner)
      )

      if (feeders.length >= 2) {
        const y1 = cardY[`r${r}_m${feeders[0].Match}`] ?? 0
        const y2 = cardY[`r${r}_m${feeders[1].Match}`] ?? 0
        const mid1 = y1 + CARD_H / 2
        const mid2 = y2 + CARD_H / 2
        cardY[`r${rNext}_m${nm.Match}`] = (mid1 + mid2) / 2 - CARD_H / 2
      } else if (feeders.length === 1) {
        cardY[`r${rNext}_m${nm.Match}`] = cardY[`r${r}_m${feeders[0].Match}`] ?? 0
      } else {
        const existing = Object.keys(cardY).filter(k => k.startsWith(`r${rNext}_`)).length
        cardY[`r${rNext}_m${nm.Match}`] = existing * (CARD_H + SLOT_GAP)
      }
    })
  }

  // ── Step 2: compute canvas dimensions ─────────────────────────────
  const allY    = Object.values(cardY)
  const canvasH = Math.max(...allY) + CARD_H + 40
  const canvasW = numRounds * COL_W - (COL_W - CARD_W) + 10

  // ── Step 3: SVG connector paths ────────────────────────────────────
  const paths = []
  for (let ri = 0; ri < numRounds - 1; ri++) {
    const r     = rounds[ri]
    const rNext = rounds[ri + 1]
    const srcX  = (ri + colOffset) * COL_W + CARD_W
    const dstX  = (ri + 1 + colOffset) * COL_W
    const midX  = srcX + (dstX - srcX) / 2

    matchupsByRound[rNext]?.forEach(nm => {
      const dstY  = cardY[`r${rNext}_m${nm.Match}`] ?? 0
      const dstT1Y = dstY + ROW_H / 2
      const dstT2Y = dstY + ROW_H + 1 + ROW_H / 2

      // Find feeder cards for T1 and T2
      ;[
        { owner: nm.T1_Owner, dstRowY: dstT1Y },
        { owner: nm.T2_Owner, dstRowY: dstT2Y },
      ].forEach(({ owner, dstRowY }) => {
        if (!owner) return
        // Find which r card has this owner as winner (or bye team)
        const srcCard = matchupsByRound[r]?.find(sm =>
          sm.Win_Owner === owner || sm.T1_Owner === owner
        )
        if (!srcCard) return
        const srcCardY   = cardY[`r${r}_m${srcCard.Match}`] ?? 0
        const isByeOwner = srcCard.T1_Owner === owner && !srcCard.T2_Owner
        const srcRowY    = isByeOwner
          ? srcCardY + ROW_H / 2
          : srcCard.Win_Owner === owner
            ? srcCardY + (srcCard.T1_Owner === owner ? ROW_H / 2 : ROW_H + 1 + ROW_H / 2)
            : srcCardY + ROW_H / 2

        paths.push(`M ${srcX} ${srcRowY} H ${midX} V ${dstRowY} H ${dstX}`)
      })
    })
  }

  return (
    <div style={{ marginBottom: '2rem' }}>
      {title && (
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
          {title}
        </div>
      )}

      {/* Column headers */}
      <div style={{ display: 'flex', marginBottom: 8 }}>
        {rounds.map((r, i) => (
          <div key={r} style={{ width: COL_W, fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {roundLabels?.[r] || `Round ${r}`}
          </div>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ position: 'relative', width: canvasW, height: canvasH }}>
          <svg style={{ position: 'absolute', inset: 0, width: canvasW, height: canvasH, pointerEvents: 'none' }}>
            {paths.map((d, i) => (
              <path key={i} d={d} fill='none' stroke='var(--card-border)' strokeWidth={1.5} />
            ))}
          </svg>

          {rounds.map((r, ri) => (
            matchupsByRound[r].map(m => {
              const y      = cardY[`r${r}_m${m.Match}`] ?? 0
              const x      = ri * COL_W
              const ptsKey = String(r)
              const pts1   = scoreLookup?.[m.T1_Owner]?.[ptsKey] || null
              const pts2   = scoreLookup?.[m.T2_Owner]?.[ptsKey] || null
              const isChamp = r === lastRound && matchupsByRound[lastRound].length > 1
                ? matchupsByRound[lastRound].indexOf(m) === 0
                : r === lastRound

              return (
                <MatchupCard
                  key={`r${r}_m${m.Match}`}
                  x={x} y={y}
                  t1={m.T1_Owner} t2={m.T2_Owner}
                  win={m.Win_Owner}
                  pts1={pts1} pts2={pts2}
                  isByeSlot={!m.T2_Owner}
                  isChamp={isChamp && r === lastRound && matchupsByRound[lastRound].indexOf(m) === 0}
                />
              )
            })
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main PlayoffBracket component ────────────────────────────────
function PlayoffBracket({ season, brackets }) {
  const seasonBrackets = useMemo(
    () => brackets?.filter(b => b.Season === season) || [],
    [brackets, season]
  )
  if (seasonBrackets.length === 0) return null

  const winners = seasonBrackets.filter(b => b.Type === 'Winners')
  const losers  = seasonBrackets.filter(b => b.Type === 'Losers')
  const scores  = seasonBrackets.filter(b => b.Type === 'Score')

  // Score lookup: owner → round → points
  const scoreLookup = {}
  scores.forEach(s => {
    const owner = s.T1_Owner
    const round = String(s.Round)
    if (!owner) return
    if (!scoreLookup[owner]) scoreLookup[owner] = {}
    const prev = parseFloat(scoreLookup[owner][round] || 0)
    const next = parseFloat(s.Points || 0)
    if (next > prev) scoreLookup[owner][round] = next.toFixed(2)
  })

  // Group by round — add bye entries for winners bracket
  const winByRound = {}
  winners.forEach(m => {
    const r = String(m.Round)
    if (!winByRound[r]) winByRound[r] = []
    winByRound[r].push({ ...m, Match: String(m.Match) })
  })

  // Detect bye teams: appear in round 2 but not round 1
  const r1Teams = new Set()
  ;(winByRound['1'] || []).forEach(m => {
    if (m.T1_Owner) r1Teams.add(m.T1_Owner)
    if (m.T2_Owner) r1Teams.add(m.T2_Owner)
  })
  const r2Teams = new Set()
  ;(winByRound['2'] || []).forEach(m => {
    if (m.T1_Owner) r2Teams.add(m.T1_Owner)
    if (m.T2_Owner) r2Teams.add(m.T2_Owner)
  })
  const byeTeams = [...r2Teams].filter(t => !r1Teams.has(t))

  // Add bye cards to round 1
  byeTeams.forEach((owner, i) => {
    if (!winByRound['1']) winByRound['1'] = []
    winByRound['1'].push({
      Match:     `bye_${i}`,
      Round:     '1',
      T1_Owner:  owner,
      T2_Owner:  null,
      Win_Owner: owner,
      Los_Owner: null,
    })
  })

  // Sort round 1 so byes and matchups interleave nicely
  // Order: bye, match, bye, match
  if (winByRound['1']) {
    const byeCards   = winByRound['1'].filter(m => !m.T2_Owner)
    const realCards  = winByRound['1'].filter(m => !!m.T2_Owner)
    const interleaved = []
    const maxLen = Math.max(byeCards.length, realCards.length)
    for (let i = 0; i < maxLen; i++) {
      if (i < byeCards.length)  interleaved.push(byeCards[i])
      if (i < realCards.length) interleaved.push(realCards[i])
    }
    winByRound['1'] = interleaved
  }

  const losByRound = {}
  losers.forEach(m => {
    const r = String(m.Round)
    if (!losByRound[r]) losByRound[r] = []
    losByRound[r].push({ ...m, Match: String(m.Match) })
  })

  const numWinRounds = Math.max(...Object.keys(winByRound).map(Number))
  const winRoundLabels = {
    1: 'Week 15',
    2: numWinRounds >= 3 ? 'Week 16 — Semifinals' : 'Week 16 — Championship',
    3: 'Week 17',
  }
  // Split last round into championship (match 0) and 3rd place (match 1)
  const lastRoundKey    = String(numWinRounds)
  const lastRoundAll    = winByRound[lastRoundKey] || []
  const champMatch      = lastRoundAll[0]
  const thirdPlaceMatch = lastRoundAll[1]

  // Only keep round 2 matchups involving a bye team (true semifinal games)
  const byeOwners = new Set(byeTeams)

  const winByRoundChamp = {}
  Object.entries(winByRound).forEach(([r, ms]) => {
    if (String(r) === lastRoundKey) {
      winByRoundChamp[r] = champMatch ? [champMatch] : []
    } else if (String(r) === '2') {
      winByRoundChamp[r] = ms.filter(m =>
        byeOwners.has(m.T1_Owner) || byeOwners.has(m.T2_Owner)
      )
    } else {
      winByRoundChamp[r] = ms
    }
  })

  const winByRound3rd = {}
  if (thirdPlaceMatch) {
    Object.entries(winByRound).forEach(([r, ms]) => {
      winByRound3rd[r] = String(r) === lastRoundKey ? [thirdPlaceMatch] : ms
    })
  }

  return (
    <div>
      <BracketSection
        title='Playoffs'
        matchupsByRound={winByRoundChamp}
        scoreLookup={scoreLookup}
        roundLabels={winRoundLabels}
      />
    </div>
  )
}

// ─── Season modal ──────────────────────────────────────────────────
function SeasonModal({ season, historyStandings, champions, historyBrackets, onClose }) {
  const seasonStandings = historyStandings?.filter(r => r.Season === season) || []
  const champion        = champions?.find(c => c.Season === season)?.Champion || '—'

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--card-bg)', borderRadius: 12, width: '100%',
        maxWidth: 1000, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)', border: '1px solid var(--card-border)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--card-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 10
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{season} Season</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              🏆 Champion: <span style={{ fontWeight: 600, color: '#d69e2e' }}>{champion}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Standings */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
              Regular Season Standings
            </div>
            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--card-border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--page-bg)' }}>
                    {['#','Owner','W','L','PF','PA','PPG','Max PF','Best'].map(h => (
                      <th key={h} style={{
                        padding: '8px 10px', textAlign: h === 'Owner' || h === '#' ? 'left' : 'right',
                        fontWeight: 600, color: 'var(--text-muted)', fontSize: 11,
                        borderBottom: '1px solid var(--card-border)', whiteSpace: 'nowrap'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {seasonStandings.map((r, i) => {
                    const isChamp = r.Champion === 'TRUE' || r.Champion === true
                    return (
                      <tr key={r.Owner} style={{
                        background: isChamp ? 'rgba(246,224,94,0.08)' : i % 2 === 0 ? 'transparent' : 'var(--page-bg)',
                        borderBottom: '1px solid var(--card-border)'
                      }}>
                        <td style={{ padding: '7px 10px', color: 'var(--text-muted)' }}>{r.Rank}</td>
                        <td style={{ padding: '7px 10px', fontWeight: 500 }}>{r.Owner} {isChamp && '🏆'}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.Wins}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.Losses}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{parseFloat(r.PF).toFixed(2)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{parseFloat(r.PA).toFixed(2)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.PPG}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{parseFloat(r['Max PF']).toFixed(2)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r['Best Score']}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bracket */}
          <PlayoffBracket season={season} brackets={historyBrackets} />
        </div>
      </div>
    </div>
  )
}

// ─── Top 10 table ──────────────────────────────────────────────────
function Top10Table({ title, data, cols }) {
  if (!data || data.length === 0) return null
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>{title}</div>
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--card-border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--page-bg)' }}>
              <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, borderBottom: '1px solid var(--card-border)' }}>#</th>
              {cols.map(c => (
                <th key={c.key} style={{
                  padding: '7px 10px', textAlign: c.align || 'left',
                  fontWeight: 600, color: 'var(--text-muted)', fontSize: 11,
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

// ─── Champion banner ───────────────────────────────────────────────
function ChampionBanner({ champions }) {
  if (!champions || champions.length === 0) return null
  const sorted = [...champions].sort((a, b) => parseInt(b.Season) - parseInt(a.Season))
  return (
    <div className='card' style={{ marginBottom: '1.25rem' }}>
      <div className='card-header'><h3>🏆 Champions</h3></div>
      <div style={{ display: 'flex', gap: 12, padding: '1rem', flexWrap: 'wrap' }}>
        {sorted.map(c => (
          <div key={c.Season} style={{
            padding: '12px 16px', borderRadius: 10, textAlign: 'center',
            background: 'linear-gradient(135deg, #f6e05e22, #f6ad5522)',
            border: '1px solid #f6e05e66', minWidth: 120
          }}>
            <div style={{ fontSize: 24 }}>🏆</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>{c.Champion}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{c.Season} Season</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── All-time standings ────────────────────────────────────────────
function AllTimeStandings({ data }) {
  if (!data || data.length === 0) return null
  return (
    <div className='card' style={{ marginBottom: '1.25rem' }}>
      <div className='card-header'><h3>All-Time Standings</h3></div>
      <div className='table-scroll'>
        <table>
          <thead>
            <tr>
              <th>#</th><th>Owner</th>
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
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.Rank || i + 1}</td>
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

// ─── Main page ─────────────────────────────────────────────────────
export default function LeagueHistory({ data }) {
  const [selectedSeason, setSelectedSeason] = useState(null)

  const seasons = useMemo(() => {
    const s = [...new Set(data?.historyStandings?.map(r => r.Season) || [])]
    return s.sort((a, b) => parseInt(b) - parseInt(a))
  }, [data])

  const playerGames = useMemo(() => {
    const all = data?.historyPlayerGames || []
    return {
      overall: all.filter(r => r.Category === 'Overall'),
      QB: all.filter(r => r.Category === 'QB'),
      RB: all.filter(r => r.Category === 'RB'),
      WR: all.filter(r => r.Category === 'WR'),
      TE: all.filter(r => r.Category === 'TE'),
    }
  }, [data])

  const weekCols = [
    { key: 'Owner', label: 'Owner', highlight: true },
    { key: 'Points', label: 'Points', align: 'right', highlight: true },
    { key: 'Week', label: 'Week', align: 'right' },
  ]
  const playerCols = [
    { key: 'Player', label: 'Player', highlight: true },
    { key: 'Position', label: 'Pos' },
    { key: 'Points', label: 'Points', align: 'right', highlight: true },
    { key: 'Week', label: 'Week', align: 'right' },
    { key: 'Owner', label: 'Owner' },
    { key: 'Started', label: 'Status' },
  ]
  const posCols = [
    { key: 'Player', label: 'Player', highlight: true },
    { key: 'Points', label: 'Points', align: 'right', highlight: true },
    { key: 'Week', label: 'Week', align: 'right' },
    { key: 'Owner', label: 'Owner' },
    { key: 'Started', label: 'Status' },
  ]

  return (
    <div className='page'>
      <div className='page-title'>League History</div>
      <div className='page-subtitle'>
        {seasons.length} seasons · {data?.historyChampions?.length || 0} champions
      </div>

      <ChampionBanner champions={data?.historyChampions} />
      <AllTimeStandings data={data?.historyAllTime} />

      <div className='card' style={{ marginBottom: '1.25rem' }}>
        <div className='card-header'>
          <h3>Season Breakdown</h3>
          <span>Click a season to view details</span>
        </div>
        <div style={{ padding: '1rem', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {seasons.map(season => {
            const champ = data?.historyChampions?.find(c => c.Season === season)?.Champion
            return (
              <button key={season} onClick={() => setSelectedSeason(season)} style={{
                padding: '12px 20px', borderRadius: 10, cursor: 'pointer',
                border: '1px solid var(--card-border)', background: 'var(--page-bg)',
                textAlign: 'left', minWidth: 140, transition: 'all 0.15s'
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--blue)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--card-border)'}
              >
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{season}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>🏆 {champ || '—'}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className='card' style={{ padding: '1.25rem' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1.25rem' }}>
          All-Time Records
        </div>
        <Top10Table title='🔥 Top 10 Highest Scoring Weeks' data={data?.historyTopWeeks || []} cols={weekCols} />
        <Top10Table title='⭐ Top 10 Player Games (All Positions)' data={playerGames.overall} cols={playerCols} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          {['QB', 'RB', 'WR', 'TE'].map(pos => (
            <Top10Table key={pos} title={`Top 10 ${pos} Games`} data={playerGames[pos]} cols={posCols} />
          ))}
        </div>
      </div>

      {selectedSeason && (
        <SeasonModal
          season={selectedSeason}
          historyStandings={data?.historyStandings}
          champions={data?.historyChampions}
          historyBrackets={data?.historyBrackets}
          onClose={() => setSelectedSeason(null)}
        />
      )}
    </div>
  )
}