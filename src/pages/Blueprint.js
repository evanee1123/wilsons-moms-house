import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  loadGoals, saveGoal, updateGoalStatus, deleteGoal,
  loadWatchlist, addToWatchlist, removeFromWatchlist,
  loadDismissed, dismissSuggestion, loadSaved, saveSuggestion, removeSavedSuggestion,
} from '../services/blueprintService'
import {
  calcAdjusted, tradeCompatible, computeQbNeed, computeStudTax,
  outlookIsRebuild, outlookIsContender, isYoungUpside, isAgedTradeCandidate,
  TIER_RANK,
} from '../utils/tradeLogic'

// ── Shared styles ─────────────────────────────────────────────────────────────
const actionBtn = {
  padding: '3px 8px', border: '1px solid var(--card-border)', borderRadius: '6px',
  fontSize: '11px', cursor: 'pointer', background: 'var(--page-bg)', color: 'var(--text-muted)',
}

// ── Outlook color ─────────────────────────────────────────────────────────────
function outlookColor(o) {
  if (outlookIsContender(o))  return 'var(--green)'
  if (o === 'Window Contender') return 'var(--blue)'
  if (o === 'Reload')           return 'var(--orange)'
  if (outlookIsRebuild(o))    return 'var(--red)'
  return 'var(--text-secondary)'
}

// ── Auto-goal generation ──────────────────────────────────────────────────────
function generateAutoGoals(myOutlook, positionalRankings, myOwner, pickYears) {
  const g   = text => ({ text, type: 'auto', outlookContext: myOutlook, status: 'active', createdAt: new Date().toISOString() })
  const y1  = pickYears[1] || ''
  const y2  = pickYears[2] || ''
  const y3  = pickYears[3] || ''
  const goals = []

  if (outlookIsContender(myOutlook)) {
    goals.push(g('Add to your Cornerstone/Foundational core — look to acquire top-50 KTC players'))
    goals.push(g('Monitor your RBs age 27+, WRs/TEs age 29+, and QBs age 32+ — consider selling before value drops'))
    goals.push(g('Look to win now — prioritize proven starters over developmental upside'))
  } else if (myOutlook === 'Window Contender') {
    goals.push(g('Target proven starters over upside picks'))
    goals.push(g('Address your weakest positional grade before the trade deadline'))
  } else if (myOutlook === 'Reload') {
    goals.push(g('Sell RBs age 27+, WRs/TEs age 29+, and QBs age 32+ for youth or pick capital'))
    if (y1 && y2) goals.push(g(`Accumulate ${y1} and ${y2} first-round picks`))
    goals.push(g("Protect your best young players — don't trade from strength"))
  } else if (outlookIsRebuild(myOutlook)) {
    if (y1 && y2 && y3) goals.push(g(`Accumulate ${y1}, ${y2}, and ${y3} first-round picks`))
    else if (y1 && y2)  goals.push(g(`Accumulate ${y1} and ${y2} first-round picks`))
    goals.push(g('Target players age 25 or younger in trades'))
    goals.push(g('Consider trading veteran players — RBs age 27+, WRs/TEs age 29+, QBs age 32+'))
    goals.push(g('Build roster depth at every position before targeting starters'))
  }

  // Data-personalized: worst positional grade in bottom 3
  const myRanks  = positionalRankings[myOwner] || {}
  const worstPos = ['QB', 'RB', 'WR', 'TE']
    .map(pos => ({ pos, rank: myRanks[pos] || 5 }))
    .filter(x => x.rank >= 8)
    .sort((a, b) => b.rank - a.rank)[0]
  if (worstPos) goals.push(g(`Address your ${worstPos.pos} depth — ranked #${worstPos.rank} in the league`))

  return goals
}

// ── Trade Finder helpers ──────────────────────────────────────────────────────
const STUD_TIERS_TF  = new Set(['Cornerstone', 'Foundational'])
const SKILL_POS_TF   = new Set(['QB', 'RB', 'WR', 'TE'])
const FAIR_THRESHOLD = 0.10

function getValueLabel(give, receive) {
  const r = receive / give
  if (r >= 1.08) return 'winning'
  if (r >= 0.92) return 'fair value'
  if (r >= 0.85) return 'slight overpay'
  return 'overpaying'
}

// Asset-specific motivation — verb phrase completing "likely to ___"
function getMotivation(theirOutlook, primaryAsset) {
  const pos     = primaryAsset?.Position || ''
  const isVet   = isAgedTradeCandidate(primaryAsset || {})
  const isYoung = isYoungUpside(primaryAsset || {})

  if (pos === 'Pick') {
    if (outlookIsRebuild(theirOutlook))   return 'deal their pick capital for proven talent'
    if (theirOutlook === 'Reload')        return 'convert pick capital into immediate help'
    if (outlookIsContender(theirOutlook)) return 'trade pick capital for proven talent'
    return 'trade pick capital for immediate value'
  }

  if (outlookIsRebuild(theirOutlook)) {
    if (isVet)   return 'move aging assets for youth and picks'
    if (isYoung) return 'deal from positional surplus at this spot'
    return "move assets that don't fit their rebuild timeline"
  }
  if (theirOutlook === 'Reload') {
    if (isVet)   return 'move aging assets to retool around youth'
    if (isYoung) return 'deal from depth at this position'
    return 'retool around younger, cheaper assets'
  }
  if (theirOutlook === 'Window Contender') {
    return !isYoung
      ? 'make a push this season with proven contributors'
      : 'convert upside pieces into proven help for their window'
  }
  // Contender
  if (isYoung && !isVet) return 'prioritize proven contributors over developmental upside'
  if (isVet)             return 'manage roster age while staying competitive'
  return 'fill a specific roster need'
}

