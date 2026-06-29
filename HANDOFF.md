# Session Handoff — Dynasty Fantasy Football

## Current State

Both leagues are **fully built and deployed**. The auto-update data pipeline is running on schedule. No outstanding work on either league.

- **Wilson's Moms House**: https://wilsons-moms-house.vercel.app
- **CLTC 8 2017**: https://cltcdynasty.vercel.app

---

## What Was Completed (Most Recent Sessions)

### CLTC Parity (Complete)
- Copied Wilson's `src/` into `cltc-dynasty/src/` as the starting point
- Applied all CLTC-specific changes: branding ("CLTC 8 2017"), Firebase config, league ID, error message copy
- Fixed admin "View As" dropdown — was showing hardcoded Wilson's owner names, now reads dynamically from `owners` prop (derived from `data.teamOverview`)
- Fixed Blueprint page loading spinners stuck indefinitely:
  - Removed `!myOutlook` from `GoalsSection` useEffect guard (was blocking load when owner name didn't match)
  - Added `.catch` handlers to all three loading useEffects (Goals, Watchlist, Suggestions) so Firestore errors surface in the console instead of silently leaving `loading = true`

### GitHub Actions Auto-Update Pipeline (Complete)
- Wilson's: `.github/workflows/update_data.yml` — runs Sun/Thu at 14:00 UTC (8am CST)
- CLTC: `.github/workflows/update_cltc_data.yml` — runs Sun/Thu at 14:00 UTC (8am CST)
- Both workflows commit and push updated JSON files; Vercel auto-deploys on each push
- `OUTPUT_DIR` uses `os.path.dirname(os.path.abspath(__file__))` so scripts work locally and in CI

### Wilson's — Authentication (Complete)
- Firebase Auth with email/password login
- Signup verifies Sleeper username exists in league via API
- Login accepts email OR Sleeper username
- Session persists across devices
- Admin "view as" mode for ekleiner1123 — dropdown in sidebar, visual indicator when active
- All existing pages remain public; only /blueprint requires login

### Wilson's — Trade Calculator Updates (Complete)
- Stud tax rewritten to match KTC's methodology (see CLAUDE.md Trade Calculator Details)
- Need-based multiplier: +5% max, only for players with KTC > 4500
- QB need uses top 2 QBs (superflex) — both must rank bottom 3 to trigger
- Roster context adjustment: Rebuild receives young players +8%, Contender -5%
- Pick outlook adjustment: YEARS[1] and YEARS[2] only
- Team fit indicator shows which teams might want your assets

### Wilson's — Blueprint Page (Complete)
- Route: /blueprint, requires login
- All Firestore data (goals, watchlist, dismissals) saved by uid — never by rosterOwnerName
- Admin view-as does not affect watchlist or goals — always loads logged-in user's uid data
- Sections: Goals → Watchlist → Value Proportion card → Trade Strategy → Top Priorities → Trade Suggestions → Trade Finder

### Wilson's — Power Rankings (Complete)
- **Notebook:** `notebooks/power_rankings.ipynb` — pulls Sleeper users/rosters, reads existing `public/data/` JSONs (teamOverview, playerUniverse, rosterGrades, tradeHistory, positionalProportion), formats a structured prompt, makes one Anthropic API call (`claude-sonnet-4-6`), writes `public/data/power_rankings.json`
- **Workflow:** `.github/workflows/power_rankings.yml` — runs every **Tuesday at 15:00 UTC** (9am CT); requires `ANTHROPIC_API_KEY` as a GitHub Actions repository secret
- **React page:** `src/pages/PowerRankings.js` — rank numbers color-coded (gold #1, green top 3, orange 7–8, red 9–10), outlook badges, AI disclaimer footer with `generated_at` timestamp
- **Wired into:** `dataService.js` (fetches `power_rankings.json`), `App.jsx` (`/powerrankings` route), `Sidebar.jsx` (nav item between League History and My Blueprint)
- **Required Python packages:** `anthropic`, `python-dotenv` — installed inline in the workflow
- **Local API key:** `ANTHROPIC_API_KEY` in `.env` at repo root (gitignored); loaded via `find_dotenv(usecwd=True)` from `notebooks/`
- **CLTC does not have this feature** — not started, do not add

### Wilson's — Trade Finder (Complete)
- `src/utils/playerUtils.js` — `normalizeName()` and `findPlayerByName()` handle name variants
- Template reordering — Cornerstone/Foundational give-side floats qualifying packages to top
- Cornerstone fairness filter — gate widens to `ratio >= 1.00 && ratio <= 1.35` when giving a Cornerstone
- Candidate pool bias — 1st-round-pick packages floated when `requireFirstRound === true`

### Wilson's — Competitive Window Projection Model (Complete)
- Rewrote the "17b. Competitive Window" notebook cell — replaced the flat per-bucket growth/decay
  model with position-specific age curves (Rising/Prime/Late/Decline, separate from the Age Runway
  display buckets) and outlook-aware multipliers on youth growth / pick conversion / aging discount
- Added `"Years to Peak"` field to `teamOverview.json` and a 4th stat card in
  `CompetitiveWindow` (`src/pages/TeamDeepDive.js`), hidden when 0
- Fixed the Value Curve chart's Y-axis to auto-scale (`domain={['auto','auto']}`) instead of starting at 0
- **Two judgment calls made during verification against ekleiner1123's real roster** (flagged to and
  approved by the user, not unilateral):
  - Widened the "Rising" age cutoffs — RB/WR/TE Rising now extends to ≤24 (was ≤22/23), QB to ≤25
    (was ≤24), with Prime/Late/Decline bounds shifted up accordingly. The original cutoffs put common
    24-25yo "ascending star" assets (e.g. a 24-year-old RB1) already in Prime, which contradicted the
    stated expectation that young cores should peak 2-3 years out.
  - Widened the Peak Window membership rule from "within 5% of peak" to "within 10%" — at 5%, no team
    in the league reached a 4+ year window; at 10%, ekleiner1123 (and several others) do.

#### Follow-up: Pick Conversion Model Fix #1 — 100% draft-year value (Superseded by Fix #2 below)
- The original pick conversion (1st picks 60% of KTC value, 2nd 30%, 3rd/4th 10%, injected once in
  the draft year with no further growth) was wrong — picks become young Rising players and should
  keep gaining value after the draft. First attempt: picks converted at 100% of KTC value in the
  draft year, then compounded annually post-draft at a round-scaled share of a 13% league-average
  Rising rate (1st 13%/yr, 2nd 9.75%/yr, 3rd 6.5%/yr, 4th 3.25%/yr), with the existing outlook-aware
  pick multiplier (Rebuild 1.3x, Reload 1.1x, Contender 0.9x) re-applied to the draft-year value.
  This produced unrealistic compounded values (Akracoon +119.7% gain, jsinykin projecting 200K+) and
  was replaced by Fix #2 immediately below in the same session.

#### Follow-up: Pick Conversion Model Fix #2 — draft-year only + value cap (Complete, current)
- Removed post-draft compounding entirely — a pick now adds 100% of its KTC value (scaled by the
  outlook-aware pick multiplier) **only in its draft year**, then contributes nothing in later years.
  The pick's KTC value already prices in the player's projected upside; compounding on top of it was
  double-counting that growth. This makes the curve "lumpy" — a draft class with picks creates a
  spike in that one year, which can recede the following year once those picks no longer contribute —
  this is expected/correct behavior now, not a bug.
- Added a projected value cap: every team's curve is clamped at 1.25x the league's current highest
  `Total Value` (`outlook_df["total_ktc_value"].max()`) before Peak Year/Window/Gain are derived.
  This is an absolute-dollar ceiling, so it doesn't bind for below-average-value teams even with a
  large percentage gain (see Akracoon below) — it only protects against a team's absolute dollars
  blowing past what's realistic league-wide.
- **Verified against all 3 target teams** (judgment call on the remaining gap flagged to and accepted
  by the user):
  - ekleiner1123 → Core Age 23.9, Peak Year 2029, Peak Window 2027–2029, Peak Gain **+15.2%** (within
    the user's 10-20% target)
  - jsinykin → peaks at 157,515 (well under 200K — Fix #2 alone resolved this without the cap needing
    to bind)
  - Akracoon (5x 2028 1sts) → Peak Year 2028, Peak Gain **+62.5%** (down from +119.7%, but still above
    the user's 20-40% target — accepted as a genuine outlier rather than something the cap can fix,
    since Akracoon ranks 8th of 10 in current Total Value and the cap is league-max-relative, not
    per-team-relative)

---

## Known Issues

None currently. Both leagues are stable and auto-updating.

---

## Improvement Roadmap

### Phase 1 — New Features
1. **Competitive Window / Age Runway** — ✅ Done on Team Deep Dive, projection model reworked and verified (see "Wilson's — Competitive Window Projection Model" above for the age-curve/outlook/pick-conversion logic and the two threshold judgment calls made). ⬜ Still needs to be added to the Blueprint page.
2. **Dynasty Matrix** — ✅ Done. `DynastyMatrix` in `src/pages/TeamDeepDive.js`, placed between Competitive Window and Positional Grades vs League. Client-side only (no notebook changes) — buckets `data.leagueRosters` by position (QB/RB/WR/TE) × career phase (Rising/Prime/Aging) using per-position age cutoffs (QB ≤25/26–30/31+, RB ≤24/25–26/27+, WR & TE ≤24/25–28/29+). Cells are clickable and expand a player list below the grid with age + KTC. Wilson's only — not added to CLTC.
3. **Prime Windows Chart** — ✅ Done, including a follow-up fix pass. `PrimeWindowsChart` in `src/pages/TeamDeepDive.js`, placed between Dynasty Matrix and Positional Grades vs League. Client-side only (no notebook changes) — horizontal timeline bars across ages 21–39, colored by phase (Rising orange/Prime green/Declining red→transparent gradient). Wilson's only — not added to CLTC.
   - **Own age-phase thresholds** (`PRIME_WINDOW_CUTOFFS`), separate from Dynasty Matrix's `PHASE_AGE_CUTOFFS`: QB Rising 21–25/Prime 26–33/cliff 39, RB Rising 21–23/Prime 24–27/cliff 33, WR Rising 21–24/Prime 25–30/cliff 36, TE Rising 22–26/Prime 27–30/cliff 36. Cliff is always `primeEnd + 6` (a 5-year fade through Declining).
   - **Declining segment fades to the cliff** via `linear-gradient(to right, #f87171, rgba(248,113,113,0.1))` — solid red at the start of Declining, near-transparent by the cliff age, then the bar ends entirely.
   - **Show All / Show Less** toggle — default view is top 12 by KTC, expands to every roster player (no picks).
   - **Sort controls** (Value/Age/Position) in the card header, top right — apply to both the default and expanded views. Position groups QB→RB→WR→TE (not strict alphabetical — matches the position-order convention used elsewhere in this file), KTC descending within each group.
   - **"Now" indicator** — replaced the old single-row white tick with a full-chart-height white line (2px, opacity 0.6) per player at their current age, rendered in an absolute overlay on top of all rows (`zIndex: 2`), with a "Now" label above each line. Added `boxShadow`/`textShadow` dark halos (not in the original spec) because the site's light theme (`prefers-color-scheme`) made plain white-on-white/light-gray invisible — verified both themes with a headless-Chromium screenshot pass before/after.
4. **Position Distribution with Age Buckets** — ✅ Done. `PositionDistribution` in `src/pages/TeamDeepDive.js`, placed between Dynasty Matrix and Prime Windows Chart. Client-side only (no notebook changes) — buckets `data.leagueRosters` (confirmed flat list with `Owner`/`Player`/`Position`/`Age`/`KTC Value` fields, no PICK rows present) into age rows (Under 23 / 23–26 / 27–30 / 31+) × position columns (QB/RB/WR/TE), color-coded by row (green/blue/amber/red). Cells show player count + summed KTC value and are clickable to expand a player list below the grid (same pattern as Dynasty Matrix). Bottom "Roster Total" row sums each position column across all four age rows. Wilson's only — not added to CLTC.
5. **Trade Value Trajectory** — ✅ Done. `ValueTrajectory` in `src/pages/TeamDeepDive.js`, placed between Dynasty Health and Competitive Window (first chart after the roster table). Storage: `notebooks/wilsons_teams.py` (cell "24. Append Value History Snapshot," in sync with `wilsons_teams.ipynb`) appends a `{ date, teams: { owner: { totalKTC, byPosition: { QB, RB, WR, TE } } } }` snapshot to `public/data/valueHistory.json` after all other JSON files are written, summing KTC straight from `merged_df` (players only, no picks) — no new API calls. Date comes from `date.today().isoformat()`; re-running on the same day overwrites that day's entry instead of duplicating it. Client side: Recharts `LineChart` with one line per team — the selected team renders `strokeWidth 3`/full opacity in the page's accent blue (`#3182ce`), all other teams render `strokeWidth 1`/`opacity 0.3` in neutral gray (`#94a3b8`), tooltip lists every team sorted by value with the selected team bolded. Renders a "Not enough data yet" placeholder until there are 2+ snapshots. Seeded `public/data/valueHistory.json` with one real entry (2026-06-28) derived from `leagueRosters.json` so the chart has data on first deploy; it'll pick up a second point at the next scheduled Sun/Thu run. Wilson's only — not added to CLTC (CLTC has no equivalent snapshot pipeline).

### Phase 2 — Existing Feature Upgrades
6. **BUY/SELL/HOLD Signal + Hype %** column on Team Deep Dive roster table.
7. **Pick Portfolio visual card upgrade** — year-grouped cards with Sent badges like Dynatyze.
8. **Power Rankings bar chart** alongside AI narratives.
9. **Blueprint trade targets visual upgrade**.

### Phase 3 — Future
10. **Multi-league / Sleeper username input** — full architectural rework to support any user entering their Sleeper league ID and pulling their own league data dynamically.

---

## Next Steps

No outstanding work. Next changes will be feature additions or bug fixes as they arise.

When adding features, apply changes to **both** leagues:
- Wilson's: `src/`
- CLTC: `cltc-dynasty/src/`

Shared utilities (`tradeLogic.js`, `playerUtils.js`, Blueprint sections) should stay in sync between both codebases.

---

## Key URLs

| Resource | URL |
|----------|-----|
| Wilson's site | https://wilsons-moms-house.vercel.app |
| CLTC site | https://cltcdynasty.vercel.app |
| GitHub repo | https://github.com/evanee1123/wilsons-moms-house |
| Wilson's GitHub Actions | https://github.com/evanee1123/wilsons-moms-house/actions/workflows/update_data.yml |
| CLTC GitHub Actions | https://github.com/evanee1123/wilsons-moms-house/actions/workflows/update_cltc_data.yml |
| Power Rankings workflow | https://github.com/evanee1123/wilsons-moms-house/actions/workflows/power_rankings.yml |

---

## How to Trigger a Manual Data Update

1. Go to the [GitHub Actions tab](https://github.com/evanee1123/wilsons-moms-house/actions)
2. Select **"Update Data"** (Wilson's) or **"Update CLTC Data"** (CLTC) from the left sidebar
3. Click **"Run workflow"** → **"Run workflow"**
4. The workflow will run the Python script, commit updated JSON files, and push — Vercel deploys automatically

---

## File Structure

See CLAUDE.md for full project overview, league settings, roster ID maps, Firebase setup, and deployment commands.
