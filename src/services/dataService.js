import { normalizeName } from '../utils/playerUtils'

const BASE    = '/data'
const WMH_ID  = '1312130103358021632'
const SLEEPER = 'https://api.sleeper.app/v1'

async function fetchJSON(filename) {
  const res = await fetch(`${BASE}/${filename}`)
  if (!res.ok) throw new Error(`Failed to fetch ${filename}`)
  return res.json()
}

async function fetchSleeper(path) {
  const res = await fetch(`${SLEEPER}${path}`)
  return res.json()
}

async function fetchPlayerStats(leagueId) {
  try {
    const res = await fetch(`/api/player-stats?league_id=${leagueId}`)
    if (!res.ok) return {}
    return await res.json()
  } catch {
    return {}
  }
}

// Merges /api/player-stats onto a playerUniverse/leagueRosters row array.
// External leagues match by exact Sleeper ID (present on every row); Wilson's static
// JSON has no Sleeper ID so falls through to normalized-name matching instead.
// primaryFromCron=true (Wilson's): cron-computed Avg PPG/Prod Score/Combined Score/Seasons
// win unless actually missing. primaryFromCron=false (external): API values always win —
// existing values are just 0/null placeholders.
function mergePlayerStats(rows, playerStats, primaryFromCron) {
  if (!playerStats || Object.keys(playerStats).length === 0) return rows

  const byName = {}
  Object.values(playerStats).forEach(s => { byName[normalizeName(s.name)] = s })
  const isMissing = v => v === undefined || v === null

  return rows.map(row => {
    const stats = playerStats[row['Sleeper ID']] || byName[normalizeName(row.Player)]
    if (!stats) return row

    const merged = { ...row }
    if (!primaryFromCron || isMissing(merged['Avg PPG']))               merged['Avg PPG'] = stats.avg_ppg
    if (!primaryFromCron || isMissing(merged['Multi-Year Prod Score'])) merged['Multi-Year Prod Score'] = stats.multi_year_prod_score
    if (!primaryFromCron || isMissing(merged['Combined Score']))        merged['Combined Score'] = stats.combined_score
    if (!primaryFromCron || isMissing(merged['Seasons']))                merged['Seasons'] = stats.seasons
    merged['Games Played'] = stats.games
    merged['Snap Pct']     = stats.snap_pct
    merged['career_stats'] = stats.career_stats
    return merged
  })
}

// Production Share/Rank/Gap — mirrors wilsons_teams.py's team_summary aggregation
// (total_avg_ppg = sum of Multi-Year Prod Score per owner, share = % of league total).
function computeProductionShares(playerUniverse) {
  const totalsByOwner = {}
  playerUniverse.forEach(p => {
    const prod = parseFloat(p['Multi-Year Prod Score']) || 0
    totalsByOwner[p.Owner] = (totalsByOwner[p.Owner] || 0) + prod
  })
  const leagueTotal = Object.values(totalsByOwner).reduce((s, v) => s + v, 0)

  const shareByOwner = {}
  Object.entries(totalsByOwner).forEach(([owner, total]) => {
    shareByOwner[owner] = leagueTotal > 0 ? +(total / leagueTotal * 100).toFixed(2) : 0
  })

  const rankByOwner = {}
  Object.entries(shareByOwner)
    .sort((a, b) => b[1] - a[1])
    .forEach(([owner], i) => { rankByOwner[owner] = i + 1 })

  return { shareByOwner, rankByOwner }
}

async function fetchStandings(leagueId) {
  const [rosters, users] = await Promise.all([
    fetchSleeper(`/league/${leagueId}/rosters`),
    fetchSleeper(`/league/${leagueId}/users`),
  ])

  const userMap = {}
  users.forEach(u => { userMap[u.user_id] = u.display_name || u.username })

  return rosters.map(r => {
    const wins   = r.settings?.wins   || 0
    const losses = r.settings?.losses || 0
    const games  = wins + losses
    const pf     = r.settings?.fpts         || 0
    const pa     = r.settings?.fpts_against || 0
    return {
      owner:  userMap[r.owner_id] || 'Unknown',
      wins,
      losses,
      avgPF:  games > 0 ? (pf / games).toFixed(1) : '0.0',
      avgPA:  games > 0 ? (pa / games).toFixed(1) : '0.0',
    }
  })
}

