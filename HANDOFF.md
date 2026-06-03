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
- Four sections: Roster Composition Goals, Watchlist, Personalized Trade Suggestions, Trade Finder
- All data (goals, watchlist, dismissals) saved to Firestore by uid — never by rosterOwnerName
- Admin view-as does not affect watchlist or goals — always loads logged-in user's uid data

### Trade Finder (Mostly Complete — needs more work)
- findTrades uses KTC values for fairness filter, Combined Score for fit scoring
- Fairness filter: ±10% of displayGive (KTC + stud tax)
- Auto-add: if receive > give by up to 25%, adds one piece from myPool (KTC > 2500) to give side
- Variety dedup: max 2 results with same player on receive side, max 2 results from same team
- QB filter: max 1 QB per package, max 2 QB-heavy results out of 10
- Quality filter: players below KTC 2000 excluded from return packages (picks exempt)
- Package structures: 1-3 players + any number of picks
- Rebuilder stud rule: Cornerstone/Foundational players only tradeable if give side has Cornerstone/Foundational player OR 1st round pick
- Results show: team name, outlook badge, fit score, give value → receive value (KTC + stud tax), assets give, assets receive
- Reason line removed entirely from UI
- 10 results shown
- Version indicator: TF v1 in header

## Notebook Fixes This Session (wilsons_teams.ipynb)

### Cell 1
- YEARS extended to 4 years: `[current+1, current+2, current+3, current+4]`

### Cell 3 (KTC Scraper)
- Synthetic pick generation for furthest year (YEARS[-1])
- Uses YEARS[-2] as baseline, ±10% random variance
- Loops over all 3 tiers × 4 rounds = 12 synthetic picks
- Auto-skips when KTC adds real values

### Cell 8 (Draft Picks)
- Removed redundant `all_picks` reassignment
- Removed `+ [str(current_season + 4)]` fallback from future_years (caused duplicate 2029 picks)
- Added filter to remove CURRENT_DRAFT_YEAR picks from all_picks when draft is complete
- pick_tier_current now converts 10-team slots to 12-team equivalents: `round(slot × 12 / 10)`
- default_future_tier: Mid for rounds 1/2, Early for rounds 3/4
- pick_ktc_name: round 4 future picks look up 'Late 3rd' (matches KTC 12-team methodology)

### Cell 16
- pick_value_by_owner excludes YEARS[-1] picks from team value calculations (KTC values them at 0)

### Cell 17
- Already dynamic — no changes needed

### Cell 23
- teamOverview year columns built dynamically from YEARS (no hardcoded years)
- KTC Rankings uses merged_df instead of rankings_df for player data

## Known Issues / Remaining Work

### Trade Finder Quality
- The trade finder is functional and filtering correctly
- Results are mathematically fair but could be more strategically relevant
- User wants to try one more improvement — ask Evan what it is before touching trade finder code
- Do not touch trade finder without explicit instruction from Evan

### Value Rankings vs KTC
- Top 3 and bottom 2 teams match KTC rankings exactly
- Middle 4 teams (ranks 4-8) are within ~10k of each other and ordering differs slightly from KTC
- This is acceptable — KTC uses proprietary scoring beyond raw value totals
- Do not chase this further unless Evan explicitly asks

### CLTC Notebook
- Has not been updated with any of this session's notebook fixes
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
