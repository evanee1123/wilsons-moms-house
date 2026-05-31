const API_KEY   = process.env.REACT_APP_GOOGLE_SHEETS_API_KEY
const SHEET_ID  = process.env.REACT_APP_SHEET_ID
const LEAGUE_ID = process.env.REACT_APP_LEAGUE_ID

const SHEETS_BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values`
const SLEEPER_BASE = 'https://api.sleeper.app/v1'

// ---- Google Sheets fetchers ----
async function fetchSheet(tabName) {
  const url  = `${SHEETS_BASE}/${encodeURIComponent(tabName)}?key=${API_KEY}`
  const res  = await fetch(url)
  const json = await res.json()
  const [headers, ...rows] = json.values
  return rows.map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] ?? '' })
    return obj
  })
}

async function fetchTradeTargets() {
  const url  = `${SHEETS_BASE}/${encodeURIComponent('Trade Targets')}?key=${API_KEY}`
  const res  = await fetch(url)
  const json = await res.json()
  const rows = json.values

  const result = []
  let headers  = null
  let section  = null

  rows.forEach(row => {
    const first = row[0]?.trim()

    if (first === 'BUY TARGETS') {
      section = 'buy'
      headers = null
      result.push({ Player: 'BUY TARGETS' })
      return
    }

    if (first?.startsWith('SELL CANDIDATES')) {
      section = first
      headers = null
      result.push({ Player: 'SELL CANDIDATES', Owner: first.replace('SELL CANDIDATES - ', '') })
      return
    }

    if (section && !headers && row.some(c => c !== '')) {
      headers = row
      return
    }

    if (headers && row.some(c => c !== '')) {
      const obj = {}
      headers.forEach((h, i) => { obj[h] = row[i] ?? '' })
      result.push(obj)
    }
  })

  return result
}

// ---- Sleeper fetchers ----
async function fetchSleeper(path) {
  const res = await fetch(`${SLEEPER_BASE}${path}`)
  return res.json()
}

// eslint-disable-next-line no-unused-vars
function getCurrentSeason() {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1
  return month >= 9 ? year : year - 1
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

// ---- Main data loader ----
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
    fetchSheet('Team Overview'),
    fetchSheet('Player Universe'),
    fetchSheet('Roster Grades'),
    fetchSheet('Positional Proportion'),
    fetchSheet('Pick Portfolio'),
    fetchTradeTargets(),
    fetchSheet('KTC Rankings'),
    fetchSheet('League Rosters'),
    fetchStandings(),
    fetchSheet('QB Season Stats'),
    fetchSheet('RB Season Stats'),
    fetchSheet('WR Season Stats'),
    fetchSheet('TE Season Stats'),
    fetchSheet('Pick Values'),
    fetchSheet('Trade History'),
    fetchSheet('History Standings'),
    fetchSheet('History All-Time'),
    fetchSheet('History Champions'),
    fetchSheet('History Top Weeks'),
    fetchSheet('History Player Games'),
    fetchSheet('History Brackets'),
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