function parsePickName(pickName) {
  // "2028 Mid 1st" → { year: 2028, tier: 'Mid', round: 1 }
  const parts = (pickName || '').split(' ')
  const year  = parseInt(parts[0]) || 0
  const tier  = parts[1] || 'Mid'
  const roundMap = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4 }
  const round = roundMap[parts[2]] || 1
  return { year, tier, round }
}

// ── Competitive Window model — mirrors wilsons_teams.py cell "17b" exactly ──
// (age-bucket runway %, position growth curves, outlook multipliers, pick
// conversion, league-value cap, peak window derivation) so external leagues
// get the same Core Age / Peak Window / Age Runway / Value Curve stats the
// cron computes for Wilson's. See HANDOFF.md "Competitive Window Projection
// Model" for the rationale behind these specific constants.
const AGE_RUNWAY_BUCKETS = {
  QB: [['Young', 0, 25], ['Prime', 26, 30], ['Late Prime', 31, 33], ['Aging', 34, 999]],
  RB: [['Young', 0, 23], ['Prime', 24, 26], ['Late Prime', 27, 28], ['Aging', 29, 999]],
  WR: [['Young', 0, 23], ['Prime', 24, 27], ['Late Prime', 28, 30], ['Aging', 31, 999]],
  TE: [['Young', 0, 23], ['Prime', 24, 27], ['Late Prime', 28, 30], ['Aging', 31, 999]],
}
function getAgeRunwayBucket(position, age) {
  for (const [name, lo, hi] of (AGE_RUNWAY_BUCKETS[position] || AGE_RUNWAY_BUCKETS.WR)) {
    if (age >= lo && age <= hi) return name
  }
  return 'Aging'
}

const GROWTH_CURVES = {
  QB: [['Rising', 0, 25, 0.12], ['Prime', 26, 30, 0.03], ['Peak', 31, 33, -0.02], ['Decline', 34, 999, -0.15]],
  RB: [['Rising', 0, 24, 0.15], ['Prime', 25, 26, 0.02], ['Late', 27, 28, -0.12], ['Decline', 29, 999, -0.25]],
  WR: [['Rising', 0, 24, 0.12], ['Prime', 25, 28, 0.03], ['Late', 29, 30, -0.08], ['Decline', 31, 999, -0.18]],
  TE: [['Rising', 0, 24, 0.10], ['Prime', 25, 28, 0.02], ['Late', 29, 30, -0.08], ['Decline', 31, 999, -0.18]],
}
const GROWTH_ZERO_AGE = { QB: 36, RB: 30, WR: 33, TE: 33 }
const VALUE_FLOOR = 500, VALUE_CEILING = 9999

function getGrowthBucket(position, age) {
  const curves = GROWTH_CURVES[position] || GROWTH_CURVES.WR
  for (const [name, lo, hi, rate] of curves) {
    if (age >= lo && age <= hi) return { name, rate }
  }
  const last = curves[curves.length - 1]
  return { name: last[0], rate: last[3] }
}

const OUTLOOK_MULT = {
  'Rebuild':                      { young: 1.4, pick: 1.3, aging: 0.7 },
  'Rebuild (future value)':       { young: 1.4, pick: 1.3, aging: 0.7 },
  'Reload':                       { young: 1.2, pick: 1.1, aging: 0.9 },
  'Reload (sell vets for youth)': { young: 1.2, pick: 1.1, aging: 0.9 },
  'Contender':                    { young: 1.0, pick: 0.9, aging: 1.0 },
  'Window Contender':             { young: 1.0, pick: 0.9, aging: 1.0 },
  'Contender (needs production)': { young: 1.0, pick: 0.9, aging: 1.0 },
}
const DEFAULT_MULT = { young: 1.0, pick: 1.0, aging: 1.0 }

