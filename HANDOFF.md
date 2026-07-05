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
5. **Trajectory Charts — Roster Value + Trade Value, with time range tabs** — ✅ Done.
   - **Roster Value Trajectory** (renamed from "Value Trajectory") — `RosterValueTrajectory` in `src/pages/TeamDeepDive.js`, placed between Dynasty Health and the new Trade Value Trajectory chart (first chart after the roster table). Storage unchanged: `notebooks/wilsons_teams.py` (cell "24. Append Value History Snapshot," in sync with `wilsons_teams.ipynb`) appends a `{ date, teams: { owner: { totalKTC, byPosition: { QB, RB, WR, TE } } } }` snapshot to `public/data/valueHistory.json` after all other JSON files are written, summing KTC straight from `merged_df` (players only, no picks) — no new API calls. Date comes from `date.today().isoformat()`; re-running on the same day overwrites that day's entry instead of duplicating it. Chart: Recharts `LineChart` with one line per team — the selected team renders `strokeWidth 3`/full opacity in the page's accent blue (`#3182ce`), all other teams render `strokeWidth 1`/`opacity 0.3` in neutral gray (`#94a3b8`), tooltip lists every team sorted by value with the selected team bolded.
   - **Trade Value Trajectory** (new) — `TradeValueTrajectory` in `src/pages/TeamDeepDive.js`, placed directly below Roster Value Trajectory. Client-side only, no notebook changes — reads `tradeHistory.json` (already wired into `dataService.js`/`data`), filters to trades where the selected team is `Team A` or `Team B`, sorts chronologically, and computes net KTC per trade as `Team A Face − Team B Face` (raw KTC face value of assets received minus sent, not the stud-tax-`Adjusted` value — matches "KTC value of assets received − assets sent" literally) flipped sign for the `Team B` side. Cumulates those nets into a running total, prepending a synthetic `{ dateLabel: 'Start', cumulative: 0 }` point so the line always starts at zero. Line color is green (`#48bb78`) if the displayed range's final cumulative value is ≥0, red (`#f56565`) if negative — verified against `Herschey6153` (net −39,320 across the league) to confirm the red-line path renders correctly. X-axis dates formatted `MMM D 'YY`; Y-axis comma-formatted with a `ReferenceLine` at y=0 for the zero line; tooltip shows date, opponent, that trade's net, and running cumulative. Picks are included/excluded automatically since `Team A/B Face` are pre-summed totals from the notebook's trade grading step, which already includes pick KTC only when `get_pick_ktc` resolved a value.
   - **Shared time range tabs** — both charts got `4W · 3M · 6M · 1Y · All` tabs (`TIME_RANGE_OPTIONS` + `TimeRangeTabs` + `filterEntriesByRange` in `TeamDeepDive.js`), styled like the existing Prime Windows sort-button pattern (`var(--blue)` active background). Filtering is relative to the real current date (`new Date()`), not any hardcoded year. Tabs are independent per chart (separate `useState` per component). Each chart defaults to "All" (current data is sparse) and shows "Not enough data yet for this range — try a wider window" whenever the selected window has fewer than 2 real data points.
   - Verified end-to-end with a headless Playwright pass against the local dev server (no project `run` skill existed for this repo, so used the generic browser-driven pattern): confirmed both renamed/new section headers, tab click-through on both charts, the sparse-data placeholder on narrow windows, the green/red line coloring on two different teams, and tooltip contents — zero console errors.
   - Wilson's only — not added to CLTC (CLTC has no value-history snapshot pipeline and no equivalent trade trajectory request yet).

### Phase 2 — Existing Feature Upgrades
6. **BUY/SELL/HOLD Signal + Hype %** column on Team Deep Dive roster table.
7. **Pick Portfolio visual card upgrade** — ✅ Done. New shared component `src/components/PickPortfolioCards.js` (`PickYearGroup`, `dedupePicks`, `formatKtc`, `roundOrdinal`) used by both `TeamDeepDive.js`'s `PickPortfolioSection` and `PickPortfolio.js`. Replaced the flat pick tables with year-grouped card grids (`auto-fit, minmax(200px, 1fr)` — 3/2/1 cols responsive, matches the no-hardcoded-breakpoint convention already used elsewhere in the file):
   - **Pick data has no real draft-slot number** (only `Round` 1–4 and `Tier` Early/Mid/Late — future-year slot order can't be known) — flagged to and resolved by the user: big round display renders the round ordinal ("1st"/"2nd"/...) in green instead of a fabricated "1.xx" slot number, with the existing Early/Mid/Late tier badge in the corner instead of a separate redundant round label.
   - Card footer: "Your original pick" (Team Deep Dive) / "Own pick" (league ALL view) when `Original Owner === Current Owner`, else "From {original owner}"; KTC value formatted "5.6K"/"3.5K" via `formatKtc`.
   - New CSS vars `--pick-card-bg`/`--pick-card-border` in `App.css` (light: pale green `#eefcf3`/`#c6f6d5`; dark: `#16241c`/`#234433` — slightly lighter than `--page-bg`, matching the Dynastyze reference).
   - Year header shows pick count, round breakdown ("5 firsts / 3 seconds / ..."), and total value.
   - Sent badges (amber outline, strikethrough) only render when there's a single-team perspective (Team Deep Dive, or the league page with a team selected in the owner dropdown) — never in the league-wide ALL view, since "sent" requires a perspective.
   - Round summary pills (`0x 1st · 1x 2nd · ...`) show every round present in that year's actual pick data (never hardcoded 1–4), muted when count is 0.
   - League Pick Portfolio page: ranking cards at top unchanged; year/owner filters now drive the card view instead of a sortable table. ALL-owner view groups by year only (sorted round then KTC desc), shows current owner on each card, no Sent badges. Selecting a team switches to the same single-perspective view as Team Deep Dive.
   - `dedupePicks()` (the synthetic-furthest-year dedup logic that previously only lived in the league page) is now shared, so Team Deep Dive's pick section is also deduped correctly.
   - Verified both pages end-to-end with a headless Playwright pass against the local dev server (ALL view, team-filtered view via the page's own owner dropdown — not the sidebar's separate "Viewing as" admin select — and the Team Deep Dive card for the logged-in/selected team).
   - **Wilson's only — not added to CLTC** (consistent with the recent feature pattern of client-side-only additions going to Wilson's first; CLTC parity not requested for this feature).
