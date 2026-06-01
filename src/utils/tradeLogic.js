export const UPSIDE_TIERS = new Set(['Cornerstone', 'Foundational', 'Upside Premier', 'Upside Shot'])
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

export function calcAdjusted(asset, side, ctx) {
  const { userOwner, outlookByOwner, positionalRankings, adjustYears } = ctx
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
  if (SKILL_POS.has(pos)) {
    const rank = positionalRankings[userOwner]?.[pos] || 0
    if (rank >= 8) bonus += 0.08
  }
  const finalBonus = bonus > 0 ? Math.min(bonus, 0.20) : bonus
  return Math.round(base * (1 + finalBonus))
}