function buildReason(candidate, myOutlook, positionalRankings, myOwner) {
  const myRanks      = positionalRankings[myOwner] || {}
  const theirOwner   = candidate.team
  const theirOutlook = candidate.outlook

  const outlookLabel = outlookIsRebuild(theirOutlook) ? 'Rebuilder'
    : theirOutlook === 'Reload'           ? 'Reload team'
    : theirOutlook === 'Window Contender' ? 'Window Contender'
    : 'Contender'

  const needFill = candidate.receive.find(a =>
    SKILL_POS_TF.has(a.Position || '') && (myRanks[a.Position] || 10) >= 7
  )
  const primary    = needFill ||
    [...candidate.receive].sort((a, b) => (b['KTC Value'] || 0) - (a['KTC Value'] || 0))[0]
  const motivation = getMotivation(theirOutlook, primary)

  if (needFill) {
    const name = needFill.Player || needFill['Player / Pick'] || ''
    return `${name} fills your ${needFill.Position} need — ${theirOwner} is a ${outlookLabel} likely to ${motivation}`
  }
  const pName  = primary?.Player || primary?.['Player / Pick'] || 'this package'
  const ageStr = primary?.Age ? ` (age ${primary.Age})` : ''
  if (primary?.Position === 'Pick')
    return `${theirOwner} is a ${outlookLabel} likely to ${motivation}`
  return `${pName}${ageStr} — ${theirOwner} is a ${outlookLabel} likely to ${motivation}`
}

// Fit scoring: starts at 0, gives true 0–10 spread based on actual positional need and outlook fit
function tradeFitScore(receivedAssets, myOutlook, positionalRankings, myOwner) {
  const myRanks = positionalRankings[myOwner] || {}
  let score = 0
  for (const asset of receivedAssets) {
    const pos   = asset.Position || ''
    const young = isYoungUpside(asset)
    if (pos === 'Pick') {
      if (outlookIsRebuild(myOutlook) || myOutlook === 'Reload') score += 3
      else if (outlookIsContender(myOutlook))                    score += 0.5
      else                                                        score += 1
      continue
    }
    if (!SKILL_POS_TF.has(pos)) continue
    const rank = myRanks[pos] || 5
    // Positional need: 5pts for critical need (rank 8-10), 3pts moderate (6-7), 1pt mild (4-5)
    score += rank >= 8 ? 5 : rank >= 6 ? 3 : rank >= 4 ? 1 : 0
    // Outlook-age fit bonus
    if (outlookIsRebuild(myOutlook) && young)                                                  score += 2
    else if (myOutlook === 'Reload' && young)                                                  score += 1
    else if ((outlookIsContender(myOutlook) || myOutlook === 'Window Contender') && !young)    score += 1.5
  }
  return Math.min(10, Math.round(score))
}