8. **Power Rankings bar chart** alongside AI narratives — ✅ Done.
   - `notebooks/power_rankings.ipynb` cell 6 (prompt): added a `DYNASTYZE_REFERENCE` block listing
     Dynastyze's current power rankings (team/owner/value), framed explicitly as a soft calibration
     reference — "form your own independent ranking... but consider this calibration when teams are
     close" — not something to copy. `SYSTEM_PROMPT` now also asks for a `power_score` (0-100,
     holistic judgment, explicitly NOT derived from rank — "#1 does not automatically get 100") in
     the JSON schema alongside the existing `rank`/`team_name`/`owner`/`outlook`/`blurb` fields.
   - Cell 7 (parsing): clamps/coerces `power_score` to an int 0-100 defensively before writing
     `power_rankings.json`, in case the model returns something malformed (string, out of range, etc).
   - Re-ran the notebook locally — fresh `power_rankings.json` now includes `power_score` per team
     (verified non-rank-derived: scores were 91/87/80/76/70/65/55/50/44/38, not an even 100→10 ramp).
   - **React:** `src/pages/PowerRankings.js` — new `PowerScoreChart` (Recharts horizontal `BarChart`,
     `layout='vertical'`) renders above the narrative cards in its own `card`/`card-header` with title
     "Power Rankings" and subtext "AI-generated power score · 0–100 scale". One row per team sorted by
     AI rank, bar length = `power_score` (domain `[0,100]`, X-axis hidden), Y-axis shows `#rank  Team
     Name` via a custom tick renderer, `LabelList` shows the score on the bar's right end. Bar color
     keys off outlook via a chart-specific `OUTLOOK_BAR_COLOR` map (Contender green `#38a169`, Window
     Contender blue `#3182ce`, Reload amber `#d69e2e`, Rebuild red `#e53e3e`) — intentionally separate
     from the existing `OUTLOOK_BADGE` class map used by the narrative cards, since the badge colors
     don't match the spec'd chart palette (e.g. badge Window Contender is orange, chart is blue).
     Only `CartesianGrid` `vertical` lines are shown (`horizontal={false}`), matching the "subtle
     vertical gridline only, no X axis" spec.
   - **Current-user highlight:** follows the existing `useAuth()` pattern from `TradeCalculator.js`/
     `Blueprint.js` — `myOwner = viewAsOwner || userProfile?.rosterOwnerName`. The matching bar gets
     full opacity + a bold Y-axis label (others render at `fillOpacity 0.65` / regular weight).
     **Not visually verified with a real logged-in session** (no Firebase credentials available in
     this session, same limitation noted on the Blueprint trade-targets work) — the next person to
     touch this page should confirm the highlight while logged in as `ekleiner1123`.
   - Verified end-to-end with a headless Playwright pass against the local dev server: chart renders
     above the cards, bars sorted by rank, colors match outlook per team, score labels visible, no
     console errors.
   - **Wilson's only — not added to CLTC**, consistent with "CLTC does not have this feature" for
     Power Rankings overall (see CLAUDE.md).
