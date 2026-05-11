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

  // Fetch all 14 regular season weeks
  const weekPromises = Array.from({ length: 14 }, (_, i) =>
    fetchSleeper(`/league/${LEAGUE_ID}/matchups/${i + 1}`)
  )
  const allWeeks = await Promise.all(weekPromises)

  // Calculate record and points per roster
  const stats = {}
  rosters.forEach(r => {
    stats[r.roster_id] = { wins: 0, losses: 0, pf: 0, pa: 0, games: 0 }
  })

  allWeeks.forEach(week => {
    if (!week || week.length === 0) return
    const matchupMap = {}
    week.forEach(team => {
      if (!matchupMap[team.matchup_id]) matchupMap[team.matchup_id] = []
      matchupMap[team.matchup_id].push(team)
    })
    Object.values(matchupMap).forEach(matchup => {
      if (matchup.length !== 2) return
      const [a, b] = matchup
      const aPoints = a.points || 0
      const bPoints = b.points || 0
      stats[a.roster_id].pf    += aPoints
      stats[a.roster_id].pa    += bPoints
      stats[a.roster_id].games += 1
      stats[b.roster_id].pf    += bPoints
      stats[b.roster_id].pa    += aPoints
      stats[b.roster_id].games += 1
      if (aPoints > bPoints) {
        stats[a.roster_id].wins++
        stats[b.roster_id].losses++
      } else {
        stats[b.roster_id].wins++
        stats[a.roster_id].losses++
      }
    })
  })

  return rosters.map(r => ({
    owner:   userMap[r.owner_id] || 'Unknown',
    wins:    stats[r.roster_id]?.wins    || 0,
    losses:  stats[r.roster_id]?.losses  || 0,
    avgPF:   stats[r.roster_id]?.games > 0
               ? (stats[r.roster_id].pf / stats[r.roster_id].games).toFixed(1)
               : '0.0',
    avgPA:   stats[r.roster_id]?.games > 0
               ? (stats[r.roster_id].pa / stats[r.roster_id].games).toFixed(1)
               : '0.0',
  }))
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
    lastUpdated: new Date().toLocaleString(),
  }
}