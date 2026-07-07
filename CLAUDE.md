# Dynasty Fantasy Football — Project Brief for Claude Code

This file is the source of truth for Claude Code. Read it fully before making any changes.

---

## Project Overview

Two dynasty fantasy football analytics platforms built with:
- **Python notebooks** → JSON files → **React websites** deployed on **Vercel**
- Both leagues are fully built and maintained in parallel

### League 1: Wilson's Moms House
- Sleeper League ID: `1312130103358021632`
- Username: `ekleiner1123`
- Notebook: `~/wilsons-moms-house/notebooks/wilsons_teams.ipynb`
- Script: `~/wilsons-moms-house/notebooks/wilsons_teams.py`
- Run script: `~/wilsons-moms-house/notebooks/run_wilsons.sh`
- GitHub: `https://github.com/evanee1123/wilsons-moms-house`
- Site: `https://wilsons-moms-house.vercel.app`
- Data output: `~/wilsons-moms-house/public/data/`
- Firebase project: `wilsons-moms-house`
- GitHub Actions workflow: `.github/workflows/update_data.yml`

### League 2: CLTC 8 2017
- Sleeper League ID: `1312132151843491840`
- Site: `https://cltcdynasty.vercel.app`
- Notebook: `~/wilsons-moms-house/notebooks/cltc_teams.ipynb`
- Script: `~/wilsons-moms-house/notebooks/cltc_teams.py`
- Data output: `~/wilsons-moms-house/cltc-dynasty/public/data/`
- Firebase project: `cltc-dynasty`
- Admin username: `ekleiner1123` (same as Wilson's)
- GitHub Actions workflow: `.github/workflows/update_cltc_data.yml`

---

## Repo Structure

```
~/wilsons-moms-house/
  CLAUDE.md                  ← this file
  HANDOFF.md                 ← session handoff notes
  .github/
    workflows/
      update_data.yml        ← Wilson's auto-update (Sun/Thu 8am CST)
      update_cltc_data.yml   ← CLTC auto-update (Sun/Thu 8am CST)
      power_rankings.yml     ← Wilson's Power Rankings (every Tuesday 15:00 UTC / 9am CT)
  scripts/
    classify_tiers.py        ← AI tier classifier (Wilson's only) — standalone, run manually 2-5x/year
  notebooks/
    wilsons_teams.ipynb
    wilsons_teams.py
    cltc_teams.ipynb
    cltc_teams.py
    power_rankings.ipynb     ← Power Rankings notebook (Wilson's only)
    run_wilsons.sh
    run_log.txt
  public/
    data/                    ← Wilson's JSON files (written by notebook, read by React)
  src/                       ← Wilson's React app
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
      PowerRankings.js
      Blueprint.js
    services/
      dataService.js
    utils/
      tradeLogic.js          ← stud tax, fit scoring, trade compatibility
      playerUtils.js         ← normalizeName(), findPlayerByName() — strips periods/suffixes
    App.jsx
    index.js
  cltc-dynasty/              ← CLTC React app (separate Vercel project)
    package.json
    .env                     ← gitignored — Firebase keys only
    public/
      data/                  ← CLTC JSON files (written by cltc_teams.py)
    src/
      components/
        PlayerDetailModal.jsx
        Sidebar.js
      pages/
        Home.jsx
        TeamDeepDive.jsx
        PlayerRankings.jsx
        PickPortfolio.jsx
        TradeCalculator.jsx
        TradeHistory.jsx
        LeagueHistory.jsx
        Blueprint.js
        Login.jsx
        Signup.jsx
      services/
        blueprintService.js
        dataService.js
      utils/
        tradeLogic.js
        playerUtils.js
      contexts/
        AuthContext.js
      hooks/
        useData.js
      firebase.js
      App.js
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

## League Settings — CLTC 8 2017

```python
PURE_STARTERS = {"QB": 1, "RB": 2, "WR": 3, "TE": 1}
FLEX_SPOTS = [
    {"name": "FLEX", "eligible": ["WR", "RB", "TE"], "count": 2},
    {"name": "SFLX", "eligible": ["QB", "WR", "RB", "TE"], "count": 1},
]
```

---

## Data Pipeline

1. Python notebook/script runs analysis
2. Writes JSON files to `public/data/` (Wilson's) or `cltc-dynasty/public/data/` (CLTC)
3. React app fetches JSON files via `fetchJSON()` in `dataService.js`
4. No Google Sheets dependency — fully JSON-based

### Auto-Update Schedule
- Runs via **GitHub Actions** every **Sunday and Thursday at 14:00 UTC** (8am CST)
- Wilson's workflow: `.github/workflows/update_data.yml`
- CLTC workflow: `.github/workflows/update_cltc_data.yml`
- After each run, JSON files are automatically committed and pushed to the repo
- Vercel auto-deploys on each push (both leagues have their own Vercel project)
- `OUTPUT_DIR` in both scripts uses a relative path via `os.path.dirname(os.path.abspath(__file__))`
  so the script works whether run locally or via GitHub Actions

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
power_rankings.json       — AI-generated weekly power rankings (Wilson's only)
                            schema: { generated_at, rankings: [{ rank, team_name, owner, outlook, blurb }] }
schedule.json             — real Sleeper matchup pairings per week for the current season (Wilson's only)
                            schema: { season, weeks, source, scores_recorded, note, schedule: [{ week, matchups: [[owner, owner], ...] }] }
playoffPicture.json       — Playoff Picture Monte Carlo simulation results (Wilson's only)
                            schema: { generated_at, season, weeks_simulated, weeks_played, current_week, season_started,
                                      playoff_spots, iterations, teams: [{ owner, team_name, playoff_pct, blended_ppg,
                                      historical_ppg, roster_strength_score, current_wins, current_losses, outlook }] }
playerTiers.json          — AI-classified tier per rostered player (Wilson's only) — source of truth for Wilson's
                            player tiers. schema: { "Player Name": "Tier Name" }. Produced by scripts/classify_tiers.py
                            (not part of the regular notebook run) and read by wilsons_teams.py's tier assignment
                            section on every notebook run — see "AI Tier Classifier" below.
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

Tiers are AI-classified — see "AI Tier Classifier" below. `wilsons_teams.py`'s tier-assignment section
(cell "10. AI-Classified Tier Assignment") looks each player up in `public/data/playerTiers.json`
(falling back to `difflib.get_close_matches` at cutoff 0.85 for name mismatches, then a KTC-threshold
tier as a last-resort safety net) instead of computing a tier from a formula. The old formula-based
`score_rb`/`score_wr`/`score_te`/`score_qb` functions and the nflfastR EPA/snap-count/target-share/
red-zone/draft-capital pulls that fed them have been removed from the notebook — they are no longer
needed for tier assignment. (`gsis_id` — used for career season stats matching and by
`PlayerDetailModal.jsx` — is still derived from nflfastR's player table, since that's unrelated to
tier scoring.)

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
| Power Rankings | /powerrankings | AI-generated weekly dynasty power rankings with smack-talk blurbs |
| My Blueprint | /blueprint | Personalized roster analysis, trade strategy, priorities (login required) |

### Shared Components
- `PlayerDetailModal` — career stats, advanced stats, overview. Used in PlayerRankings, TeamDeepDive, TradeCalculator.
  **Advanced stats section (EPA vs Avg, Snap Pct, Target Share, YPRR, RZ Carries, Rush Yards/TDs, Draft
  Value/Round/Pick, Games Played) renders blank as of the AI tier classifier migration** — the nflfastR
  pulls that populated those `playerUniverse.json` fields were removed from `wilsons_teams.py` since tier
  assignment no longer needs them. Not fixed as part of that migration; revisit if this section should
  be restored via a dedicated (non-tier-scoring) data pull.
- `Sidebar` — navigation with owner selector

### Blueprint Page Sections (src/pages/Blueprint.js)
Sections render in this order:
1. **Roster Composition Goals** — auto-generated goals based on outlook + custom goals. Firestore-backed per uid (`users/{uid}/goals`). Goals re-generate when outlook changes.
2. **Watchlist** — player/pick monitor list. Firestore-backed per uid (`users/{uid}/watchlist`). Shows KTC, tier, owner, "Might sell" badge if owner is Rebuild/Reload.
3. **Value Proportion card** — single card with three side-by-side columns:
   - Left: `ValueProportionSection` — filled pie chart of QB/RB/WR/TE/Picks % of total value. Data from `positionalProportion.json` + `pickPortfolio.json`. Labels on slices ≥8%.
   - Middle: `RosterMakeupSection` — tier breakdown with colored pill badges sorted by count descending. Outlook-specific target line (C+F count for Contender, Upside Premier+Shot count for Rebuild).
   - Right: `AverageStarterAgeSection` — avg starter age by position using full lineup settings. Color coded green/yellow/red by position thresholds (QB ≤29/30-31/≥32, RB ≤26/27/≥28, WR ≤27/28/≥29, TE ≤27/28/≥29).
4. **Trade Strategy** — dynamic strategy label (green/yellow/red badge) + description based on outlook/value rank/roster makeup. Shows 3 target acquisition player cards filtered by outlook and weakest positional grade, favoring Rebuild/Reload sellers. Data from `teamOverview.json`, `playerUniverse.json`, `rosterGrades.json`.
5. **Top Priorities** — 3 priority items with emoji icons (🏆🔄📋). Priority 1: outlook + value rank + C+F Total. Priority 2: tier surplus vs outlook. Priority 3: weakest positional grade.
6. **Personalized Trade Suggestions** — buy/sell suggestions. Firestore-backed dismissals (`users/{uid}/dismissedSuggestions`) and saves (`users/{uid}/savedSuggestions`).
7. **Trade Finder** — find fair trade packages from other rosters. TF v1 with Cornerstone-specific logic (see below).

### Trade Finder Key Behaviors (Blueprint.js — findTrades())
- **Normal fairness gate**: `ratio >= 0.90 && ratio <= 1.10`
- **Cornerstone give-side** (`requireFirstRound === true`): gate is `ratio >= 1.00 && ratio <= 1.35`; candidate pool pre-sorted to float 1st-round-pick packages first
- **Template reordering** (post-dedup): qualifying results (Template A: 2+ 1sts; Template B: Cornerstone return OR Foundational + 1st) floated above non-qualifying results; Foundational give-side has relaxed version
- **Player name normalization**: all lookups use `findPlayerByName()` from `src/utils/playerUtils.js` — handles `D.J. Moore` vs `DJ Moore`, `Kenneth Walker III` vs `Kenneth Walker`, etc.

---

## Power Rankings Notebook (Wilson's Only)

**Notebook:** `notebooks/power_rankings.ipynb`
**Workflow:** `.github/workflows/power_rankings.yml` — every **Tuesday at 15:00 UTC** (9am CT)
**Output:** `public/data/power_rankings.json`

### How it works
1. Pulls Sleeper users + rosters for owner display names and custom team names (`metadata.team_name`)
2. Reads existing JSON files from `public/data/` — does **not** re-derive anything already calculated:
   - `teamOverview.json` — outlook, value rank, C+F total, draft capital
   - `playerUniverse.json` — KTC values, tiers, positional depth per team
   - `rosterGrades.json` — positional grades (QB/RB/WR/TE)
   - `tradeHistory.json` — recent trades with WIN/LOSS/FAIR surplus grades
   - `positionalProportion.json` — value split by position
3. Formats all 10 teams into a single structured prompt
4. One Anthropic API call (`claude-sonnet-4-6`) with a savage beat-writer system prompt — model determines the ranking order from the data, writes 3–5 sentence blurbs per team
5. Parses JSON response, adds `generated_at` UTC timestamp, writes output

### Output schema
```json
{
  "generated_at": "2026-06-10T15:00:00Z",
  "rankings": [
    { "rank": 1, "team_name": "...", "owner": "...", "outlook": "Contender", "blurb": "..." }
  ]
}
```

### API key setup
- **Locally:** add `ANTHROPIC_API_KEY=your-key` to `.env` in the repo root. The notebook loads it via `find_dotenv(usecwd=True)`, which searches upward from `notebooks/` and finds the root-level `.env`.
- **GitHub Actions:** add `ANTHROPIC_API_KEY` as a repository secret — Settings → Secrets and variables → Actions → New repository secret.
- **Required Python packages:** `anthropic`, `python-dotenv` — installed inline in the workflow, not in a requirements file.

### React integration
- `src/pages/PowerRankings.js` — rank number color-coded (gold #1, green top 3, orange 7–8, red 9–10), outlook badges use existing `badge-green/orange/blue/red` classes, AI disclaimer footer with last-updated date from `generated_at`
- Added to `dataService.js` (`fetchJSON('power_rankings.json')` in `Promise.all`), `App.js` (`powerrankings` route), and `Sidebar.js` (nav item between League History and My Blueprint)
- **CLTC does not have this feature** — do not add it there

---

## AI Tier Classifier (Wilson's Only)

**Script:** `scripts/classify_tiers.py` — standalone, **not** part of the regular `wilsons_teams.py`
notebook run and **not** triggered by any GitHub Actions workflow. Run manually **2-5x per year**
(e.g. after a significant chunk of the season has played out, or before a draft) whenever tiers need
refreshing.

### How it works
1. Reads `public/data/playerUniverse.json` (rostered players, current tier as prior) and
   `public/data/ktcRankings.json` (KTC values)
2. Builds a single prompt containing the 12 tier definitions, every rostered player's name/position/
   age/KTC value/current tier/avg PPG/seasons played, and instructions to use the current tier as a
   strong prior — only change it with high confidence, and to return ONLY a JSON array
3. One Anthropic API call (`claude-sonnet-4-6`)
4. Parses the response, prints a comparison of which players changed tier and why, and writes
   `public/data/playerTiers.json` — schema `{ "Player Name": "Tier Name" }`

### Running it
```bash
cd ~/wilsons-moms-house
python3 scripts/classify_tiers.py
```
Requires `ANTHROPIC_API_KEY` — same `.env`-in-repo-root setup as the Power Rankings notebook (see
above). Requires the `anthropic` and `python-dotenv` packages.

### Output is the source of truth for Wilson's tiers
`public/data/playerTiers.json` is read directly by `wilsons_teams.py` on every regular notebook run
(cell "10. AI-Classified Tier Assignment") — the notebook does **not** call the Anthropic API itself,
it just looks up each player's tier from this file (via exact match, then `difflib.get_close_matches`
at cutoff 0.85 for name mismatches, then a KTC-threshold tier as a last-resort fallback for anyone
missing from the file entirely). Review the printed tier-change comparison from a classifier run
before committing an updated `playerTiers.json` — it is not auto-applied.

- **CLTC does not have this feature** — do not add it there

---

## Authentication & Firebase

Both leagues use Firebase Authentication (email/password) and Firestore.

**Signup flow:**
1. User enters email, password, Sleeper username
2. Verify Sleeper username exists via `https://api.sleeper.app/v1/user/{username}`
3. Verify user is in the league via `https://api.sleeper.app/v1/league/{LEAGUE_ID}/users`
4. Create Firebase Auth account
5. Write Firestore profile: `{ uid, email, sleeperUsername, rosterOwnerName, createdAt }`
6. `rosterOwnerName` = `member.display_name || sleeperUsername` (matches `Owner` field in JSON data)

**Login:** accepts email or Sleeper username. Username lookup queries Firestore for matching `sleeperUsername`.

**Admin mode (`ekleiner1123`):**
- "View As" dropdown appears in sidebar when logged in as admin
- Selecting a manager overrides `rosterOwnerName` for the session only
- Yellow "Admin view" indicator shown when active
- Watchlist and goals always load for the real logged-in uid — never swapped by view-as

**Auth rules:**
- `/blueprint` requires login. All other pages are public.
- Sidebar shows Login/Signup when logged out, username + Logout when logged in.

---

## Security

- `.env` files are gitignored and must **never** be committed
- All Firebase keys are stored as **Vercel environment variables** per project
- Required env vars for both apps:
  ```
  REACT_APP_FIREBASE_API_KEY
  REACT_APP_FIREBASE_AUTH_DOMAIN
  REACT_APP_FIREBASE_PROJECT_ID
  REACT_APP_FIREBASE_STORAGE_BUCKET
  REACT_APP_FIREBASE_MESSAGING_SENDER_ID
  REACT_APP_FIREBASE_APP_ID
  REACT_APP_LEAGUE_ID
  ```
- Wilson's Firebase project: `wilsons-moms-house`
- CLTC Firebase project: `cltc-dynasty`
- Firestore rules must allow subcollection reads: `match /users/{userId}/{subcollection}/{document}`
- `ANTHROPIC_API_KEY` — required for Power Rankings notebook. Local: `.env` in repo root (gitignored). CI: GitHub Actions secret.

---

## Important Design Decisions

- **No hardcoded years anywhere** — always derive from `YEARS`, `CURRENT_DRAFT_YEAR`, or `current_season`
- **Pick adjustments use `YEARS[1]` and `YEARS[2]` only** — never `YEARS[0]` or `YEARS[3]`
- **All Firebase keys in environment variables** — never committed to git
- **Existing pages stay public** — only `/blueprint` requires login
- **Admin mode** — `ekleiner1123` can view as any manager, with visual indicator
- **Cross-device sync** — all personalized data (watchlist, goals, dismissals) syncs via Firestore when logged in
- **Both leagues are now fully built and maintained in parallel** — changes to shared logic (tradeLogic.js, playerUtils.js, Blueprint sections) should be applied to both `src/` and `cltc-dynasty/src/`
- **`rosterOwnerName` must match `Owner` field in teamOverview.json** — this is set at signup from `member.display_name`. If it doesn't match, Blueprint sections that filter by owner will silently show empty data.

---

## Known Python Compatibility Notes

These issues arise when running on **Python 3.11** (used by GitHub Actions):

- **`include_groups=False` in `.groupby().apply()`** — not supported in Python 3.11. Remove this argument if it appears; the behavior is the same without it.
- **Backslashes inside f-string `{}` expressions** — not allowed in Python 3.11. Extract to a variable first:
  ```python
  # Bad (Python 3.12+ only):
  f"{'\n'.join(items)}"
  # Good:
  joined = '\n'.join(items)
  f"{joined}"
  ```

---

## Trade Calculator Details

The trade calculator (both leagues) uses **Combined Score = 70% KTC + 30% Production** as its base, with these dynamic adjustments applied on top:

- **Stud tax**: applied when give side and receive side have unequal top assets. Uses raw KTC only — Combined Score is for display totals only.
  - Formula: `adj = round(topKtc × baseRate(topKtc) × studMult × dilution)`
  - `baseRate` is quadratic clamped to [0.30, 0.65]: `1.2803 - 0.00028679×topKtc + 0.000000021420×topKtc²`
  - `studMult = 1.0 + max(0, (topKtc - 5000) / 100) * 0.001`
  - `dilution = topKtc / studSideTotal`
  - Applied to the side with the higher top asset (not always the give side)
- **Need-based multiplier**: +5% max, only for players with KTC > 4500 at a position where the user ranks bottom 3
- **QB need uses top 2 QBs** (superflex league) — both must rank bottom 3 to trigger
- **Roster context adjustment**: Rebuild receives young players +8%, Contender receives young players -5%
  - `isYoungUpside` tiers: Cornerstone, Upside Premier, Upside Shot only
- **Pick outlook adjustment** (YEARS[1] and YEARS[2] only):
  - Rebuild original owner: +12%, Contender original owner: -10%
- **Team fit indicator** shows which teams might want your assets based on positional need and outlook

---

## League History

### Wilson's Moms House
- 2024: Startup season, Herschey6153 won
- 2025: GreyWaedekin27 won
- 2026: Current season (0-0)

Previous League IDs:
- 2026: 1312130103358021632
- 2025: 1180412578760568832
- 2024: 1059644450785304576

---

## Improvement Roadmap

### Phase 1 — New Features
1. **Competitive Window / Age Runway** — core age, peak window years, projected value curve by year, age runway bar (Young/Prime/Late Prime/Aging). Add to Team Deep Dive and Blueprint pages.
2. **Dynasty Matrix** — grid of Rising/Prime/Aging player counts by position. Add to Team Deep Dive.
3. **Prime Windows Chart** — horizontal per-player timeline showing Rising → Prime → Declining phases sorted by value. Add to Team Deep Dive.
4. **Position Distribution with Age Buckets** — Under 23 / 23-26 / 27-30 / 31+ player counts with value. Add to Team Deep Dive.
5. **Trade Value Trajectory** — line chart of roster KTC value over time. Requires snapshot storage strategy. Add to Home or Blueprint.

### Phase 2 — Existing Feature Upgrades
6. **BUY/SELL/HOLD Signal + Hype %** column on Team Deep Dive roster table.
7. **Pick Portfolio visual card upgrade** — year-grouped cards with Sent badges like Dynatyze.
8. **Power Rankings bar chart** alongside AI narratives.
9. **Blueprint trade targets visual upgrade**.

### Phase 3 — Future
10. **Multi-league / Sleeper username input** — full architectural rework to support any user entering their Sleeper league ID and pulling their own league data dynamically.

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
jupyter nbconvert --to script cltc_teams.ipynb --output cltc_teams

# Deploy (both leagues auto-deploy on push via Vercel)
cd ~/wilsons-moms-house
git add . && git commit -m "message" && git push

# Trigger manual GitHub Actions run
# Go to: https://github.com/evanee1123/wilsons-moms-house/actions
# Select "Update Data" (Wilson's) or "Update CLTC Data" (CLTC) → Run workflow

# Run Power Rankings notebook manually (from repo root)
cd ~/wilsons-moms-house/notebooks
jupyter nbconvert --to notebook --execute power_rankings.ipynb --output power_rankings.ipynb

# Trigger manual Power Rankings workflow
# Go to: https://github.com/evanee1123/wilsons-moms-house/actions
# Select "Power Rankings" → Run workflow

# ⚠️ Git tip — avoid stash conflicts with auto-generated files
# GitHub Actions pushes new data to public/data/ on Sun/Thu. Before committing local
# code changes, discard auto-generated files so they don't conflict:
git restore public/data/ notebooks/tableau_exports/ notebooks/wilsons_teams.ipynb
# Then: git add <your actual changed files> && git commit && git push

# Install dependencies (run from the relevant app directory)
cd ~/wilsons-moms-house && npm install
cd ~/wilsons-moms-house/cltc-dynasty && npm install
```
