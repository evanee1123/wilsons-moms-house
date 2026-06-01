# Dynasty Fantasy Football — Project Brief for Claude Code

This file is the source of truth for Claude Code. Read it fully before making any changes.

---

## Project Overview

Two dynasty fantasy football analytics platforms built with:
- **Python notebooks** → JSON files → **React websites** deployed on **Vercel**
- Both leagues share the same codebase pattern

### League 1: Wilson's Moms House (PRIMARY — build here first)
- Sleeper League ID: `1312130103358021632`
- Username: `ekleiner1123`
- Notebook: `~/wilsons-moms-house/notebooks/wilsons_teams.ipynb`
- Script: `~/wilsons-moms-house/notebooks/wilsons_teams.py`
- Run script: `~/wilsons-moms-house/notebooks/run_wilsons.sh`
- GitHub: `https://github.com/evanee1123/wilsons-moms-house`
- Site: `https://wilsons-moms-house.vercel.app`
- Data output: `~/wilsons-moms-house/public/data/`
- Cron job: Runs every Sunday and Thursday at 8am

### League 2: CLTC Dynasty (do not touch until Wilson's is complete)
- Sleeper League ID: `1312132151843491840`
- Site: `https://cltc-dynasty.vercel.app`
- Notebook: `~/wilsons-moms-house/notebooks/cltc_teams.ipynb`

---

## Repo Structure

```
~/wilsons-moms-house/
  CLAUDE.md                  ← this file
  notebooks/
    wilsons_teams.ipynb
    wilsons_teams.py
    cltc_teams.ipynb
    run_wilsons.sh
    run_log.txt
  public/
    data/                    ← JSON files written by notebook, read by React
  src/
    components/
      PlayerDetailModal.jsx
      Sidebar.jsx
    pages/
      Home.jsx
      TeamDeepDive.jsx
      PlayerRankings.jsx
      PickPortfolio.jsx
      TradeCalculator.jsx
      TradeHistory.jsx
      History.jsx
    services/
      dataService.js
    App.jsx
    index.js
```

---

## League Settings — Wilson's Moms House

```python
PURE_STARTERS = {"QB": 1, "RB": 2, "WR": 2, "TE": 1}
FLEX_SPOTS = [
    {"name": "FLEX", "eligible": ["WR", "RB", "TE"], "count": 2},
    {"name": "SFLX", "eligible": ["QB", "WR", "RB", "TE"], "count": 1},
]
```

10 teams. Roster IDs:
| Roster ID | Owner |
|-----------|-------|
| 1 | ekleiner1123 |
| 2 | Herschey6153 |
| 3 | jsinykin |
| 4 | SvenMoney34 |
| 5 | Akracoon |
| 6 | GiantHawkTua |
| 7 | nchernandez19 |
| 8 | sethfriedman12 |
| 9 | GreyWaedekin27 |
| 10 | gavinw20 |

---

## Data Pipeline

1. Python notebook runs analysis
2. Pushes JSON files to `public/data/`
3. React app fetches JSON files via `fetchJSON()` in `dataService.js`
4. No Google Sheets dependency — fully JSON-based

### JSON Files
```
playerUniverse.json       — all players with KTC, production, tier, owner
teamOverview.json         — team outlook, value/production share, draft capital by year
rosterGrades.json         — positional grades per team
positionalProportion.json — positional value breakdown per team
pickPortfolio.json        — all draft picks with owner, year, round, KTC value
pickValues.json           — KTC values for all picks including synthetic future year
ktcRankings.json          — combined player + pick rankings
leagueRosters.json        — per-team rosters
standings.json            — live from Sleeper API
qbSeasonStats.json        — career stats per position
rbSeasonStats.json
wrSeasonStats.json
teSeasonStats.json
tradeTargets.json         — buy/sell suggestions
tradeHistory.json         — retroactive trade grades
historyStandings.json     — historical standings
historyAllTime.json
historyChampions.json
historyTopWeeks.json
historyPlayerGames.json
historyBrackets.json
```

---

## Notebook Key Details

### Dynamic Year Handling
```python
current_season = get_current_season()           # e.g. 2025
CURRENT_DRAFT_YEAR = str(current_season + 1)    # "2026"
YEARS = [
    str(current_season+1),   # "2026"
    str(current_season+2),   # "2027"
    str(current_season+3),   # "2028"
    str(current_season+4),   # "2029" — synthetic picks generated for this year
]
```