function findTrades(giveAssets, myOwner, myOutlook, data, outlookByOwner, positionalRankings, adjustYears) {
  if (!giveAssets.length || !myOwner || !data) return []

  const qbNeed   = computeQbNeed(myOwner, data.playerUniverse)
  const adjCtx   = { userOwner: myOwner, outlookByOwner, positionalRankings, adjustYears, qbNeed }
  const pickValueMap = {}
  ;(data.pickValues || []).forEach(p => { pickValueMap[p['Pick Name']] = p['KTC Value'] })

  const baseGiveKtc = giveAssets.reduce((s, a) => s + parseInt(a['KTC Value'] || 0), 0)
  if (baseGiveKtc === 0) return []

  const looseLo = baseGiveKtc * 0.75
  const looseHi = baseGiveKtc * 1.50

  const giveHasStud = giveAssets.some(a =>
    STUD_TIERS_TF.has(a.Tier || '') ||
    (a.Position === 'Pick' && (a.Player || a['Player / Pick'] || '').includes('1st'))
  )

  // myPool for auto-add: my players (KTC > 2500) + my picks, not already on give side.
  // _val uses raw KTC so auto-add comparisons match the KTC + stud tax filter.
  const giveNames = new Set(giveAssets.map(a => a.Player || a['Player / Pick'] || ''))
  const myPlayers = (data.playerUniverse || [])
    .filter(p => p['Dynasty Owner'] === myOwner && parseInt(p['KTC Value'] || 0) > 2500 && !giveNames.has(p.Player))
    .map(p => ({
      ...p,
      'Combined Score': parseFloat(p['Combined Score']) || parseFloat(p['KTC Value']) || 0,
      _val: parseInt(p['KTC Value'] || 0),
    }))
  const seenMyPicks = new Set()
  const myPicks = (data.pickPortfolio || [])
    .filter(p => p['Current Owner'] === myOwner)
    .map(p => {
      const ktc   = pickValueMap[p['Pick Name']] || p['KTC Value'] || 0
      const dName = `${p['Original Owner']} ${p['Pick Name']}`
      if (!ktc || seenMyPicks.has(p['Pick Name']) || giveNames.has(dName)) return null
      seenMyPicks.add(p['Pick Name'])
      const asset = { 'Player / Pick': dName, Position: 'Pick', 'KTC Value': ktc, 'Combined Score': ktc,
                      pickYear: p.Year, pickOriginalOwner: p['Original Owner'] }
      return { ...asset, _val: parseInt(ktc) }
    })
    .filter(Boolean)
  const myPool = [...myPlayers, ...myPicks]

  const myRanks = positionalRankings[myOwner] || {}

  const otherOwners   = [...new Set((data.playerUniverse || []).map(p => p['Dynasty Owner']).filter(Boolean))].filter(o => o !== myOwner)
  const rawCandidates = []

  for (const theirOwner of otherOwners) {
    const theirOutlook   = outlookByOwner[theirOwner] || ''
    const theirIsRebuild = outlookIsRebuild(theirOutlook)

    // Their player pool: filtered, valued, compat-checked, top 15 by value for combos.
    // Explicitly carries Combined Score so calcAdjusted always reads the correct field.
    const theirPlayers = (data.playerUniverse || [])
      .filter(p => {
        if (p['Dynasty Owner'] !== theirOwner) return false
        if (parseInt(p['KTC Value'] || 0) < 2000) return false
        if (theirIsRebuild && !giveHasStud && STUD_TIERS_TF.has(p.Tier || '')) return false
        // Veteran QB filter: skip QBs 32+ unless QB is the manager's weakest positional grade
        if ((p.Position || '') === 'QB' && parseInt(p.Age || 0) >= 32 && (myRanks['QB'] || 5) < 8) return false
        return true
      })
      .map(p => ({
        ...p,
        'Combined Score': parseFloat(p['Combined Score']) || parseFloat(p['KTC Value']) || 0,
        _val: parseInt(p['KTC Value'] || 0),
      }))
      .filter(a => tradeCompatible(myOutlook, theirOutlook, a))
      .sort((a, b) => b._val - a._val)
      .slice(0, 15)

    // Their pick pool: deduped, valued, sorted ascending (cheapest first) for gap-filling
    const seenPicks = new Set()
    const theirPicks = (data.pickPortfolio || [])
      .filter(p => p['Current Owner'] === theirOwner)
      .map(p => {
        const ktc = pickValueMap[p['Pick Name']] || p['KTC Value'] || 0
        if (!ktc || seenPicks.has(p['Pick Name'])) return null
        seenPicks.add(p['Pick Name'])
        const asset = { 'Player / Pick': `${p['Original Owner']} ${p['Pick Name']}`,
                        Position: 'Pick', 'KTC Value': ktc, 'Combined Score': ktc,
                        pickYear: p.Year, pickOriginalOwner: p['Original Owner'] }
        return { ...asset, _val: parseInt(ktc) }
      })
      .filter(Boolean)
      .sort((a, b) => a._val - b._val)

    const picks8 = theirPicks.slice(0, 8)

    // Helper: push candidate if QB count ≤ 1 and total in range
    const push = (receive) => {
      const tot = receive.reduce((s, a) => s + a._val, 0)
      if (tot < looseLo || tot > looseHi) return
      if (receive.filter(a => a.Position === 'QB').length > 1) return
      rawCandidates.push({ team: theirOwner, outlook: theirOutlook, receive, receiveKtc: tot })
    }

    // 1. Single player — only emit if receive >= baseGiveKtc (not short).
    //    Short players (0.90–1.00) are covered by player+pick combos below.
    for (const p of theirPlayers) {
      if (p._val >= baseGiveKtc) push([p])
    }

    // 2. Player + 1 pick (covers short singles that need a pick to reach fair value)
    for (const p of theirPlayers) {
      for (const pk of theirPicks) { push([p, pk]) }
    }

    // 3. Player + 2 picks (top-8 picks)
    for (const p of theirPlayers) {
      for (let i = 0; i < picks8.length; i++) {
        for (let j = i + 1; j < picks8.length; j++) { push([p, picks8[i], picks8[j]]) }
      }
    }

    // 4. 2 players
    for (let i = 0; i < theirPlayers.length; i++) {
      for (let j = i + 1; j < theirPlayers.length; j++) { push([theirPlayers[i], theirPlayers[j]]) }
    }

    // 5. 2 players + 1 pick (top-8 picks)
    for (let i = 0; i < theirPlayers.length; i++) {
      for (let j = i + 1; j < theirPlayers.length; j++) {
        for (const pk of picks8) { push([theirPlayers[i], theirPlayers[j], pk]) }
      }
    }

    // 6. 3 players
    for (let i = 0; i < theirPlayers.length; i++) {
      for (let j = i + 1; j < theirPlayers.length; j++) {
        for (let k = j + 1; k < theirPlayers.length; k++) {
          push([theirPlayers[i], theirPlayers[j], theirPlayers[k]])
        }
      }
    }
  }

  // ±10% fairness filter on KTC + stud tax — matches display values exactly
  const candidates = []
  for (const c of rawCandidates) {
    const st          = computeStudTax(giveAssets, c.receive)
    const displayGive = baseGiveKtc + (st.giveAdj || 0)
    const displayRecv = c.receiveKtc + (st.receiveAdj || 0)
    const ratio       = displayRecv / displayGive

    if (ratio >= (1 - FAIR_THRESHOLD) && ratio <= (1 + FAIR_THRESHOLD)) {
      candidates.push({ ...c, give: giveAssets, giveValue: displayGive, receiveValue: displayRecv })
    } else if (ratio > (1 + FAIR_THRESHOLD) && ratio <= 1.50) {
      let bestAutoAdd = null, bestDelta = Infinity
      for (const asset of myPool) {
        const newGive = [...giveAssets, asset]
        const stNew   = computeStudTax(newGive, c.receive)
        const adjGive = baseGiveKtc + asset._val + (stNew.giveAdj || 0)
        const adjRecv = c.receiveKtc + (stNew.receiveAdj || 0)
        const delta   = Math.abs(adjRecv / adjGive - 1)
        if (delta <= FAIR_THRESHOLD && delta < bestDelta) { bestDelta = delta; bestAutoAdd = asset }
      }
      if (bestAutoAdd) {
        const stFinal = computeStudTax([...giveAssets, bestAutoAdd], c.receive)
        const giveVal = baseGiveKtc + bestAutoAdd._val + (stFinal.giveAdj || 0)
        const recvVal = c.receiveKtc + (stFinal.receiveAdj || 0)
        candidates.push({ ...c, give: [...giveAssets, bestAutoAdd], giveValue: giveVal, receiveValue: recvVal })
      }
    }
  }

  // Score using redesigned fit function — true 0–10 range, not bunched at 5–6
  const scored = candidates.map(c => {
    // Apply calcAdjusted post-filter for need/context ranking boost (not a gate)
    const adjRecv       = c.receive.reduce((s, a) => s + calcAdjusted(a, 'receive', adjCtx), 0)
    const valueFairness = 1 - Math.abs(adjRecv - c.giveValue) / c.giveValue
    return { ...c, fitScore: tradeFitScore(c.receive, myOutlook, positionalRankings, myOwner), valueFairness, valueLabel: getValueLabel(c.giveValue, c.receiveValue) }
  })

  scored.sort((a, b) => (b.fitScore * 0.6 + b.valueFairness * 0.4) - (a.fitScore * 0.6 + a.valueFairness * 0.4))

  // Variety dedup: max 2/player on receive, max 2/team, max 2 QB-heavy → top 10
  const playerCount = {}, teamCount = {}, results = []
  let qbHeavyCount = 0
  for (const c of scored) {
    if (results.length >= 10) break
    if ((teamCount[c.team] || 0) >= 2) continue
    const names = c.receive.map(a => a.Player || a['Player / Pick'] || '')
    if (names.some(n => (playerCount[n] || 0) >= 2)) continue
    const topAsset  = [...c.receive].sort((a, b) => (b['KTC Value'] || 0) - (a['KTC Value'] || 0))[0]
    const isQbHeavy = (topAsset?.Position || '') === 'QB'
    if (isQbHeavy && qbHeavyCount >= 2) continue
    results.push(c)
    teamCount[c.team] = (teamCount[c.team] || 0) + 1
    names.forEach(n => { playerCount[n] = (playerCount[n] || 0) + 1 })
    if (isQbHeavy) qbHeavyCount++
  }

  return results.map(c => ({ ...c, reason: buildReason(c, myOutlook, positionalRankings, myOwner) }))
}

