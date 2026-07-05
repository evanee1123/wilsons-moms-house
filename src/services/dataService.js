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
  const [leagueRes, ktcRes, standings] = await Promise.all([
    fetch(`/api/league?league_id=${leagueId}`).then(r => {
      if (!r.ok) throw new Error(`League API error: ${r.status}`)
      return r.json()
    }),
    fetch('/api/ktc').then(r => r.json()),
    fetchStandings(leagueId),
  ])

  const rosters          = leagueRes.rosters || []
  const totalLeagueValue = rosters.reduce((s, r) => s + (r.total_ktc || 0), 0)
  const sortedByValue    = [...rosters].sort((a, b) => (b.total_ktc || 0) - (a.total_ktc || 0))

  // teamOverview — derived from rosters; no Outlook or production data for external leagues
  const teamOverview = sortedByValue.map((r, i) => {
    const playerVal = (r.players || []).reduce((s, p) => s + (p.ktc_value || 0), 0)
    const pickVal   = (r.picks   || []).reduce((s, p) => s + (p.ktc_value || 0), 0)
    return {
      'Owner':              r.team_name,
      'display_name':       r.display_name || r.team_name,
      'Value Rank':         i + 1,
      'Outlook':            null,
      'Player Value':       playerVal,
      'Pick Value':         pickVal,
      'Total Value':        r.total_ktc || 0,
      'Value Share %':      totalLeagueValue > 0 ? +((r.total_ktc || 0) / totalLeagueValue * 100).toFixed(1) : 0,
      'Production Share %': 0,
      'C+F Total':          0,
    }
  })

  // playerUniverse — flattened from rosters; no Tier/Age/production for external leagues
  const playerUniverse = rosters.flatMap(r =>
    (r.players || []).map(p => ({
      'Player':         p.name,
      'Position':       p.position,
      'KTC Value':      p.ktc_value || 0,
      'Combined Score': p.ktc_value || 0,
      'Owner':          r.team_name,
      'Dynasty Owner':  r.team_name,
      'Tier':           null,
      'Age':            null,
      'Avg PPG':        0,
      'On Taxi':        'False',
      'NFL Team':       null,
    }))
  )

  // leagueRosters — same source as playerUniverse in the leagueRosters shape
  const leagueRosters = rosters.flatMap(r =>
    (r.players || []).map(p => ({
      'Owner':     r.team_name,
      'Player':    p.name,
      'Position':  p.position,
      'Age':       null,
      'KTC Value': p.ktc_value || 0,
    }))
  )

  // pickPortfolio — derived from rosters picks; Original Owner unknown for external leagues
  const pickPortfolio = rosters.flatMap(r =>
    (r.picks || []).map(pick => {
      const { year, tier, round } = parsePickName(pick.pick_name)
      return {
        'Year':           year,
        'Round':          round,
        'Tier':           tier,
        'Current Owner':  r.team_name,
        'Original Owner': r.team_name,
        'KTC Value':      pick.ktc_value || 0,
        'Pick Name':      pick.pick_name,
      }
    })
  )

  // rosterGrades — derived from positional KTC sums; used for rankings in Home + TradeCalculator
  const rosterGrades = rosters.map(r => {
    const byPos = { QB: 0, RB: 0, WR: 0, TE: 0 }
    ;(r.players || []).forEach(p => {
      if (Object.prototype.hasOwnProperty.call(byPos, p.position)) {
        byPos[p.position] += (p.ktc_value || 0)
      }
    })
    return {
      'Owner':          r.team_name,
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
  ])

  return {
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
    lastUpdated: new Date().toLocaleString(),
  }
}
