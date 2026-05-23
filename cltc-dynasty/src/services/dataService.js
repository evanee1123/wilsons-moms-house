const BASE = '/data'

async function fetchJSON(filename) {
  const res  = await fetch(`${BASE}/${filename}`)
  if (!res.ok) throw new Error(`Failed to fetch ${filename}`)
  return res.json()
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
    fetchJSON('standings.json'),
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