// ── Buy / Sell suggestion computation ────────────────────────────────────────
function computeBuySuggestions(myOwner, myOutlook, playerUniverse, outlookByOwner, positionalRankings, dismissedSet) {
  const myRanks  = positionalRankings[myOwner] || {}
  const isRebuild = outlookIsRebuild(myOutlook)
  const isReload  = myOutlook === 'Reload'
  return (playerUniverse || [])
    .filter(p => {
      if (!p['Dynasty Owner'] || p['Dynasty Owner'] === myOwner) return false
      if (parseInt(p['KTC Value'] || 0) <= 3000) return false
      if (dismissedSet.has(`${p.Player}:buy`)) return false
      // Rebuild and Reload teams should never target age-inappropriate players
      if ((isRebuild || isReload) && isAgedTradeCandidate(p)) return false
      return true
    })
    .map(p => {
      const pos          = p.Position || ''
      const age          = parseInt(p.Age || 30)
      const ownerOutlook = outlookByOwner[p['Dynasty Owner']] || ''
      const rank         = myRanks[pos] || 5
      let score = 0
      if (rank >= 8) score += 30
      else if (rank >= 6) score += 15
      if (outlookIsRebuild(myOutlook) && age <= 25) score += 20
      if (outlookIsContender(myOutlook) && age >= 26 && age <= 31) score += 15
      if (outlookIsRebuild(ownerOutlook) && isAgedTradeCandidate(p)) score += 25
      if (ownerOutlook === 'Reload' && isAgedTradeCandidate(p)) score += 15
      let reason = rank >= 8
        ? `Fills your ${pos} need`
        : outlookIsRebuild(ownerOutlook) && isAgedTradeCandidate(p)
        ? `${p['Dynasty Owner']} likely selling (${ownerOutlook})`
        : outlookIsRebuild(myOutlook) && age <= 25
        ? 'Young upside fits your rebuild'
        : outlookIsContender(myOutlook) && age >= 26 && age <= 31
        ? 'Proven contributor fits your window'
        : 'High value available'
      return { ...p, _score: score, _reason: reason }
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, 4)
}

function computeSellSuggestions(myOwner, myOutlook, playerUniverse, positionalRankings, dismissedSet) {
  const myRanks = positionalRankings[myOwner] || {}
  return (playerUniverse || [])
    .filter(p => p['Dynasty Owner'] === myOwner && !dismissedSet.has(`${p.Player}:sell`))
    .map(p => {
      const pos        = p.Position || ''
      const age        = parseInt(p.Age || 0)
      const rank       = myRanks[pos] || 5
      const ktc        = parseInt(p['KTC Value'] || 0)
      const tierRank   = TIER_RANK[p.Tier] || 99
      const posCount   = (playerUniverse || []).filter(x => x['Dynasty Owner'] === myOwner && x.Position === pos).length
      let reason = null
      if ((outlookIsRebuild(myOutlook) || myOutlook === 'Reload') && isAgedTradeCandidate(p))
        reason = `${pos} age ${age} — sell before value drops`
      else if (outlookIsContender(myOutlook) && tierRank >= 9)
        reason = 'Low tier — no longer fits your contention window'
      else if (rank <= 2 && posCount >= 4 && ktc > 3000)
        reason = `${pos} surplus — consider selling depth`
      return reason ? { ...p, _reason: reason } : null
    })
    .filter(Boolean)
    .slice(0, 4)
}

// ── Shared search dropdown ────────────────────────────────────────────────────
function AssetSearch({ onAdd, allAssets, placeholder, disabled }) {
  const [query, setQuery] = useState('')
  const [open,  setOpen]  = useState(false)
  const results = useMemo(() => {
    if (!query || query.length < 2) return []
    return allAssets
      .filter(p => (p.Player || p['Player / Pick'] || '').toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => parseInt(b['KTC Value'] || 0) - parseInt(a['KTC Value'] || 0))
      .slice(0, 20)
  }, [query, allAssets])
  return (
    <div style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || 'Search...'}
        disabled={disabled}
        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
      />
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', maxHeight: '280px', overflowY: 'auto', marginTop: '4px' }}>
          {results.map((p, i) => {
            const name = p.Player || p['Player / Pick'] || ''
            const ktc  = parseInt(p['KTC Value'] || 0)
            return (
              <div key={i} onMouseDown={() => { onAdd(p); setQuery(''); setOpen(false) }}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--card-border)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--page-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span>
                  <span style={{ fontWeight: 500 }}>{name}</span>
                  {p.Position && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>{p.Position}</span>}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>{ktc.toLocaleString()}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Section 1: Goals ──────────────────────────────────────────────────────────
function GoalRow({ goal, onStatus, onDismiss, isCustom }) {
  const done = goal.status === 'done'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--card-border)' }}>
      <div style={{ flex: 1, fontSize: '13px', color: done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none', paddingTop: '1px' }}>
        {goal.text}
      </div>
      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        <button onClick={() => onStatus(goal.id, done ? 'active' : 'done')} title={done ? 'Mark active' : 'Mark done'}
          style={{ ...actionBtn, background: done ? 'var(--green-bg)' : 'var(--page-bg)', color: done ? 'var(--green)' : 'var(--text-muted)' }}>✓</button>
        <button onClick={() => onDismiss(goal.id)} title={isCustom ? 'Delete' : 'Dismiss'} style={actionBtn}>×</button>
      </div>
    </div>
  )
}

function GoalsSection({ uid, myOwner, myOutlook, positionalRankings, pickYears }) {
  const [goals,   setGoals]   = useState([])
  const [loading, setLoading] = useState(true)
  const [text,    setText]    = useState('')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    if (!uid || !myOwner || !myOutlook) return
    console.log('[GoalsSection] loading goals for uid:', uid, '| owner:', myOwner, '| outlook:', myOutlook)
    setLoading(true)
    loadGoals(uid).then(async existing => {
      const hasOutlook = existing.some(g => g.type === 'auto' && g.outlookContext === myOutlook)
      if (!hasOutlook) {
        const generated = generateAutoGoals(myOutlook, positionalRankings, myOwner, pickYears)
        const saved     = await Promise.all(generated.map(g => saveGoal(uid, g)))
        setGoals([...saved, ...existing.filter(g => g.type === 'custom')])
      } else {
        setGoals(existing)
      }
      setLoading(false)
    })
  }, [uid, myOwner, myOutlook]) // eslint-disable-line

  async function handleStatus(id, status) {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, status } : g))
    await updateGoalStatus(uid, id, status)
  }
  async function handleDelete(id) {
    setGoals(prev => prev.filter(g => g.id !== id))
    await deleteGoal(uid, id)
  }
  async function handleAdd() {
    if (!text.trim() || saving) return
    setSaving(true)
    const goal  = { text: text.trim(), type: 'custom', outlookContext: myOutlook, status: 'active', createdAt: new Date().toISOString() }
    const saved = await saveGoal(uid, goal)
    setGoals(prev => [...prev, saved])
    setText('')
    setSaving(false)
  }

  const visible = goals.filter(g => g.status !== 'dismissed')
  const autoV   = visible.filter(g => g.type === 'auto' && g.outlookContext === myOutlook)
  const custV   = visible.filter(g => g.type === 'custom')

  return (
    <div className='card' style={{ marginBottom: '1.25rem' }}>
      <div className='card-header'><h3>Roster Composition Goals</h3></div>
      <div style={{ padding: '1rem' }}>
        {loading
          ? <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading...</div>
          : <>
              {autoV.map(g => <GoalRow key={g.id} goal={g} onStatus={handleStatus} onDismiss={id => handleStatus(id, 'dismissed')} />)}
              {custV.length > 0 && <>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '12px 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Custom</div>
                {custV.map(g => <GoalRow key={g.id} goal={g} onStatus={handleStatus} onDismiss={handleDelete} isCustom />)}
              </>}
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder='Add a custom goal...'
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--card-border)', background: 'var(--page-bg)', color: 'var(--text-primary)' }}
                />
                <button onClick={handleAdd} disabled={saving || !text.trim()}
                  style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, background: '#3182ce', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  Add
                </button>
              </div>
            </>
        }
      </div>
    </div>
  )
}

