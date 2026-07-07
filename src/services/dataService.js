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
    return res.json()
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

  // teamOverview — derived from rosters; Outlook computed server-side in /api/league;
  // Production Share/Rank/Gap computed from merged playerUniverse's Multi-Year Prod Score
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
    }
  })

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

  // rosterGrades — derived from positional KTC sums; used for rankings in Home + TradeCalculator
  const rosterGrades = rosters.map(r => {
    const byPos = { QB: 0, RB: 0, WR: 0, TE: 0 }
    ;(r.players || []).forEach(p => {
      if (Object.prototype.hasOwnProperty.call(byPos, p.position)) {
        byPos[p.position] += (p.ktc_value || 0)
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
