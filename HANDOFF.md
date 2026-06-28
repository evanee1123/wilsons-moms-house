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

#### Follow-up: Pick Conversion Model Fix (Complete)
- The original pick conversion (1st picks 60% of KTC value, 2nd 30%, 3rd/4th 10%, injected once in
  the draft year with no further growth) was wrong — picks become young Rising players and should
  keep gaining value after the draft. Replaced with:
  - **Draft year**: picks convert at 100% of KTC value (regardless of round) — round only affects
    post-draft growth now
  - **Post-draft growth**: each pick compounds annually at a round-scaled share of the 13%
    league-average Rising rate — 1st 13%/yr, 2nd 9.75%/yr, 3rd 6.5%/yr, 4th 3.25%/yr — through 2030
  - Verified against worked examples to the dollar (2028 1st @ 5,619 → 6,350 → 7,175;
    2027 2nd @ 3,462 → 3,800 → 4,170 → 4,577) and against Akracoon's 5x 2028 1sts: curve now spikes
    at 2028 (138,633) and keeps climbing through 2030 (157,221 → 162,899) with no post-spike drop
  - **Judgment call, flagged and approved by the user**: pure 100% conversion made ekleiner1123's
    Peak Gain jump to ~32% — far above their own ~9-10% estimate, since 100% is inherently much bigger
    than the old 10-60% rates for any non-trivial pick stash, even without a marquee 1st. Re-applied
    the existing outlook-aware pick multiplier (Rebuild 1.3x, Reload 1.1x, Contender 0.9x) to the
    draft-year conversion value as a partial offset — this only softens the gap (ekleiner1123 lands at
    +29.0%, not ~9-10%), which the user accepted as an inherent consequence of 100% draft-year
    conversion rather than a bug.
- Current verified values: ekleiner1123 → Core Age 23.9, Peak Year 2029, Peak Window 2028–2030,
  Peak Gain +29.0%. Akracoon → Peak Year 2030, Peak Window 2029–2030, Peak Gain +119.7%. Most teams
  now show double-digit-to-triple-digit gains since picks contribute much more broadly than before;
  only the 2 oldest-core teams (GreyWaedekin27, Herschey6153) still show "At peak now" (0%).

---

## Known Issues

None currently. Both leagues are stable and auto-updating.

---

## Improvement Roadmap

### Phase 1 — New Features
1. **Competitive Window / Age Runway** — ✅ Done on Team Deep Dive, projection model reworked and verified (see "Wilson's — Competitive Window Projection Model" above for the age-curve/outlook/pick-conversion logic and the two threshold judgment calls made). ⬜ Still needs to be added to the Blueprint page.
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