// ── Section 2: Watchlist ──────────────────────────────────────────────────────
function WatchlistRow({ item, data, outlookByOwner, onRemove }) {
  const player = useMemo(() => {
    const p = (data?.playerUniverse || []).find(x => x.Player === item.playerName)
    if (p) return p
    const pick = (data?.pickPortfolio || []).find(x => `${x['Original Owner']} ${x['Pick Name']}` === item.playerName)
    if (pick) return { Player: item.playerName, Position: 'Pick', 'KTC Value': pick['KTC Value'], Tier: '—', 'Dynasty Owner': pick['Current Owner'] }
    return null
  }, [item, data])

  if (!player) return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--page-bg)', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{item.playerName} — not found in current data</span>
      <button onClick={() => onRemove(item.id)} style={actionBtn}>Remove</button>
    </div>
  )

  const ownerOutlook = outlookByOwner[player['Dynasty Owner']] || ''
  const mightSell    = outlookIsRebuild(ownerOutlook) || ownerOutlook === 'Reload'

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--page-bg)', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{player.Player}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{player.Position}</span>
          {mightSell && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '99px', background: 'var(--orange-bg)', color: 'var(--orange)', fontWeight: 600 }}>Might sell</span>}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
          KTC {parseInt(player['KTC Value'] || 0).toLocaleString()} · {player.Tier} · {player['Dynasty Owner']} ({ownerOutlook || 'Unknown'})
        </div>
      </div>
      <button onClick={() => onRemove(item.id)} style={{ ...actionBtn, marginLeft: '8px' }}>Remove</button>
    </div>
  )
}