function projectPlayerValue(position, age, ktcValue, numYears, youngMult, agingMult) {
  const zeroAge = GROWTH_ZERO_AGE[position] || 33
  const values  = [Math.min(ktcValue, VALUE_CEILING)]
  let running    = values[0]
  for (let i = 1; i < numYears; i++) {
    const projectedAge = age + i
    if (running <= 0 || projectedAge >= zeroAge) {
      running = 0
    } else {
      const { name: bucket, rate: baseRate } = getGrowthBucket(position, projectedAge)
      const rate = bucket === 'Rising' ? baseRate * youngMult : baseRate
      running = running * (1 + rate)
      if (bucket === 'Decline') running = running * agingMult
      running = Math.min(Math.max(running, VALUE_FLOOR), VALUE_CEILING)
    }
    values.push(running)
  }
  return values
}

function draftStatus(n) {
  if (n === 0) return 'Deficient'
  if (n <= 2) return 'Adequate'
  if (n <= 4) return 'Surplus'
  return 'Overload'
}

// Returns { [ownerName]: { 'Core Age', 'Peak Year', 'Peak Window', 'Years to Peak',
// 'Peak Gain %', 'Age Runway', 'Value Curve', '{year} 1sts', '{year} Status', 'Total 1sts' } }
function computeCompetitiveWindow(playerUniverse, pickPortfolio, rosters, currentDraftYear) {
  const years            = [0, 1, 2, 3].map(i => currentDraftYear + i)
  const valueCurveYears  = [0, 1, 2, 3, 4].map(i => currentDraftYear + i)
  const maxTeamValue     = Math.max(0, ...rosters.map(r => r.total_ktc || 0))
  const valueCurveCap    = maxTeamValue * 1.25

  const result = {}
  rosters.forEach(r => {
    const owner   = r.display_name || r.team_name
    const outlook = r.outlook || 'Reload'
    const mult    = OUTLOOK_MULT[outlook] || DEFAULT_MULT

    const teamPlayers = playerUniverse.filter(p => p['Dynasty Owner'] === owner && (p['KTC Value'] || 0) > 0 && p.Age != null)
    const totalValue  = teamPlayers.reduce((s, p) => s + (p['KTC Value'] || 0), 0)

    const coreAge = totalValue > 0
      ? +((teamPlayers.reduce((s, p) => s + p.Age * p['KTC Value'], 0) / totalValue).toFixed(1))
      : 0

    const bucketValues = { Young: 0, Prime: 0, 'Late Prime': 0, Aging: 0 }
    teamPlayers.forEach(p => { bucketValues[getAgeRunwayBucket(p.Position, p.Age)] += p['KTC Value'] || 0 })
    const ageRunway = {}
    Object.keys(bucketValues).forEach(b => {
      ageRunway[b] = totalValue > 0 ? +((bucketValues[b] / totalValue * 100).toFixed(1)) : 0
    })

    let curveTotals = new Array(valueCurveYears.length).fill(0)
    teamPlayers.forEach(p => {
      const projected = projectPlayerValue(p.Position, p.Age, p['KTC Value'] || 0, valueCurveYears.length, mult.young, mult.aging)
      curveTotals = curveTotals.map((v, i) => v + projected[i])
    })

    const pickContrib = {}
    ;(pickPortfolio || [])
      .filter(p => p['Current Owner'] === owner)
      .forEach(p => {
        const draftYear = p.Year
        if (draftYear === currentDraftYear || !valueCurveYears.includes(draftYear)) return
        pickContrib[draftYear] = (pickContrib[draftYear] || 0) + (p['KTC Value'] || 0) * mult.pick
      })
    valueCurveYears.forEach((year, idx) => { curveTotals[idx] += pickContrib[year] || 0 })
    curveTotals = curveTotals.map(v => Math.min(v, valueCurveCap))

    const valueCurve = {}
    valueCurveYears.forEach((year, idx) => { valueCurve[year] = Math.round(curveTotals[idx]) })

    const currentValue = curveTotals[0]
    let peakIdx = 0
    curveTotals.forEach((v, i) => { if (v > curveTotals[peakIdx]) peakIdx = i })
    const peakYear  = valueCurveYears[peakIdx]
    const peakValue = curveTotals[peakIdx]

    const threshold = peakValue * 0.90
    let lo = peakIdx, hi = peakIdx
    while (lo - 1 >= 0 && curveTotals[lo - 1] >= threshold) lo--
    while (hi + 1 < curveTotals.length && curveTotals[hi + 1] >= threshold) hi++
    if (lo === hi) { lo = Math.max(lo - 1, 0); hi = Math.min(hi + 1, valueCurveYears.length - 1) }
    const peakWindow   = `${valueCurveYears[lo]}–${valueCurveYears[hi]}`
    const yearsToPeak  = peakYear - currentDraftYear

    let peakGainPct = currentValue > 0 ? +(((peakValue - currentValue) / currentValue * 100).toFixed(1)) : 0
    if (peakGainPct < 0.5) peakGainPct = 0

    const yearFields = {}
    let totalFirsts = 0
    years.forEach(year => {
      const n = (pickPortfolio || []).filter(p =>
        p['Current Owner'] === owner && p.Year === year && parseInt(p.Round) === 1
      ).length
      yearFields[`${year} 1sts`]   = n
      yearFields[`${year} Status`] = draftStatus(n)
      totalFirsts += n
    })
    yearFields['Total 1sts'] = totalFirsts

    result[owner] = {
      'Core Age':      coreAge,
      'Peak Year':     peakYear,
      'Peak Window':   peakWindow,
      'Years to Peak': yearsToPeak,
      'Peak Gain %':   peakGainPct,
      'Age Runway':    ageRunway,
      'Value Curve':   valueCurve,
      ...yearFields,
    }
  })
  return result
}

