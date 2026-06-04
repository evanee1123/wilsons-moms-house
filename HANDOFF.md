# Session Handoff — Wilson's Moms House

## What Was Built This Session

### Authentication (Complete)
- Firebase Auth with email/password login
- Signup verifies Sleeper username exists in league via API
- Login accepts email OR Sleeper username
- Session persists across devices
- Admin "view as" mode for ekleiner1123 — dropdown in sidebar, visual indicator when active
- All existing pages remain public, only /blueprint requires login

### Trade Calculator Updates (Complete)
- Stud tax completely rewritten to match KTC's methodology:
  - No adjustment on 1v1 trades
  - Top asset across both sides determines which side gets the bonus
  - Formula: `adj = round(topKtc × baseRate(topKtc) × studMult × dilution)`
  - `baseRate` is a quadratic clamped to [0.30, 0.65]: `1.2803 - 0.00028679×topKtc + 0.000000021420×topKtc²`
  - `studMult = 1.0 + max(0, (topKtc - 5000) / 100) * 0.001`
  - `dilution = topKtc / studSideTotal`
  - Stud tax uses raw KTC values only — Combined Score is only for final display totals
- Need-based multiplier: +5% max, only for players with KTC > 4500
- QB need uses top 2 QBs (superflex league) — both must rank bottom 3 to trigger
- Roster context adjustment: Rebuild receives young players +8%, Contender receives young players -5%
- isYoungUpside tiers: Cornerstone, Upside Premier, Upside Shot only (Foundational removed)
- Pick outlook adjustment: YEARS[1] and YEARS[2] only (2027/2028 currently)
  - Rebuild original owner: +12%, Contender original owner: -10%
- Team fit indicator shows which teams might want your assets
- Value adjustment line visible in UI (user preference)

### Blueprint Page (Complete)
- Route: /blueprint, requires login
- All data (goals, watchlist, dismissals) saved to Firestore by uid — never by rosterOwnerName
- Admin view-as does not affect watchlist or goals — always loads logged-in user's uid data

#### Blueprint Sections (in render order)
1. **Roster Composition Goals** — auto-generated + custom goals, Firestore-backed
2. **Watchlist** — player/pick monitor list, Firestore-backed
3. **Value Proportion card** (single card with three columns):
   - Left: `ValueProportionSection` — filled pie chart (QB/RB/WR/TE/Picks % of total value). Data from `positionalProportion.json` + `pickPortfolio.json`. Labels on slices ≥8%.
   - Middle: `RosterMakeupSection` — tier breakdown with colored pill badges sorted by count descending. Outlook-specific target line (C+F count for Contender, Upside Premier+Shot count for Rebuild).
   - Right: `AverageStarterAgeSection` — avg starter age by position using full lineup settings (QB×1, RB×2, WR×2, TE×1, FLEX WR/RB/TE×2, SFLX QB/WR/RB/TE×1). Color coded green/yellow/red by position thresholds (QB ≤29/30-31/≥32, RB ≤26/27/≥28, WR ≤27/28/≥29, TE ≤27/28/≥29).
4. **TradeStrategySection** — dynamic strategy label (green/yellow/red badge) + description based on outlook/value rank/roster makeup. Shows 3 target acquisition player cards filtered by outlook and weakest positional grade, favoring Rebuild/Reload sellers. Data from `teamOverview.json`, `playerUniverse.json`, `rosterGrades.json`.
5. **TopPrioritiesSection** — 3 priority items with emoji icons (🏆🔄📋). Priority 1: outlook + value rank + C+F Total. Priority 2: tier surplus vs outlook. Priority 3: weakest positional grade.
6. **Personalized Trade Suggestions** — buy/sell suggestions, Firestore-backed dismissals
7. **Trade Finder** — find fair trade packages from other rosters

### Trade Finder Improvements (This Session)
- **`src/utils/playerUtils.js`** (new file) — exports `normalizeName()` and `findPlayerByName()`. Strips periods, suffixes (III, II, IV, Jr, Sr), collapses whitespace. Used in `TradeHistory.js` and `Blueprint.js` for all player name lookups. Fixes `Kenneth Walker III` → `Kenneth Walker`, `D.J. Moore` → `DJ Moore`.
- **Template reordering** — when give side contains a Cornerstone player, results are post-processed into a stable partition: qualifying results (Template A: 2+ 1st round picks; Template B: Cornerstone return, or Foundational + 1st round pick) float to top. Foundational give-side has a relaxed version of the same templates.
- **Cornerstone fairness filter** — when `requireFirstRound === true` (give side has Cornerstone), fairness gate uses `ratio >= 1.00 && ratio <= 1.35` instead of the normal `±10%`. Forces realistic stud-for-stud or slight-overpay returns. Normal trades unchanged.
- **Candidate pool bias** — when `requireFirstRound === true`, `rawCandidates` is stable-partitioned to float packages containing ≥1 first-round pick before non-pick packages, giving them priority through the fairness filter and variety dedup.

### Notebook Fixes (Previous Session — carried forward)
- YEARS extended to 4 years: `[current+1, current+2, current+3, current+4]`
- Synthetic pick generation for furthest year (YEARS[-1])
- Pick tier defaults: Mid for rounds 1/2, Early for rounds 3/4
- Round 4 KTC lookup uses 'Late 3rd'
- pick_value_by_owner excludes YEARS[-1] picks from team value calculations
- teamOverview year columns built dynamically from YEARS

## Known Issues / Remaining Work

### Trade Finder Quality
- Functional and filtering correctly with template reordering and Cornerstone bias
- Results are mathematically fair with stud-appropriate returns
- Ask Evan before touching trade finder logic further

### Value Rankings vs KTC
- Middle 4 teams (ranks 4-8) differ slightly from KTC ordering — acceptable, do not chase

### CLTC Notebook
- Has not been updated with any session fixes
- Do not touch until Evan says Wilson's is complete

### Admin Watchlist Bug
- In admin view-as mode, watchlist and goals still load for viewed team not admin
- Low priority since only admin can view other teams anyway

## Current Pick Value Methodology
- 2026 picks excluded (draft complete)
- 2029 picks excluded from team value % (synthetic, KTC values at 0)
- 2029 picks included in trade calculator and pick portfolio
- Round tiers: 1st/2nd = Mid, 3rd/4th = Early (matching KTC 12-team methodology)
- Round 4 KTC lookup uses 'Late 3rd' value

## File Structure
See CLAUDE.md for full project overview, league settings, roster ID maps, and deployment commands.