function WatchlistSection({ uid, data, allAssets, outlookByOwner }) {
  const [watchlist, setWatchlist] = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!uid) return
    console.log('[WatchlistSection] loading watchlist for uid:', uid)
    loadWatchlist(uid).then(items => { setWatchlist(items); setLoading(false) })
  }, [uid])

  async function handleAdd(asset) {
    const name = asset.Player || asset['Player / Pick'] || ''
    if (!name || watchlist.some(w => w.playerName === name)) return
    const saved = await addToWatchlist(uid, { playerName: name })
    setWatchlist(prev => [...prev, saved])
  }
  async function handleRemove(id) {
    setWatchlist(prev => prev.filter(w => w.id !== id))
    await removeFromWatchlist(uid, id)
  }

  return (
    <div className='card' style={{ marginBottom: '1.25rem' }}>
      <div className='card-header'><h3>Watchlist</h3></div>
      <div style={{ padding: '1rem' }}>
        <div style={{ marginBottom: '10px' }}>
          <AssetSearch onAdd={handleAdd} allAssets={allAssets} placeholder='Add a player or pick to monitor...' />
        </div>
        {loading
          ? <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading...</div>
          : watchlist.length === 0
          ? <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>No players on your watchlist yet.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {watchlist.map(item => <WatchlistRow key={item.id} item={item} data={data} outlookByOwner={outlookByOwner} onRemove={handleRemove} />)}
            </div>
        }
      </div>
    </div>
  )
}

// ── Section 3: Trade Suggestions ──────────────────────────────────────────────
function SuggestionRow({ player, type, isSaved, onDismiss, onSave, onUnsave }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--card-border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{player.Player}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{player.Position} · Age {player.Age}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>KTC {parseInt(player['KTC Value'] || 0).toLocaleString()}</span>
          {isSaved && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '99px', background: 'var(--blue-bg)', color: 'var(--blue)', fontWeight: 600 }}>Saved</span>}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{player._reason}</div>
      </div>
      <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
        <button onClick={() => isSaved ? onUnsave(player.Player, type) : onSave(player, type)}
          style={{ ...actionBtn, color: isSaved ? 'var(--blue)' : 'var(--text-muted)' }}
          title={isSaved ? 'Unsave' : 'Save'}>{isSaved ? '★' : '☆'}</button>
        <button onClick={() => onDismiss(player.Player, type)} style={actionBtn} title='Dismiss'>×</button>
      </div>
    </div>
  )
}