### Synthetic Pick Generation (Cell 3)
KTC doesn't have values for the furthest year (`YEARS[-1]`), so we generate them:
- Use `YEARS[-2]` values as baseline
- Apply ±10% random variance per pick
- Loops over all 3 tiers (Early/Mid/Late) × 4 rounds (1st–4th) = 12 synthetic picks
- Re-randomizes each notebook run
- Auto-skipped once KTC adds real values for that year

### Tier System
```
1=Cornerstone, 2=Foundational, 3=Upside Premier, 4=Mainstay,
5=Productive Vet, 6=Short-term Winner, 7=Upside Shot,
8=Short-term Production, 9=Serviceable, 10=Jag Developmental,
11=Jag Insurance, 12=Replaceable
```

### Outlook Classifications
```
Contender, Contender (needs production),
Window Contender,
Reload, Reload (sell vets for youth),
Rebuild, Rebuild (future value)
```

### Stud Tax Adjustment
```python
base_rates = {2: 0.46, 3: 0.55, 4: 0.63, 5: 0.70}
stud_mult = 1.0 + max(0, (top_ktc - 5000) / 100) * 0.003
```

---

## Current Pages

| Page | Route | Description |
|------|-------|-------------|
| Home | /home | League overview, standings, positional rankings |
| Team Deep Dive | /team | Per-team roster, pick portfolio, dynasty health |
| Player Rankings | /players | Full league player table with filters and detail modal |
| Pick Portfolio | /picks | All draft picks by owner |
| Trade Calculator | /trade | Value calculator with stud tax adjustment |
| Trade History | /tradehistory | Retroactive trade grades using current KTC values |
| League History | /history | Champions, all-time standings, playoff brackets, top 10s |

### Shared Components
- `PlayerDetailModal` — career stats, advanced stats, overview. Used in PlayerRankings, TeamDeepDive, TradeCalculator
- `Sidebar` — navigation with owner selector

---

## What We Are Building Next

This is a large feature set. Build in this order, completing each section before moving to the next.

### Phase 1 — Firebase Setup
Set up Firebase project with:
- Firebase Authentication (email/password)
- Firestore database
- Install Firebase SDK in the React app (`npm install firebase`)
- Create `src/firebase.js` config file (use environment variables for all keys — never hardcode)

Required Vercel environment variables to add:
```
REACT_APP_FIREBASE_API_KEY
REACT_APP_FIREBASE_AUTH_DOMAIN
REACT_APP_FIREBASE_PROJECT_ID
REACT_APP_FIREBASE_STORAGE_BUCKET
REACT_APP_FIREBASE_MESSAGING_SENDER_ID
REACT_APP_FIREBASE_APP_ID
```

### Phase 2 — Authentication Flow

**Signup:**
1. User enters: email, password, Sleeper username
2. On submit, verify Sleeper username exists in the league:
   - Hit `https://api.sleeper.app/v1/user/{username}` to confirm user exists
   - Hit `https://api.sleeper.app/v1/league/1312130103358021632/users` to confirm they are in this league
   - If not in league, reject with clear error message
3. Create Firebase Auth account
4. Save to Firestore `users` collection: `{ uid, email, sleeperUsername, rosterOwnerName, createdAt }`
5. `rosterOwnerName` is the display name matched from the roster ID map

**Login:**
1. Email + password via Firebase Auth
2. On success, load their Firestore user doc to get `sleeperUsername` and `rosterOwnerName`
3. All personalized pages use `rosterOwnerName` to filter data

**Admin (ekleiner1123):**
- If logged-in user's `sleeperUsername === 'ekleiner1123'`, show "View As" dropdown in sidebar
- Dropdown lists all 10 managers
- Selecting one overrides `rosterOwnerName` for that session only
- Visual indicator showing "Viewing as [name]" when in admin mode

**Auth Rules:**
- Blueprint page: requires login, shows only logged-in user's data (or admin override)
- All other existing pages: remain public, no login required
- Sidebar shows Login/Signup buttons when logged out, username + logout when logged in

### Phase 3 — Updated Trade Calculator

The trade calculator stays at `/trade` but gets smarter. Build on top of the existing Combined Score (60% KTC + 40% production).

**Dynamic Value Adjustments:**