async function loadExternalLeagueData(leagueId) {
  const [leagueRes, ktcRes, standings, playerStats] = await Promise.all([
    fetch(`/api/league?league_id=${leagueId}`).then(r => {
      if (!r.ok) throw new Error(`League API error: ${r.status}`)
      return r.json()
    }),
    fetch('/api/ktc').then(r => r.json()),
    fetchStandings(leagueId),
    fetchPlayerStats(leagueId),
  ])

  const rosters          = leagueRes.rosters || []
  const totalLeagueValue = rosters.reduce((s, r) => s + (r.total_ktc || 0), 0)
  const sortedByValue    = [...rosters].sort((a, b) => (b.total_ktc || 0) - (a.total_ktc || 0))

  // playerUniverse — flattened from rosters; Tier from KTC-only approximation
  let playerUniverse = rosters.flatMap(r => {
    const dn = r.display_name || r.team_name
    return (r.players || []).map(p => ({
      'Player':         p.name,
      'Position':       p.position,
      'KTC Value':      p.ktc_value || 0,
      'Combined Score': p.ktc_value || 0,
      'Owner':          dn,
      'Dynasty Owner':  dn,
      'Tier':           p.tier || null,
      'Age':            p.age != null ? p.age : null,
      'Avg PPG':        0,
      'On Taxi':        'False',
      'NFL Team':       p.nfl_team || null,
      'Sleeper ID':     p.sleeper_id,
    }))
  })

  // leagueRosters — same source as playerUniverse in the leagueRosters shape
  let leagueRosters = rosters.flatMap(r => {
    const dn = r.display_name || r.team_name
    return (r.players || []).map(p => ({
      'Owner':          dn,
      'Player':         p.name,
      'Position':       p.position,
      'Age':            p.age != null ? p.age : null,
      'KTC Value':      p.ktc_value || 0,
      'Combined Score': p.ktc_value || 0,
      'Tier':           p.tier || null,
      'Avg PPG':        0,
      'On Taxi':        'False',
      'Sleeper ID':     p.sleeper_id,
    }))
  })

  playerUniverse = mergePlayerStats(playerUniverse, playerStats, false)
  leagueRosters  = mergePlayerStats(leagueRosters, playerStats, false)

  const { shareByOwner, rankByOwner } = computeProductionShares(playerUniverse)

  // pickPortfolio — derived from rosters picks; Original Owner unknown for external leagues
  const pickPortfolio = rosters.flatMap(r => {
    const dn = r.display_name || r.team_name
    return (r.picks || []).map(pick => {
      const { year, tier, round } = parsePickName(pick.pick_name)
      return {
        'Year':           year,
        'Round':          round,
        'Tier':           tier,
        'Current Owner':  dn,
        'Original Owner': dn,
        'KTC Value':      pick.ktc_value || 0,
        'Pick Name':      pick.pick_name,
      }
    })
  })

  // Competitive Window + pick-year draft status — mirrors wilsons_teams.py cells 17/17b.
  // currentDraftYear follows the same definition as the notebook's CURRENT_DRAFT_YEAR
  // (current_season + 1); Sleeper's league.season is used as current_season since /api/league
  // already derives its own pick-generation years from the equivalent server-side calculation.
  const currentSeason    = parseInt(leagueRes.season) || new Date().getFullYear()
  const currentDraftYear = currentSeason + 1
  const competitiveWindow = computeCompetitiveWindow(playerUniverse, pickPortfolio, rosters, currentDraftYear)

  // teamOverview — derived from rosters; Outlook computed server-side in /api/league;
  // Production Share/Rank/Gap computed from merged playerUniverse's Multi-Year Prod Score;
  // Competitive Window + pick-year fields computed above
  const teamOverview = sortedByValue.map((r, i) => {
    const playerVal   = (r.players || []).reduce((s, p) => s + (p.ktc_value || 0), 0)
    const pickVal     = (r.picks   || []).reduce((s, p) => s + (p.ktc_value || 0), 0)
    const dn          = r.display_name || r.team_name
    const valueShare  = totalLeagueValue > 0 ? +((r.total_ktc || 0) / totalLeagueValue * 100).toFixed(1) : 0
    const prodShare   = shareByOwner[dn] || 0
    return {
      'Owner':              dn,
      'display_name':       dn,
      'Value Rank':         i + 1,
      'Outlook':            r.outlook || null,
      'Player Value':       playerVal,
      'Pick Value':         pickVal,
      'Total Value':        r.total_ktc || 0,
      'Value Share %':      valueShare,
      'Production Share %': prodShare,
      'Production Rank':    rankByOwner[dn] || null,
      'Gap':                +(valueShare - prodShare).toFixed(2),
      'C+F Total':          r.cf_total || 0,
      ...(competitiveWindow[dn] || {}),
    }
  })

  // rosterGrades — derived from positional KTC sums; used for rankings in Home + TradeCalculator.
  // Top Player = highest-KTC player at that position (simplified proxy — Wilson's cron uses a
  // 70/30 starter/bench Combined Score average via get_starters(), not reproduced client-side here).
  const rosterGrades = rosters.map(r => {
    const byPos     = { QB: 0, RB: 0, WR: 0, TE: 0 }
    const topPlayer = { QB: null, RB: null, WR: null, TE: null }
    ;(r.players || []).forEach(p => {
      if (Object.prototype.hasOwnProperty.call(byPos, p.position)) {
        byPos[p.position] += (p.ktc_value || 0)
        if (!topPlayer[p.position] || (p.ktc_value || 0) > (topPlayer[p.position].ktc_value || 0)) {
          topPlayer[p.position] = p
        }
      }
    })
    const dn = r.display_name || r.team_name
    return {
      'Owner':          dn,
      'QB Starter Val': byPos.QB,
      'RB Starter Val': byPos.RB,
      'WR Starter Val': byPos.WR,
      'TE Starter Val': byPos.TE,
      'QB Grade':       byPos.QB,
      'RB Grade':       byPos.RB,
      'WR Grade':       byPos.WR,
      'TE Grade':       byPos.TE,
      'QB Top Player':  topPlayer.QB?.name || 'None',
      'RB Top Player':  topPlayer.RB?.name || 'None',
      'WR Top Player':  topPlayer.WR?.name || 'None',
      'TE Top Player':  topPlayer.TE?.name || 'None',
    }
  })

  const ktcRankings = ktcRes.players || []
  const pickValues  = ktcRes.picks   || []

  return {
    teamOverview,
    playerUniverse,
    rosterGrades,
    leagueRosters,
    pickPortfolio,
    standings,
    ktcRankings,
    pickValues,
    // Wilson's-only data: return empty/null for external leagues
    positionalProportion: null,
    tradeTargets:         [],
    tradeHistory:         [],
    historyStandings:     [],
    historyAllTime:       [],
    historyChampions:     [],
    historyTopWeeks:      [],
    historyPlayerGames:   [],
    historyBrackets:      [],
    powerRankings:        null,
    valueHistory:         null,
    playoffPicture:       null,
    qbSeasonStats:        [],
    rbSeasonStats:        [],
    wrSeasonStats:        [],
    teSeasonStats:        [],
    lastUpdated: new Date().toLocaleString(),
  }
}

