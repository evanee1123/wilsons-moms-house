const BASE       = '/data'
const LEAGUE_ID  = process.env.REACT_APP_LEAGUE_ID
const SLEEPER    = 'https://api.sleeper.app/v1'

async function fetchJSON(filename) {
  const res = await fetch(`${BASE}/${filename}`)
  if (!res.ok) throw new Error(`Failed to fetch ${filename}`)
  return res.json()
}

async function fetchSleeper(path) {
  const res = await fetch(`${SLEEPER}${path}`)
  return res.json()
}

async function fetchStandings() {
  const rosters = await fetchSleeper(`/league/${LEAGUE_ID}/rosters`)
  const users   = await fetchSleeper(`/league/${LEAGUE_ID}/users`)

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

export async function loadAllData() {
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
  ] = await Promise.all([
    fetchJSON('teamOverview.json'),
    fetchJSON('playerUniverse.json'),
    fetchJSON('rosterGrades.json'),
    fetchJSON('positionalProportion.json'),
    fetchJSON('pickPortfolio.json'),
    fetchJSON('tradeTargets.json'),
    fetchJSON('ktcRankings.json'),
    fetchJSON('leagueRosters.json'),
    fetchStandings(),
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
    lastUpdated: new Date().toLocaleString(),
  }
}