1. **Roster context adjustment** — when a team is trading away a young high-upside player, that player is worth more to a Rebuilder receiving them than KTC suggests. Adjust receiving value based on outlook fit.

2. **Need-based multiplier** — if the logged-in manager is receiving a player at a position where their roster grade is weak (bottom 3 in league), add a need bonus to that player's value. Show final adjusted number only, not the breakdown.

3. **Pick value adjustment by team outlook** — for picks in the next 1-2 years only (currently 2027 and 2028, derived dynamically as `YEARS[1]` and `YEARS[2]`):
   - A pick from a Rebuild/Rebuild (future value) team is worth MORE (they're likely to be bad = higher pick)
   - A pick from a Contender is worth LESS (they're likely to pick late)
   - Do NOT apply this adjustment to `YEARS[0]` (current draft year) or `YEARS[3]` (furthest synthetic year)

4. **Team fit indicator** — when assets are added to the calculator, show which specific league teams might want what you're offering based on their positional needs and outlook.

**Do not show adjustment breakdowns** — only show the final adjusted value.

### Phase 4 — My Blueprint Page

New route: `/blueprint` — requires login.

**Sections:**

**1. Roster Composition Goals**
- Auto-generated goals based on outlook classification. Examples:
  - Contender: "Target a WR in the top 20 KTC", "Maintain 3+ Cornerstone/Foundational players"
  - Rebuild: "Accumulate 2027/2028 first round picks", "Trade 30+ year old players for youth"
- Manager can add their own custom goals (text input, saved to Firestore)
- Each goal has a dismiss/done button (saved to Firestore)
- Goals re-generate if outlook classification changes

**2. Watchlist**
- Manager adds players or picks they want to monitor
- Saved to Firestore under their UID
- Shows current KTC value, tier, owner, and whether owner's outlook suggests they might sell
- Dismiss button per player

**3. Personalized Trade Suggestions**
- Buy suggestions: players on other rosters that fit this manager's needs, weighted by:
  - Positional need (their weakest position grades)
  - Age fit (Rebuilders want young, Contenders want proven)
  - Whether the current owner might sell (Rebuilders more likely to sell veterans)
- Sell suggestions: players on their roster that don't fit their window or are redundant
- Each suggestion has dismiss/save button, saved to Firestore

**4. Trade Finder**
- Manager inputs 2-3 assets they're willing to give
- System searches all other rosters for fair return packages
- Returns 5 suggested packages
- Each result shows:
  - Assets you give
  - Assets you receive
  - Fit score (how well the return fits your team needs)
  - Trade calculator score (using the dynamic calculator from Phase 3)
  - One-line reason (e.g. "Fills your WR need, fair value")
- Trade logic respects outlook compatibility:
  - Rebuilders are unlikely to trade young players or near-term picks to Contenders
  - Contenders trading with Contenders = window-focused assets
  - Rebuilders trading with Rebuilders = value/youth swaps

---

## Important Design Decisions

- **No hardcoded years anywhere** — always derive from `YEARS`, `CURRENT_DRAFT_YEAR`, or `current_season`
- **Pick adjustments use `YEARS[1]` and `YEARS[2]` only** — never `YEARS[0]` or `YEARS[3]`
- **All Firebase keys in environment variables** — never committed to git
- **Existing pages stay public** — only `/blueprint` requires login
- **Admin mode** — `ekleiner1123` can view as any manager, with visual indicator
- **Cross-device sync** — all personalized data (watchlist, goals, dismissals) syncs via Firestore when logged in
- **CLTC notebook** — do not touch until Wilson's is fully complete

---

## League History

- 2024: Startup season, Herschey6153 won
- 2025: GreyWaedekin27 won
- 2026: Current season (0-0)

Previous League IDs:
- 2026: 1312130103358021632
- 2025: 1180412578760568832
- 2024: 1059644450785304576

---

## Useful Commands

```bash
# Run Wilson's notebook manually
~/wilsons-moms-house/notebooks/run_wilsons.sh

# Check run log
tail -50 ~/wilsons-moms-house/notebooks/run_log.txt

# Reconvert notebook after changes
cd ~/wilsons-moms-house/notebooks
jupyter nbconvert --to script wilsons_teams.ipynb --output wilsons_teams

# Deploy
cd ~/wilsons-moms-house
git add . && git commit -m "message" && git push

# Install Firebase
cd ~/wilsons-moms-house
npm install firebase
```