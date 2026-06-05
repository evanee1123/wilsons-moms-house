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

### Wilson's — Trade Finder (Complete)
- `src/utils/playerUtils.js` — `normalizeName()` and `findPlayerByName()` handle name variants
- Template reordering — Cornerstone/Foundational give-side floats qualifying packages to top
- Cornerstone fairness filter — gate widens to `ratio >= 1.00 && ratio <= 1.35` when giving a Cornerstone
- Candidate pool bias — 1st-round-pick packages floated when `requireFirstRound === true`

---

## Known Issues

None currently. Both leagues are stable and auto-updating.

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

---

## How to Trigger a Manual Data Update

1. Go to the [GitHub Actions tab](https://github.com/evanee1123/wilsons-moms-house/actions)
2. Select **"Update Data"** (Wilson's) or **"Update CLTC Data"** (CLTC) from the left sidebar
3. Click **"Run workflow"** → **"Run workflow"**
4. The workflow will run the Python script, commit updated JSON files, and push — Vercel deploys automatically

---

## File Structure

See CLAUDE.md for full project overview, league settings, roster ID maps, Firebase setup, and deployment commands.