function SuggestionsSection({ uid, myOwner, myOutlook, data, outlookByOwner, positionalRankings }) {
  const [dismissed, setDismissed] = useState([])
  const [saved,     setSaved]     = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!uid) return
    Promise.all([loadDismissed(uid), loadSaved(uid)]).then(([d, s]) => {
      setDismissed(d); setSaved(s); setLoading(false)
    })
  }, [uid])

  const dismissedSet = useMemo(() => new Set(dismissed.map(d => `${d.playerName}:${d.type}`)), [dismissed])
  const savedSet     = useMemo(() => new Set(saved.map(s => `${s.playerName}:${s.type}`)), [saved])

  const buys  = useMemo(() => computeBuySuggestions(myOwner, myOutlook, data?.playerUniverse, outlookByOwner, positionalRankings, dismissedSet),  [myOwner, myOutlook, data, outlookByOwner, positionalRankings, dismissedSet])
  const sells = useMemo(() => computeSellSuggestions(myOwner, myOutlook, data?.playerUniverse, positionalRankings, dismissedSet), [myOwner, myOutlook, data, positionalRankings, dismissedSet])

  async function handleDismiss(playerName, type) {
    setDismissed(prev => [...prev, { playerName, type }])
    await dismissSuggestion(uid, playerName, type)
  }
  async function handleSave(player, type) {
    const s = await saveSuggestion(uid, { playerName: player.Player, type, reason: player._reason, ktc: player['KTC Value'] })
    setSaved(prev => [...prev, s])
  }
  async function handleUnsave(playerName, type) {
    const match = saved.find(s => s.playerName === playerName && s.type === type)
    if (!match) return
    setSaved(prev => prev.filter(s => s.id !== match.id))
    await removeSavedSuggestion(uid, match.id)
  }

  return (
    <div className='card' style={{ marginBottom: '1.25rem' }}>
      <div className='card-header'><h3>Personalized Trade Suggestions</h3></div>
      <div style={{ padding: '1rem' }}>
        {loading ? <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading...</div> : <>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Buy Targets</div>
          {buys.length === 0
            ? <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>No buy suggestions right now.</div>
            : buys.map((p, i) => <SuggestionRow key={i} player={p} type='buy' isSaved={savedSet.has(`${p.Player}:buy`)} onDismiss={handleDismiss} onSave={handleSave} onUnsave={handleUnsave} />)
          }
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '12px 0 8px' }}>Sell Candidates</div>
          {sells.length === 0
            ? <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No sell suggestions right now.</div>
            : sells.map((p, i) => <SuggestionRow key={i} player={p} type='sell' isSaved={savedSet.has(`${p.Player}:sell`)} onDismiss={handleDismiss} onSave={handleSave} onUnsave={handleUnsave} />)
          }
        </>}
      </div>
    </div>
  )
}