9. **Blueprint trade targets visual upgrade** — ✅ Done. `src/pages/Blueprint.js`:
   - Removed the inline "Target Acquisitions" list from `TradeStrategySection` (which now renders only
     the outlook badge + description) and the "Buy Targets" half of the old `SuggestionsSection`.
   - New `computeTradeTargets()` merges the two prior data sources into one pool: scored buy
     suggestions (`computeBuySuggestions`, need/age/sell-signal driven, carries a sentence `_reason`)
     plus weakest-position tier matches (the old Target Acquisitions filter — outlook-appropriate
     tiers × weakest graded position, sell-likely owners floated first), deduped by player name,
     capped at 6. Tier-only entries fall back to the tier name itself (e.g. "Foundational") as their
     `_reason` so every card has a concise reason tag even without a sell signal.
   - New `TradeTargetsSection` (green top-border cards) renders the merged pool in a `.trade-card-grid`
     — explicit 3/2/1-column breakpoints added to `App.css` (1100px/768px) rather than relying on
     `auto-fit`, since the spec called for exact column counts rather than a flowing grid.
   - New `SellCandidatesSection` is the sell half of the old `SuggestionsSection`, restyled with the
     same `TradeCard`/grid (red top-border, no owner line, `computeSellSuggestions` cap bumped 4→6 to
     fill rows evenly) — kept in its original page position (after Top Priorities), so only
     `TradeTargetsSection` moved up to sit directly under the Trade Strategy badge.
   - Shared `TradeCard` component handles both: name, position/age/KTC line, optional "on {owner}"
     line, reason tag, save (★) and dismiss (×) buttons — same Firestore-backed dismiss/save plumbing
     as before (`dismissedSuggestions`/`savedSuggestions`, type `'buy'`/`'sell'`), just two independent
     loaders now instead of one shared one.
   - Verified: production build (`CI=true npx react-scripts build`) compiles clean; headless Playwright
     pass against the local dev server confirmed no console errors on load and that the `/blueprint`
     auth gate (`ProtectedRoute`) still renders Login correctly for a logged-out session. Did **not**
     visually verify the logged-in card grid itself — that requires real Firebase login credentials
     not available in this session; the next person to touch this page should eyeball it logged in
     as `ekleiner1123` before considering it fully verified.
   - **Wilson's only — not added to CLTC**, consistent with the established pattern for this kind of
     client-side-only visual feature (see Pick Portfolio cards, #7 above).

### Phase 3 — Future
10. **Multi-league / Sleeper username input** — full architectural rework to support any user entering their Sleeper league ID and pulling their own league data dynamically.

### Phase 4 — Playoff Picture (Complete)
11. **Playoff Picture Monte Carlo simulation on Home page** — ✅ Done. Wilson's only.
    - **Data audit findings**: no current-season schedule pull existed before this (only historical
      league-id matchups inside `get_season_history`). Confirmed directly against the Sleeper API that
      the live league already has real matchup pairings for all 14 regular-season weeks even in
      preseason (`playoff_week_start: 15`, `playoff_teams: 6` — matches "top 6, 14 weeks" exactly) —
      points are all 0 but `matchup_id` pairings are fully populated, so the pipeline uses the real
      schedule rather than the round-robin fallback. Per-season PPG lives in `historyStandings.json`
      (`Season`/`Owner`/`PPG`/`Best Score`, 2024+2025 currently); `teamOverview.json`'s `Player Value`
      field is already players-only KTC (no picks) and was used directly for roster strength rather than
      re-summing `leagueRosters.json`.
    - **Pipeline**: two new notebook cells, inserted after "24. Append Value History Snapshot" and before
      Tableau Export (which got bumped from a duplicate "24." label to "27." in the process) —
      "25. Fetch 2026 Schedule" (writes `public/data/schedule.json`: real Sleeper pairings per week, with
      a `note` field calling out preseason/live/unavailable) and "26. Playoff Picture Monte Carlo
      Simulation" (writes `public/data/playoffPicture.json`). New config constants
      `REGULAR_SEASON_WEEKS=14`, `PLAYOFF_SPOTS=6`, `SIM_ITERATIONS=1000` added to the Config cell.
      `season` in both output files is `int(CURRENT_DRAFT_YEAR)` — not a new hardcoded year — since
      `get_current_season()`'s month-based logic returns last year's number for several months after the
      season starts, and `CURRENT_DRAFT_YEAR` (`current_season+1`) happens to land on the actual playing
      season already.
    - **Notebook edited directly via JSON manipulation, not the NotebookEdit tool** — the notebook is too
      large (71k+ tokens) for the Read tool to load in one shot (required before NotebookEdit can act on
      a cell), even after stripping all cell outputs. Inserted the two new cells as raw notebook-JSON code
      cells via a one-off Python script, then ran `jupyter nbconvert --to script` (the project's own
      documented sync command) to regenerate `wilsons_teams.py` from the patched notebook — confirmed the
      resulting `.py` diff outside the new cells was only `# In[n]:` execution-count marker renumbering,
      no logic changes.
    - **Simulation model**: blended weekly score = 0.6 × historical PPG (mean of each team's per-season
      PPG, equally weighted across seasons, not games-weighted) + 0.4 × roster strength
      (`(player_ktc / league_avg_player_ktc) * league_avg_ppg`). Std dev uses the real per-team historical
      PPG std (`ddof=1` across the 2 available seasons) when computable; falls back to
      `(best_score - blended_ppg) / 2.5` floored at 5.0 otherwise. Weekly scores drawn from
      `max(50, normal(blended_ppg, std_dev))`. 1000 iterations, top 6 by (wins, then points tiebreaker)
      make the playoffs each iteration; `playoff_pct` = fraction of iterations a team made it.
    - **Verified output**: ran `wilsons_teams.py` end-to-end (full ~10min pipeline run, no errors) —
      `playoffPicture.json` teams sorted by `playoff_pct` descending, sane tiering (e.g. gavinw20/
      Herschey6153/GiantHawkTua near 100%, the bottom 4 rebuilding teams under 36%).
    - **React**: new `PlayoffBarRow`/`PlayoffPictureSection` in `src/pages/Home.js`, added below
      Positional Rankings. Custom hand-rolled bar rows (not Recharts) since the spec needed a dashed
      "PLAYOFF CUT" divider injected mid-list after rank 6, which a chart library can't do cleanly — green
      bars for the top `playoff_spots`, amber below, bold/brighter bar for the logged-in user's row via
      the same `useAuth()` → `viewAsOwner || userProfile?.rosterOwnerName` pattern already used on
      `PowerRankings.js`. Hover tooltip (local `useState`, not Recharts) shows blended/historical/roster-
      strength PPG. Placeholder copy renders if `playoffPicture.json` is missing or empty.
      `dataService.js` fetches it with `.catch(() => null)` so a missing file degrades to the placeholder
      instead of breaking the whole `Promise.all` data load.
    - Verified end-to-end with a headless Playwright pass against the local dev server (no project `run`
      skill existed for this repo, same situation as prior sessions) — confirmed the section renders with
      real team names, correct green/amber split at rank 6, the dashed divider, and the hover tooltip
      contents; zero console errors. **Did not verify the logged-in "my row" bold highlight** — same
      recurring limitation as `PowerRankings.js`/`Blueprint.js` (no Firebase credentials available in this
      session); the wiring is identical to `PowerRankings.js`'s already-flagged-unverified pattern, so the
      next person to touch this page should confirm both at once while logged in as `ekleiner1123`.

#### Follow-up: Simulation Accuracy Fix + In-Season Record Support (Complete)
- **Historical PPG source** — changed from an equal-weight average across all historical seasons to
  the single most-recently-completed season only (`str(current_season)`, filtered against
  `standings_df['Season']` — no hardcoded year). The all-time average was overweighting teams with
  good 2024 records that have since rebuilt/declined; using only the latest season reflects current
  team strength.
- **Blend weights flipped** — `blended_ppg` is now `0.4 * historical_ppg + 0.6 * roster_strength_score`
  (was `0.6/0.4`), so current roster KTC value dominates over last season's scoring record. Verified:
  ekleiner1123 and SvenMoney34 (both strong current rosters, mediocre-to-bad recent records) now sit at
  100% playoff odds at the top of `playoffPicture.json`, instead of teams with good historical PPG.
- **In-season record support** — the simulation now locks in completed weeks instead of re-simulating
  the full 14-week schedule every time. Each team's actual Sleeper roster `settings.wins/losses/fpts`
  (already used for `standings.json`) seeds the Monte Carlo loop's starting wins/points, and only
  `schedule_weeks[weeks_played:]` gets simulated going forward — `weeks_played` is derived as the max
  `wins+losses` across all rosters. New top-level `playoffPicture.json` fields: `weeks_played`,
  `current_week` (`weeks_played + 1`, capped at 14), `season_started` (`True` if any team has
  `wins+losses > 0`). New per-team fields: `current_wins`, `current_losses`.
- **Frontend label** — `PlayoffPictureSection` in `src/pages/Home.js` renders a `.badge-amber` next to
  the existing "Top 6 make it · Monte Carlo simulation · N iterations" subtext: "PRESEASON PROJECTION"
  when `season_started` is `False`, "WEEK {current_week} PROJECTION" once it flips `True`. New
  `--amber-bg` CSS var + `.badge-amber` class added to `App.css` (light `#fffbeb`/dark `#2d2410`,
  text color reuses the existing `--amber` var).
- Edited `wilsons_teams.ipynb` cell 28 directly via raw notebook-JSON manipulation (same approach as
  the original Playoff Picture build — the notebook remains too large for the Read tool in one shot),
  then regenerated `wilsons_teams.py` via `jupyter nbconvert --to script` — diff outside the target
  cell was empty.
- Ran the full pipeline locally with `/opt/anaconda3/bin/python3 wilsons_teams.py` (must use this
  absolute path, not bare `python3` — the sandboxed shell's `conda activate base` resolves `python3` to
  the system 3.9.6 install which can't parse the repo's Python-3.12+ f-string syntax; the anaconda
  `python3` symlink is 3.13). Verified output end-to-end and visually with a headless Playwright pass
  against the local dev server — preseason badge renders, zero console errors, rankings match the
  expected ekleiner1123/SvenMoney34-on-top outcome.
- **In-season mode (`WEEK X PROJECTION`, locked-in records) is not yet visually verified** — the league
  is still in preseason (`season_started: False` as of this run), so the in-season code path has only
  been verified by reading the logic, not by observing it against a live mid-season league.

---

## League Roster API Endpoint (Phase A Step 2 — Complete)

`/api/league.py` is a Vercel Python serverless function that accepts any Sleeper dynasty league ID and returns structured roster + KTC data.

- **Route:** `GET /api/league?league_id=<sleeper_league_id>`
- **Missing `league_id`:** returns HTTP 400 `{ "error": "league_id is required" }`
- **Response shape:**
  ```json
  {
    "league_id": "...",
    "league_name": "...",
    "season": "...",
    "rosters": [
      {
        "owner_id": "...",
        "team_name": "...",
        "players": [{ "sleeper_id": "...", "name": "...", "ktc_value": 0, "position": "..." }],
        "picks": [{ "pick_name": "2028 Mid 1st", "ktc_value": 0 }],
        "total_ktc": 0
      }
    ]
  }
  ```
- **Rosters sorted** by `total_ktc` descending. Players sorted by KTC descending within each roster.
- **Player matching:** uses `difflib.get_close_matches` (cutoff 0.85) against KTC player names — same logic as `wilsons_teams.py`. `_NAME_FIXES` dict corrects known Sleeper/KTC name mismatches (e.g. Chig Okonkwo).
- **Pick portfolio:** mirrors `wilsons_teams.py` cell 8 — generates picks for future years (YEARS[1:]), applies traded picks from Sleeper's `/traded_picks` endpoint. If the upcoming draft is still pre_draft/drafting, also generates current-year picks from slot_to_roster_id. Round 4 picks map to "Late 3rd" (KTC doesn't price 4th-rounders separately).
- **Sleeper API calls** (parallel via ThreadPoolExecutor): league info, rosters, users, players/nfl, traded_picks, drafts — then draft_details only if current draft is not complete.
- **`players/nfl` endpoint** is fetched uncached on every request (~5MB response, the dominant latency source). Caching this will be addressed in a later step.
- **Execution time:** logged to stdout as `league.py execution time: X.XXs`. Also logs `WARNING: approaching Vercel 10s function limit` if elapsed > 8s.
- **Cache-Control:** `s-maxage=3600, stale-while-revalidate` — CDN caches the response for 1 hour.
- **Vercel config:** `vercel.json` created at repo root to pin `api/league.py` to `python3.9` runtime. `api/ktc.js` and the React build are unaffected.
- **IMPORTANT:** KTC values come from cron-written static files (`ktcRankings.json`, `pickValues.json`). Do NOT re-scrape KTC on demand.

