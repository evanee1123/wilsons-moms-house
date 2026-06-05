export const UPSIDE_TIERS = new Set(['Cornerstone', 'Upside Premier', 'Upside Shot'])
export const SKILL_POS    = new Set(['QB', 'RB', 'WR', 'TE'])

export const POSITION_AGE_THRESHOLDS = { QB: 32, WR: 29, TE: 29, RB: 27 }

export const TIER_RANK = {
  'Cornerstone': 1, 'Foundational': 2, 'Upside Premier': 3, 'Mainstay': 4,
  'Productive Vet': 5, 'Short-term Winner': 6, 'Upside Shot': 7,
  'Short-term Production': 8, 'Serviceable': 9, 'Jag Developmental': 10,
  'Jag Insurance': 11, 'Replaceable': 12,
}

export function outlookIsRebuild(outlook) {
  return outlook === 'Rebuild' || outlook === 'Rebuild (future value)'
}

export function outlookIsContender(outlook) {
  return outlook === 'Contender'
}

export function isYoungUpside(asset) {
  return parseInt(asset.Age || 30) <= 25 || UPSIDE_TIERS.has(asset.Tier || '')
}

export function isAgedTradeCandidate(player) {
  const age       = parseInt(player.Age || 0)
  const threshold = POSITION_AGE_THRESHOLDS[player.Position || '']
  return threshold !== undefined && age >= threshold
}

// Whether a team with theirOutlook would realistically trade asset to myOutlook team
export function tradeCompatible(myOutlook, theirOutlook, asset) {
  if ((asset.Position || '') === 'Pick') return true
  if (isYoungUpside(asset) && outlookIsRebuild(theirOutlook) && outlookIsContender(myOutlook)) return false
  return true
}

// Score how well received assets fit the manager's needs (0–10)
export function fitScore(receivedAssets, myOutlook, positionalRankings, myOwner) {
  if (!receivedAssets.length) return 0
  let score = 4
  for (const asset of receivedAssets) {
    const pos = asset.Position || ''
    if (pos === 'Pick') {
      if (outlookIsRebuild(myOutlook) || myOutlook === 'Reload') score += 1.5
      continue
    }
    if (SKILL_POS.has(pos)) {
      const rank = positionalRankings[myOwner]?.[pos] || 5
      if (rank >= 8) score += 2
      else if (rank >= 6) score += 1
    }
    if (outlookIsRebuild(myOutlook) && isYoungUpside(asset)) score += 1
    if (outlookIsContender(myOutlook) && !isYoungUpside(asset)) score += 0.5
  }
  return Math.min(10, Math.round(score))
}

// Compute whether both of a manager's top-2 QBs rank in the bottom 3 league-wide.
// Used instead of positional grade for QB in superflex leagues.
export function computeQbNeed(myOwner, playerUniverse) {
  if (!myOwner || !playerUniverse?.length) return false
  const allOwners = [...new Set(playerUniverse.map(p => p['Dynasty Owner']).filter(Boolean))]
  const topQbs = (owner, n) =>
    playerUniverse
      .filter(p => p['Dynasty Owner'] === owner && p.Position === 'QB')
      .sort((a, b) => (b['KTC Value'] || 0) - (a['KTC Value'] || 0))
      .slice(0, n)
  const qb1List = allOwners.map(o => ({ o, ktc: topQbs(o, 1)[0]?.['KTC Value'] || 0 })).sort((a, b) => b.ktc - a.ktc)
  const qb2List = allOwners.map(o => ({ o, ktc: topQbs(o, 2)[1]?.['KTC Value'] || 0 })).sort((a, b) => b.ktc - a.ktc)
  const qb1Rank = qb1List.findIndex(x => x.o === myOwner) + 1
  const qb2Rank = qb2List.findIndex(x => x.o === myOwner) + 1
  return qb1Rank >= 8 && qb2Rank >= 8  // both top-2 QBs must be bottom-3 league-wide
}

// Quadratic baseRate calibrated to verified KTC stud tax data points
function quadraticBaseRate(topKtc) {
  const raw = 1.2803 - 0.00028679 * topKtc + 0.000000021420 * topKtc * topKtc
  return Math.max(0.30, Math.min(0.65, raw))
}

// Stud tax: find the top asset, boost that side by the premium it commands.
// adj = 0 for 1v1 trades. Uses KTC value (not Combined Score) per KTC formula.
export function computeStudTax(giveAssets, receiveAssets) {
  const nGive    = (giveAssets    || []).length
  const nReceive = (receiveAssets || []).length
  if (nGive + nReceive <= 2) return { giveAdj: 0, receiveAdj: 0 }

  const allAssets = [...(giveAssets || []), ...(receiveAssets || [])]
  const topAsset  = allAssets.reduce((best, a) =>
    parseInt(a['KTC Value'] || 0) > parseInt(best['KTC Value'] || 0) ? a : best
  )
  const topKtc  = parseInt(topAsset['KTC Value'] || 0)
  if (topKtc === 0) return { giveAdj: 0, receiveAdj: 0 }

  const topName    = topAsset.Player || topAsset['Player / Pick'] || ''
  const studOnGive = (giveAssets || []).some(a =>
    (a.Player || a['Player / Pick'] || '') === topName
  )
  const studSide      = studOnGive ? (giveAssets || []) : (receiveAssets || [])
  const studSideTotal = studSide.reduce((s, a) => s + parseInt(a['KTC Value'] || 0), 0)

  const baseRate = quadraticBaseRate(topKtc)
  const studMult = 1.0 + Math.max(0, (topKtc - 5000) / 100) * 0.001
  const dilution = topKtc / studSideTotal
  const adj      = Math.round(topKtc * baseRate * studMult * dilution)

  return studOnGive
    ? { giveAdj: adj, receiveAdj: 0 }
    : { giveAdj: 0, receiveAdj: adj }
}

export function calcAdjusted(asset, side, ctx) {
  const { userOwner, outlookByOwner, positionalRankings, adjustYears, qbNeed } = ctx
  const base = parseInt(asset['Combined Score'] || asset['KTC Value'] || 0)
  const pos  = asset.Position || ''

  if (pos === 'Pick') {
    if (side === 'receive' && asset.pickOriginalOwner && asset.pickYear && adjustYears.has(asset.pickYear)) {
      const orig = outlookByOwner[asset.pickOriginalOwner] || ''
      if (outlookIsRebuild(orig))    return Math.round(base * 1.12)
      if (outlookIsContender(orig))  return Math.round(base * 0.90)
    }
    return base
  }

  if (side !== 'receive' || !userOwner) return base

  const myOutlook = outlookByOwner[userOwner] || ''
  let bonus = 0
  if (isYoungUpside(asset)) {
    if (outlookIsRebuild(myOutlook))        bonus += 0.08
    else if (outlookIsContender(myOutlook)) bonus -= 0.05
  }
  // Need bonus: only for KTC >= 4,500 (prevents inflating low-value high-production players).
  // QB uses top-2 superflex ranking instead of positional grade. Max +5%.
  const ktcVal = parseInt(asset['KTC Value'] || 0)
  if (SKILL_POS.has(pos) && ktcVal >= 4500) {
    const hasNeed = pos === 'QB'
      ? (qbNeed === true)
      : (positionalRankings[userOwner]?.[pos] || 0) >= 8
    if (hasNeed) bonus += 0.05
  }
  const finalBonus = bonus > 0 ? Math.min(bonus, 0.20) : bonus
  return Math.round(base * (1 + finalBonus))
}