// ── Section 4: Trade Finder ───────────────────────────────────────────────────
function TradeResultCard({ result }) {
  const displayGive = result.giveValue    || 0
  const displayRecv = result.receiveValue || 0
  const fitColor    = result.fitScore >= 8 ? 'var(--green)' : result.fitScore >= 5 ? 'var(--orange)' : 'var(--red)'
  const valColor    = result.valueLabel === 'winning' ? 'var(--green)' : result.valueLabel === 'fair value' ? 'var(--blue)' : 'var(--orange)'
  return (
    <div style={{ padding: '12px', background: 'var(--page-bg)', borderRadius: '10px', border: '1px solid var(--card-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{result.team}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>{result.outlook}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: fitColor, padding: '2px 8px', borderRadius: '99px', border: `1px solid ${fitColor}` }}>Fit {result.fitScore}/10</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: valColor, padding: '2px 8px', borderRadius: '99px', border: `1px solid ${valColor}`, textTransform: 'capitalize' }}>{result.valueLabel}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: '99px', border: '1px solid var(--card-border)' }}>
            {displayGive.toLocaleString()} → {displayRecv.toLocaleString()}
          </span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#e53e3e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>You Give</div>
          {(result.give || []).map((a, i) => <div key={i} style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{a.Player || a['Player / Pick']}</div>)}
        </div>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#38a169', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>You Receive</div>
          {result.receive.map((a, i) => <div key={i} style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{a.Player || a['Player / Pick']}</div>)}
        </div>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', borderTop: '1px solid var(--card-border)', paddingTop: '8px' }}>
        {result.reason}
      </div>
    </div>
  )
}

function TradeFinderSection({ myOwner, myOutlook, data, allAssets, outlookByOwner, positionalRankings, adjustYears }) {
  const [giveAssets, setGiveAssets] = useState([])
  const [results,    setResults]    = useState([])
  const [searched,   setSearched]   = useState(false)
  const [searching,  setSearching]  = useState(false)

  function handleAdd(asset) {
    if (giveAssets.length >= 3) return
    setGiveAssets(prev => [...prev, asset])
    setResults([]); setSearched(false)
  }
  function handleRemove(i) {
    setGiveAssets(prev => prev.filter((_, idx) => idx !== i))
    setResults([]); setSearched(false)
  }
  function handleFind() {
    setSearching(true)
    setTimeout(() => {
      setResults(findTrades(giveAssets, myOwner, myOutlook, data, outlookByOwner, positionalRankings, adjustYears))
      setSearched(true)
      setSearching(false)
    }, 0)
  }

  return (
    <div className='card' style={{ marginBottom: '1.25rem' }}>
      <div className='card-header'>
        <h3>Trade Finder</h3>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>TF v1</span>
      </div>
      <div style={{ padding: '1rem' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>Add 1–3 assets you're willing to give. We'll find fair return packages from other rosters.</div>
        <div style={{ marginBottom: '8px' }}>
          <AssetSearch onAdd={handleAdd} allAssets={allAssets} placeholder='Search assets to give...' disabled={giveAssets.length >= 3} />
        </div>
        {giveAssets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
            {giveAssets.map((a, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--page-bg)', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
                <span style={{ fontSize: '13px' }}>{a.Player || a['Player / Pick']} <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>· KTC {parseInt(a['KTC Value'] || 0).toLocaleString()}</span></span>
                <button onClick={() => handleRemove(i)} style={actionBtn}>×</button>
              </div>
            ))}
          </div>
        )}
        <button onClick={handleFind} disabled={!giveAssets.length || searching}
          style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, background: !giveAssets.length ? 'var(--card-border)' : '#3182ce', color: !giveAssets.length ? 'var(--text-muted)' : '#fff', border: 'none', cursor: !giveAssets.length ? 'default' : 'pointer' }}>
          {searching ? 'Searching...' : 'Find Trades'}
        </button>
        {searched && results.length === 0 && (
          <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>No matching packages found. Try different assets.</div>
        )}
        {results.length > 0 && (
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {results.map((r, i) => <TradeResultCard key={i} result={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function Blueprint({ data, setPage }) {
  const { currentUser, userProfile, viewAsOwner } = useAuth()
  const myOwner = viewAsOwner || userProfile?.rosterOwnerName
  // uid is always the real logged-in user — never swapped by viewAsOwner
  const uid           = currentUser?.uid
  // personalOwner/personalOutlook are NEVER affected by viewAsOwner.
  // Used for all Firestore reads/writes (goals, watchlist) so data stays
  // tied to the real user regardless of which team admin is viewing.
  const personalOwner   = userProfile?.rosterOwnerName
  const myOutlook       = useMemo(() => data?.teamOverview?.find(t => t.Owner === myOwner)?.Outlook       || '', [data, myOwner])
  const personalOutlook = useMemo(() => data?.teamOverview?.find(t => t.Owner === personalOwner)?.Outlook || '', [data, personalOwner])

  const outlookByOwner = useMemo(() => {
    const map = {}
    data?.teamOverview?.forEach(t => { map[t.Owner] = t.Outlook })
    return map
  }, [data])

  const positionalRankings = useMemo(() => {
    const result = {}
    ;['QB', 'RB', 'WR', 'TE'].forEach(pos => {
      const sorted = [...(data?.rosterGrades || [])].sort((a, b) => b[`${pos} Grade`] - a[`${pos} Grade`])
      sorted.forEach((t, idx) => { if (!result[t.Owner]) result[t.Owner] = {}; result[t.Owner][pos] = idx + 1 })
    })
    return result
  }, [data])

  const pickYears   = useMemo(() => [...new Set((data?.pickPortfolio || []).map(p => p.Year))].sort(), [data])
  const adjustYears = useMemo(() => new Set([pickYears[1], pickYears[2]].filter(Boolean)), [pickYears])

  const pickValueMap = useMemo(() => {
    const map = {}
    ;(data?.pickValues || []).forEach(p => { map[p['Pick Name']] = p['KTC Value'] })
    return map
  }, [data])

  const allAssets = useMemo(() => {
    const players = data?.playerUniverse || []
    const picks   = (data?.pickPortfolio || [])
      .map(p => {
        const ktc = pickValueMap[p['Pick Name']] || p['KTC Value'] || 0
        if (!ktc) return null
        return {
          'Player / Pick': `${p['Original Owner']} ${p['Pick Name']}`,
          Position: 'Pick', 'KTC Value': ktc, 'Combined Score': ktc,
          pickYear: p.Year, pickOriginalOwner: p['Original Owner'],
        }
      })
      .filter(Boolean)
    return [...players, ...picks]
  }, [data, pickValueMap])

  if (!myOwner) return (
    <div className='page'>
      <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Your account isn't linked to a roster. Contact the commissioner.</div>
    </div>
  )

  return (
    <div className='page'>
      <div className='page-title'>My Blueprint</div>
      <div className='page-subtitle' style={{ marginBottom: '1.5rem' }}>
        {myOwner} ·{' '}
        <span style={{ fontWeight: 600, color: outlookColor(myOutlook) }}>{myOutlook}</span>
        {viewAsOwner && <span style={{ marginLeft: '10px', fontSize: '11px', background: 'rgba(246,224,94,0.15)', color: '#d69e2e', padding: '2px 8px', borderRadius: '99px' }}>Admin view</span>}
      </div>

      <GoalsSection uid={uid} myOwner={personalOwner} myOutlook={personalOutlook} positionalRankings={positionalRankings} pickYears={pickYears} />
      <WatchlistSection uid={uid} data={data} allAssets={allAssets} outlookByOwner={outlookByOwner} />
      <SuggestionsSection uid={uid} myOwner={myOwner} myOutlook={myOutlook} data={data} outlookByOwner={outlookByOwner} positionalRankings={positionalRankings} />
      <TradeFinderSection myOwner={myOwner} myOutlook={myOutlook} data={data} allAssets={allAssets} outlookByOwner={outlookByOwner} positionalRankings={positionalRankings} adjustYears={adjustYears} />
    </div>
  )
}