**Deployed endpoint (Wilson's):** `https://wilsons-moms-house.vercel.app/api/league?league_id=1312130103358021632`

---

## KTC Cache API Endpoint (Phase A Step 1 — Complete)

`/api/ktc.js` is a Vercel serverless function that serves KTC data from the cron-written static files.

- **Route:** `/api/ktc` (auto-routed by Vercel from the `/api/` directory convention — no `vercel.json` needed)
- **Returns:** `{ "players": [...], "picks": [...] }` where:
  - `players` — contents of `public/data/ktcRankings.json` (list of `{ Rank, "Player / Pick", "KTC Value", "Multi-Year Prod Score", "Combined Score" }`)
  - `picks` — contents of `public/data/pickValues.json` (list of `{ "Pick Name", "KTC Value" }`)
- **Cache-Control:** `s-maxage=3600, stale-while-revalidate` — CDN-cached for 1 hour, matching the Sun/Thu cron cadence
- **Error handling:** returns HTTP 500 with `{ "error": "..." }` if either file cannot be read
- **IMPORTANT:** KTC values are always served from cron-written static files. Do NOT re-scrape KTC on demand via this endpoint or any future endpoint — the scraper runs on the Sun/Thu GitHub Actions cron only.

`wilsons_teams.py` also has a canary check immediately after writing `ktcRankings.json` that reads it back and prints a `WARNING:` to stdout if it contains fewer than 200 players. This is a silent failure detector for KTC scraper regressions.

**Deployed endpoint:** https://wilsons-moms-house.vercel.app/api/ktc

---

## Phase A Step 3 — LeagueContext + LeagueSwitcher UI (Complete)

### localStorage keys
- `wmh_league_id` — active Sleeper league ID string
- `wmh_league_name` — active league display name string
- `wmh_last_username` — last Sleeper username that returned results in LeagueSwitcher; pre-fills the input on next open
- On first visit, both league keys are written to localStorage with Wilson's Moms House defaults (ID `1312130103358021632`)

### New files
- `src/contexts/LeagueContext.js` — `LeagueProvider` + `useLeague()` hook. Exposes `leagueId`, `leagueName`, `setLeague(id, name)`. Initializes from localStorage, falls back to WMH defaults. Wrapped around `<AuthProvider>` in `App.js`.
- `src/components/LeagueSwitcher.jsx` — modal/drawer UI. Handles username lookup (→ league list picker) and direct league ID entry. Has "Use Wilson's Moms House (Demo)" reset button. Matches site's existing inline-style + CSS-var pattern.

### Changed files
- `src/App.js` — wraps with `<LeagueProvider>` outside `<AuthProvider>`
- `src/components/Sidebar.js` — imports `useLeague` + `LeagueSwitcher`; adds a blue pill in the header showing `leagueName`, clicking it opens the switcher modal
- `src/pages/Home.js` — imports `useLeague`, adds `console.log('Active league ID:', leagueId)` as Step 3 proof-of-concept
- `src/App.css` — adds `@keyframes ls-spin` for the switcher's loading spinner

### Step 4 notes
Step 4 will wire all pages to read from `leagueId` (via `useLeague()`) instead of static JSON files. The `console.log` in `Home.js` should be removed in Step 4 once real data fetching replaces it. The `/api/league?league_id=` endpoint (built in Phase A Step 2) is what Step 4 should call.

---

## Phase A Step 4 — Wire All Pages to /api/league and /api/ktc (Complete)

### Architecture
All data loads centrally through `useData()` → `dataService.js::loadAllData(leagueId)` → `data` prop passed to every page from App.js. Pages do not fetch their own data; the league switch triggers a full re-fetch at the hook level.

### Page Buckets

**Bucket A** — Data served from /api/league for any league (these pages work for external leagues):
- **Home** — teamOverview (basic), rosterGrades (derived from positional KTC sums), standings (Sleeper API)
- **TeamDeepDive** — leagueRosters, pickPortfolio derived from /api/league rosters
- **PlayerRankings** — playerUniverse from /api/league; ktcRankings from /api/ktc
- **PickPortfolio** — pickPortfolio derived from /api/league picks (pick_name parsed to Year/Round/Tier)
- **TradeCalculator** — players + picks from /api/league; pickValues from /api/ktc

**Bucket B** — Wilson's-only computed/historical data (static reads unchanged; Step 5 will add "not available" placeholder UI):
- **TradeHistory** — reads tradeHistory.json (Wilson's cron-computed grades)
- **LeagueHistory** — reads history*.json (Wilson's historical data)
- **PowerRankings** — reads power_rankings.json (Wilson's AI-generated)
- **Blueprint** — reads nearly all computed files + Firestore (auth-required)

**Bucket C** — KTC universe from /api/ktc (not league-specific):
- **PlayerRankings** also reads ktcRankings from /api/ktc (for unrostered player lookup)

### Key changes
- `src/hooks/useData.js` — imports `useLeague`, reads `leagueId`, passes it to `loadAllData`, re-fetches when leagueId changes
- `src/services/dataService.js` — `loadAllData(leagueId)` branches:
  - Wilson's ID (`1312130103358021632`): existing static file + Sleeper API behavior (unchanged)
  - External: fetches `/api/league?league_id={leagueId}` + `/api/ktc` + Sleeper standings, maps response to the same data shape all pages expect. Null/empty for Wilson's-only fields (tradeHistory, powerRankings, playoffPicture, etc.)
- `src/App.js` — adds `useLeague`, resets `owner` state when leagueId changes (prevents stale team selection)
- All 9 pages — `useLeague()` imported; `const isWilsonsLeague = leagueId === '1312130103358021632'` added (eslint-disable comment; will be used in Step 5 for placeholder UI)
- `src/pages/Home.js` — Step 3 `console.log` removed

### External league data mapping (dataService.js::loadExternalLeagueData)
- `teamOverview`: derived from `rosters[].total_ktc` → Value Rank; no Outlook/C+F (null)
- `playerUniverse`: flattened from `rosters[].players`; no Tier/Age/production (null/0)
- `leagueRosters`: same source as playerUniverse
- `pickPortfolio`: `rosters[].picks` → Year/Round/Tier parsed from pick_name (e.g. "2028 Mid 1st")
- `rosterGrades`: summed player KTC by position per team; `QB Starter Val` and `QB Grade` both set to the sum (positional ranking still works)
- `ktcRankings` + `pickValues`: from /api/ktc (same for all leagues)
- Wilson's-only fields: `tradeHistory`, `powerRankings`, `playoffPicture`, `historyStandings` etc. → `[]` or `null`

### Known limitation: standings Val Rank mismatch for external leagues
In `StandingsTable` (Home.js), `standings[].owner` = Sleeper `display_name` (e.g. "jsinykin") and `teamOverview[].Owner` = `/api/league` `team_name` (e.g. "Drake > Josh"). These match for Wilson's (static data uses display_name) but not for leagues with custom team names. Result: Val Rank shows `#-` for all teams in leagues with custom names. Fix in Step 5 (or later): `/api/league` should also return `display_name` alongside `team_name`, and `dataService.js` should set `Owner` = `display_name` for the standings merge.

### Important note for Step 5
The `/api/league` and `/api/ktc` endpoints are Vercel Python/JS serverless functions. They are **not** available in `react-scripts start` dev mode — only on the deployed Vercel app (or via `vercel dev` locally). Wilson's Moms House dev testing continues to use static files as before.

---

## Phase A Step 5 — WilsonsOnly Placeholder for External League Pages (Complete)

### New component
- `src/components/WilsonsOnly.jsx` — renders when a Wilson's-only feature is viewed from an external league.
  Shows a 🔒 icon, "Wilson's Moms House Only" heading, explanation copy, and a "Switch to Wilson's Moms House"
  button that calls `setLeague('1312130103358021632', "Wilson's Moms House")` and navigates to home.
  Accepts `pageName` (string) and `setPage` (function) props.

### Gated pages
All four Bucket B pages are gated in `src/App.js` via `WILSONS_ONLY_PAGES` — a const mapping page IDs to display names.
When `!isWilsonsLeague && WILSONS_ONLY_PAGES[page]`, `WilsonsOnly` renders instead of the page component.
The gate lives in App.js (not inside each page) to respect React's rules-of-hooks — each page has hooks that
cannot follow an early return.

Gated pages:
- `tradehistory` → "Trade History"
- `history` → "League History"
- `powerrankings` → "Power Rankings"
- `blueprint` → "My Blueprint"

### Sidebar lock icons
`src/components/Sidebar.js` derives `isWilsonsLeague` from `useLeague()` and shows a subtle 🔒 icon (opacity 0.45)
next to the four Bucket B nav items when a non-Wilson's league is active. Links are still clickable —
they navigate to the WilsonsOnly placeholder.

---

## Phase A — Multi-League Support (Complete)

All 6 Phase A steps are done. The site now supports any Sleeper dynasty league.

| Step | Description | Status |
|------|-------------|--------|
| 1 | KTC Cache API (`/api/ktc`) — serves KTC data from cron-written static files | ✅ Done |
| 2 | League Roster API (`/api/league`) — structured KTC data for any Sleeper dynasty league | ✅ Done |
| 3 | LeagueContext + LeagueSwitcher UI — localStorage-backed league switching, modal/drawer | ✅ Done |
| 4 | Wire all pages to `/api/league` and `/api/ktc` — Bucket A/B/C page split | ✅ Done |
| 5 | WilsonsOnly placeholder — Bucket B pages show lock icon + "Switch to Wilson's" for external leagues | ✅ Done |
| 6 | Polish & deploy — Val Rank fix, loading states, error handling, nav indicator | ✅ Done |

### Phase A Step 6 details
- **Val Rank fix**: `/api/league.py` now returns both `team_name` and `display_name` on each roster object. `dataService.js` stores `display_name` on each `teamOverview` entry. `StandingsTable.valRankMap` keys on both `Owner` (team_name) and `display_name`, so external leagues with custom team names now show correct Val Rank instead of `#-`.
- **Loading states**: Global loading/error divs in `App.js` now set `background: var(--page-bg)` and `color: var(--text-primary)`, eliminating the blank white/dark flash on league switch. All Bucket A pages receive data as props from `App.js` — no individual page loading states needed.
- **Error handling**: Error state in `App.js` shows "Could not load league data. The league ID may be invalid." for non-WMH leagues. A styled "Switch League" button opens the `LeagueSwitcher` modal (now imported in `App.js`). LeagueSwitcher already showed clear inline errors for invalid IDs (unchanged). "Try again" button retained alongside "Switch League".
- **Nav indicator polish**: Sidebar league pill now has `maxWidth: 162px` + `minWidth: 0` on the text span, so names longer than ~20 chars truncate with ellipsis. The `title` attribute shows the full league name and League ID on hover.

---

## Phase B — Vercel KV Caching for /api/league (Complete)

Two cache layers in `api/league.py` backed by Upstash Redis (Vercel KV). Confirmed working — `x-cache-status: HIT` on repeat requests.

### Cache keys and TTLs
| Cache key | TTL | What it stores |
|-----------|-----|----------------|
| `sleeper_players_nfl` | 24 hours (86400s) | Full Sleeper `/v1/players/nfl` response (~5MB — the dominant latency source) |
| `league_{league_id}` | 1 hour (3600s) | Full structured response for that league (players + picks + rosters) |

### Implementation details
- `kv_get(key)` / `kv_set(key, value, ex_seconds)` — module-level helpers. GET uses `GET {KV_REST_API_URL}/get/{key}`; SET uses `POST {KV_REST_API_URL}/pipeline` with body `[["SET", key, value, "EX", ttl]]` (Upstash pipeline format — value in body, not URL path). Auth via `Bearer {KV_REST_API_TOKEN}` header. Both are no-ops if env vars are absent.
- **Layer 2 check** (full league cache) fires at the top of `_handle()` right after `league_id` is validated — cache HIT returns immediately without touching KTC or Sleeper APIs.
- **Layer 1 check** (players/nfl cache) fires before the `ThreadPoolExecutor` parallel fetch — if cached, `players_db` is skipped from the URL map entirely (saves ~2–4s of cold request time).
- **Layer 1 write** happens immediately after the parallel fetch completes, before any roster processing.
- **Layer 2 write** happens just before `self._respond()` at the end of `_handle()`.
- `x-cache-status: HIT | MISS` response header on all responses.
- Wilson's league (`1312130103358021632`) uses the same cache path as external leagues — no special casing.
- Timeouts: `kv_get` 5s, `kv_set` 10s (accounts for the ~5MB players payload).

### Graceful degradation
If `KV_REST_API_URL` or `KV_REST_API_TOKEN` are missing, `kv_get` returns `None` and `kv_set` is a no-op. The function works identically to pre-Phase-B — just slower. No KV failure can break a league request.

## Phase C — External League Feature Parity

### Phase C Step 1 — Outlook Badges for External Leagues (Complete)

Outlook badges (Contender, Reload, Rebuild, etc.) now compute on the fly in `/api/league.py` for any external league. Previously, external league Home page value cards and Team Deep Dive showed no badge (`null`).

**Logic added to `api/league.py`:**
- `CF_KTC_THRESHOLD = 5000` — proxy for Cornerstone/Foundational tier (players at or above Wilson's Foundational floor)
- `_classify_outlook(value_rank, cf_total, total_firsts)` — mirrors Wilson's `classify_outlook()` for the three inputs that don't require production data:
  - `value_rank`: 1-based rank by `total_ktc` descending
  - `cf_total`: count of players with `ktc_value >= 5000`
  - `total_firsts`: count of 1st-round picks owned (pick_name ending in "1st")
- Production-rank and share-gap gates are omitted (historical scoring data not available for external leagues)
- `outlook` and `cf_total` fields added to each roster object in the API response

**Accuracy against Wilson's real data:** 7/10 correct. The 3 misclassifications all require production rank:
- jsinykin: high value + high CF but low production → "Contender" (real: "Reload")
- GreyWaedekin27, Herschey6153: low value but high production → "Rebuild" (real: "Window Contender")

**`dataService.js` change:**
- `loadExternalLeagueData` maps `r.outlook → 'Outlook'` and `r.cf_total → 'C+F Total'`

**Frontend (no changes needed):** Home.js `TeamCard` and TeamDeepDive already render `team.Outlook`/`teamData.Outlook` — the badge appears automatically once the field is non-null.

**KV cache note:** Cached responses (1-hour TTL) that predate this deploy won't have `outlook` — `|| null` fallbacks in dataService.js handle this gracefully (no badge until cache expires).

### Phase C Step 2 — Trade History for All Leagues (Complete)

Trade History is now available for any Sleeper dynasty league via `/api/trades`.

**New file:** `api/trades.py` — Vercel Python serverless function:
- **Route:** `GET /api/trades?league_id=<sleeper_league_id>`
- **Follows `previous_league_id` chain** up to 3 seasons back — multi-season trade history for any dynasty league, not just the current season
- **Fetches all 18 weeks per season in parallel** (ThreadPoolExecutor, max 20 workers) — all seasons fired simultaneously; stays comfortably under the 10s Vercel limit
- **Player resolution:** reuses KV-cached `sleeper_players_nfl` (shared 24h cache with `league.py`); difflib cutoff 0.85 + `_NAME_FIXES` dict (mirrored from `wilsons_teams.py`)
- **Pick resolution:** `_get_pick_ktc()` — Sleeper doesn't return tier for future picks in transactions, defaults to 'Mid'; for past years not in `pickValues`, proxies using average of `current_season+1/+2/+3` equivalents (mirrors `wilsons_teams.py get_pick_ktc()`)
- **Grading:** exact replica of `wilsons_teams.py grade_trade()` / `ktc_adj()` — stud adjustment applied when one side has more assets than the other, `base_rates = {2:0.46, 3:0.55, 4:0.63, 5:0.70}`, `stud_mult = 1.0 + max(0,(top_ktc−5000)/100) * 0.003`
- **Grade labels:** `Surplus > 500 → WIN`, `< −500 → LOSS`, otherwise `FAIR` (matches TradeHistory.js `getVerdict()` thresholds)
- **Output shape:** identical to `tradeHistory.json` — `Date, Season, Team A, Team A Received, Team A Face, Team A Adjusted, Team B, Team B Received, Team B Face, Team B Adjusted, Surplus A, Surplus B, N Assets A, N Assets B`
- **Cache key:** `trades_{league_id}` · **TTL:** 1 hour (3600s)
- **`x-cache-status: HIT/MISS`** header on all responses
- **Graceful degradation:** players not in SKILL_POSITIONS skipped; trades with no graded assets on either side skipped; per-week fetch failures logged and skipped (don't break the whole response)

**Frontend changes:**
- `src/pages/TradeHistory.js` — added `useEffect` that fires when `!isWilsonsLeague`; fetches `/api/trades?league_id={leagueId}` with loading/error states. Wilson's path unchanged (still reads `data.tradeHistory`). Resets filters on league switch.
- `src/App.js` — removed `tradehistory` from `WILSONS_ONLY_PAGES`
- `src/components/Sidebar.js` — removed `tradehistory` from `WILSONS_ONLY_PAGES` lock-icon set

**Note:** `dataService.js` is unchanged — external leagues still return `tradeHistory: []` from `loadExternalLeagueData`. TradeHistory.js now bypasses that empty array and fetches live from `/api/trades` directly when `!isWilsonsLeague`.

---

### Phase C UX Polish (Complete)

Three small UX fixes shipped before Phase C Step 2:

1. **LeagueSwitcher username memory** — `LeagueSwitcher.jsx` initialises the input from `localStorage.getItem('wmh_last_username') || ''` and calls `localStorage.setItem('wmh_last_username', val)` immediately before `setLeagues(leagueList)` on a successful username lookup. Direct league-ID entries (the `^\d{15,}$` branch) do not save — only username lookups do, since those are the ones you'd want pre-filled next time.

2. **Admin "View As" owners list** — `Sidebar.js`: removed the hardcoded `ALL_OWNERS` constant; the dropdown now maps `owners` (the prop passed from `App.js`, already derived from `data.teamOverview`) and filters out `userProfile?.rosterOwnerName` (the admin's own entry). For Wilson's this is identical to before; for external leagues the dropdown now shows the actual teams from that league.

3. **Auto-select user's team on league switch** — `App.js`: replaced the `[userProfile]`-only auto-select effect with a `[data, userProfile]` effect that checks `rosterOwnerName` then `sleeperUsername` against the loaded `teamOverview` owners list. Uses a functional update (`setOwner(prev => prev || candidate)`) so a manual dropdown selection is never overridden; it only fills in the `''` reset left by the `[leagueId]` effect. If neither name is in the external league (user not a member), owner stays at `''` / "Select team...".

---

## Next Steps

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