export async function loadAllData(leagueId) {
  if (leagueId !== WMH_ID) {
    return loadExternalLeagueData(leagueId)
  }

  // Wilson's Moms House — load from static files (existing behavior)
  const [
    teamOverview,
    playerUniverse,
    rosterGrades,
    positionalProportion,
    pickPortfolio,
    tradeTargets,
    ktcRankings,
    leagueRosters,
    standings,
    qbSeasonStats,
    rbSeasonStats,
    wrSeasonStats,
    teSeasonStats,
    pickValues,
    tradeHistory,
    historyStandings,
    historyAllTime,
    historyChampions,
    historyTopWeeks,
    historyPlayerGames,
    historyBrackets,
    powerRankings,
    valueHistory,
    playoffPicture,
    playerStats,
  ] = await Promise.all([
    fetchJSON('teamOverview.json'),
    fetchJSON('playerUniverse.json'),
    fetchJSON('rosterGrades.json'),
    fetchJSON('positionalProportion.json'),
    fetchJSON('pickPortfolio.json'),
    fetchJSON('tradeTargets.json'),
    fetchJSON('ktcRankings.json'),
    fetchJSON('leagueRosters.json'),
    fetchStandings(leagueId),
    fetchJSON('qbSeasonStats.json'),
    fetchJSON('rbSeasonStats.json'),
    fetchJSON('wrSeasonStats.json'),
    fetchJSON('teSeasonStats.json'),
    fetchJSON('pickValues.json'),
    fetchJSON('tradeHistory.json'),
    fetchJSON('historyStandings.json'),
    fetchJSON('historyAllTime.json'),
    fetchJSON('historyChampions.json'),
    fetchJSON('historyTopWeeks.json'),
    fetchJSON('historyPlayerGames.json'),
    fetchJSON('historyBrackets.json'),
    fetchJSON('power_rankings.json'),
    fetchJSON('valueHistory.json'),
    fetchJSON('playoffPicture.json').catch(() => null),
    fetchPlayerStats(leagueId),
  ])

  return {
    teamOverview,
    playerUniverse: mergePlayerStats(playerUniverse, playerStats, true),
    rosterGrades,
    positionalProportion,
    pickPortfolio,
    tradeTargets,
    ktcRankings,
    leagueRosters: mergePlayerStats(leagueRosters, playerStats, true),
    standings,
    qbSeasonStats,
    rbSeasonStats,
    wrSeasonStats,
    teSeasonStats,
    pickValues,
    tradeHistory,
    historyStandings,
    historyAllTime,
    historyChampions,
    historyTopWeeks,
    historyPlayerGames,
    historyBrackets,
    powerRankings,
    valueHistory,
    playoffPicture,
    lastUpdated: new Date().toLocaleString(),
  }
}
