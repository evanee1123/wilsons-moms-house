"""
Vercel Python serverless function: GET /api/trades?league_id=<id>

Fetches all trades from a Sleeper dynasty league (current + up to 2 previous seasons
via previous_league_id chain) and grades each retroactively using current KTC values.
Grading formula mirrors wilsons_teams.py grade_trade() exactly.

KTC values come from /api/ktc — never re-scraped on demand.
Cached in Upstash KV under key trades_{league_id} for 1 hour.
"""

import json
import os
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from difflib import get_close_matches
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from urllib.request import urlopen

import requests

# ── Vercel KV caching (shared helpers with league.py) ─────────────────────────
KV_URL = os.environ.get('KV_REST_API_URL')
KV_TOKEN = os.environ.get('KV_REST_API_TOKEN')

PLAYERS_CACHE_KEY = 'sleeper_players_nfl'
TRADES_TTL = 3600   # 1 hour


def kv_get(key):
    if not KV_URL or not KV_TOKEN:
        return None
    try:
        r = requests.get(
            f"{KV_URL}/get/{key}",
            headers={"Authorization": f"Bearer {KV_TOKEN}"},
            timeout=5
        )
        if r.status_code == 200:
            val = r.json().get('result')
            return json.loads(val) if val else None
    except Exception:
        pass
    return None


def kv_set(key, value, ex_seconds):
    if not KV_URL or not KV_TOKEN:
        return
    try:
        serialized = json.dumps(value)
        requests.post(
            f"{KV_URL}/pipeline",
            headers={"Authorization": f"Bearer {KV_TOKEN}"},
            json=[["SET", key, serialized, "EX", ex_seconds]],
            timeout=10,
        )
    except Exception:
        pass


# ── Name fixes — mirrors wilsons_teams.py NAME_FIXES ──────────────────────────
# Applied to Sleeper full_name before KTC difflib matching.
_NAME_FIXES = {
    "Cameron Ward":    "Cam Ward",
    "Marvin Harrison": "Marvin Harrison Jr.",
    "Kenneth Walker":  "Kenneth Walker III",
    "Brian Thomas":    "Brian Thomas Jr.",
    "Michael Penix":   "Michael Penix Jr.",
    "DJ Moore":        "D.J. Moore",
    "Harold Fannin":   "Harold Fannin Jr.",
    "Jimmy Horn":      "Jimmy Horn Jr.",
    "Calvin Austin":   "Calvin Austin III",
    "Ollie Gordon":    "Ollie Gordon II",
    "Chig Okonkwo":    "Chigoziem Okonkwo",
}

SKILL_POSITIONS = {"QB", "RB", "WR", "TE"}


def _fetch_json(url):
    with urlopen(url, timeout=20) as r:
        return json.loads(r.read())


def _get_current_season():
    """Current NFL season year — same logic as wilsons_teams.py and league.py."""
    now = datetime.now()
    return now.year if now.month >= 7 else now.year - 1


def _pick_ktc_name(season_str, round_num, tier):
    """Construct KTC lookup name for a pick. Round 4 maps to 'Late 3rd'."""
    if round_num == 4:
        return f"{season_str} Late 3rd"
    round_str = {1: "1st", 2: "2nd", 3: "3rd"}.get(round_num, f"{round_num}th")
    return f"{season_str} {tier} {round_str}"


def _get_pick_ktc(pick, pick_ktc_lookup, current_season):
    """
    Resolve a draft pick from a Sleeper transaction to its KTC value and display name.

    Sleeper does not return tier for future picks in transactions — defaults to 'Mid'.
    For past years not in pickValues (already drafted), proxies using the average of
    current_season+1, +2, +3 equivalents — mirrors wilsons_teams.py get_pick_ktc().
    """
    pick_season = str(pick.get('season', ''))
    round_num = int(pick.get('round', 1))
    tier = pick.get('tier') or 'Mid'

    ktc_name = _pick_ktc_name(pick_season, round_num, tier)
    ktc_val = int(pick_ktc_lookup.get(ktc_name, 0))

    if ktc_val == 0 and pick_season:
        # Past year or unknown year — proxy from next 3 future seasons
        round_str = {1: "1st", 2: "2nd", 3: "3rd", 4: "4th"}.get(round_num, f"{round_num}th")
        proxy_vals = []
        for offset in range(1, 4):
            proxy_yr = str(current_season + offset)
            if round_num == 4:
                proxy_name = f"{proxy_yr} Late 3rd"
            else:
                proxy_name = f"{proxy_yr} {tier} {round_str}"
            pv = int(pick_ktc_lookup.get(proxy_name, 0))
            if pv > 0:
                proxy_vals.append(pv)
        ktc_val = round(sum(proxy_vals) / len(proxy_vals)) if proxy_vals else 0

    return ktc_val, ktc_name


def _grade_trade(trade, roster_id_to_owner, players_db,
                 player_ktc_lookup, ktc_names, pick_ktc_lookup, current_season):
    """
    Grade a single Sleeper trade transaction using current KTC values with stud adjustment.
    Exact replica of wilsons_teams.py grade_trade() / ktc_adj().
    """
    roster_ids  = trade.get('roster_ids') or []
    adds        = trade.get('adds') or {}
    draft_picks = trade.get('draft_picks') or []
    created     = trade.get('created', 0)
    season      = trade.get('_season', str(current_season))

    if len(roster_ids) < 2:
        return None

    date_str = datetime.fromtimestamp(created / 1000).strftime('%Y-%m-%d')
    roster_a, roster_b = roster_ids[0], roster_ids[1]
    owner_a = roster_id_to_owner.get(roster_a, f'Roster {roster_a}')
    owner_b = roster_id_to_owner.get(roster_b, f'Roster {roster_b}')

    side_a = {'owner': owner_a, 'assets': [], 'total': 0}
    side_b = {'owner': owner_b, 'assets': [], 'total': 0}

    # Players — adds maps {player_id: to_roster_id} (who received the player)
    for player_id, to_roster in adds.items():
        p = players_db.get(str(player_id), {})
        if p.get('position', '') not in SKILL_POSITIONS:
            continue

        raw_name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
        ktc_lookup_name = _NAME_FIXES.get(raw_name, raw_name)

        matches = get_close_matches(ktc_lookup_name, ktc_names, n=1, cutoff=0.85)
        ktc_val = int(player_ktc_lookup[matches[0]]) if matches else 0

        asset = {'name': raw_name or 'Unknown', 'ktc': ktc_val}
        if to_roster == roster_a:
            side_a['assets'].append(asset)
            side_a['total'] += ktc_val
        elif to_roster == roster_b:
            side_b['assets'].append(asset)
            side_b['total'] += ktc_val

    # Draft picks — owner_id = who receives the pick
    for pick in draft_picks:
        to_roster = pick.get('owner_id')
        ktc_val, display_name = _get_pick_ktc(pick, pick_ktc_lookup, current_season)
        asset = {'name': display_name, 'ktc': ktc_val}
        if to_roster == roster_a:
            side_a['assets'].append(asset)
            side_a['total'] += ktc_val
        elif to_roster == roster_b:
            side_b['assets'].append(asset)
            side_b['total'] += ktc_val

    if not side_a['assets'] and not side_b['assets']:
        return None

    n_a = len(side_a['assets'])
    n_b = len(side_b['assets'])

    # Stud adjustment — exact formula from wilsons_teams.py grade_trade()
    def _ktc_adj(top_ktc, n_pieces, star_total):
        if n_pieces <= 1:
            return 0
        base_rates = {2: 0.46, 3: 0.55, 4: 0.63, 5: 0.70}
        base_rate  = base_rates.get(n_pieces, 0.75)
        stud_mult  = 1.0 + max(0, (top_ktc - 5000) / 100) * 0.003
        adj        = round(top_ktc * base_rate * stud_mult)
        if star_total and star_total > top_ktc:
            ratio = (top_ktc / star_total) ** 0.9
            adj   = round(adj * ratio)
        return adj

    if n_a > n_b:
        top_b = max((a['ktc'] for a in side_b['assets']), default=0)
        adj   = _ktc_adj(top_b, n_a, side_b['total'])
        adj_a = side_a['total']
        adj_b = side_b['total'] + adj
    elif n_b > n_a:
        top_a = max((a['ktc'] for a in side_a['assets']), default=0)
        adj   = _ktc_adj(top_a, n_b, side_a['total'])
        adj_a = side_a['total'] + adj
        adj_b = side_b['total']
    else:
        adj_a = side_a['total']
        adj_b = side_b['total']

    surplus_a = adj_a - adj_b

    a_str = ' | '.join(f"{a['name']} ({a['ktc']:,})" for a in side_a['assets'])
    b_str = ' | '.join(f"{a['name']} ({a['ktc']:,})" for a in side_b['assets'])

    return {
        'Date':            date_str,
        'Season':          season,
        'Team A':          owner_a,
        'Team A Received': a_str,
        'Team A Face':     side_a['total'],
        'Team A Adjusted': adj_a,
        'Team B':          owner_b,
        'Team B Received': b_str,
        'Team B Face':     side_b['total'],
        'Team B Adjusted': adj_b,
        'Surplus A':       surplus_a,
        'Surplus B':       -surplus_a,
        'N Assets A':      n_a,
        'N Assets B':      n_b,
    }


class handler(BaseHTTPRequestHandler):

    def do_GET(self):
        start_time = time.time()
        try:
            self._handle(start_time)
        except Exception:
            tb = traceback.format_exc()
            print(f"trades.py unhandled error:\n{tb}")
            last_line = tb.strip().splitlines()[-1]
            self._respond(500, {'error': f'Internal server error: {last_line}'})
        finally:
            elapsed = time.time() - start_time
            print(f"trades.py execution time: {elapsed:.2f}s")
            if elapsed > 8:
                print("WARNING: approaching Vercel 10s function limit")

    def _handle(self, start_time):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        league_id_list = params.get('league_id', [])
        if not league_id_list:
            return self._respond(400, {'error': 'league_id is required'})
        league_id = league_id_list[0]

        # ── KV cache check ────────────────────────────────────────────────────
        cache_key = f'trades_{league_id}'
        cached = kv_get(cache_key)
        if cached is not None:
            print(f'trades.py KV HIT: {cache_key}')
            return self._respond(200, cached, cache_status='HIT')

        # ── Fetch KTC data from /api/ktc ──────────────────────────────────────
        try:
            ktc_resp = requests.get(
                'https://wilsons-moms-house.vercel.app/api/ktc', timeout=20
            )
            ktc_resp.raise_for_status()
            ktc_data = ktc_resp.json()
        except Exception as e:
            return self._respond(500, {'error': f'Failed to fetch KTC data: {e}'})

        player_ktc_lookup = {p['Player / Pick']: p['KTC Value'] for p in ktc_data['players']}
        ktc_names = list(player_ktc_lookup.keys())
        pick_ktc_lookup = {p['Pick Name']: p['KTC Value'] for p in ktc_data['picks']}

        current_season = _get_current_season()

        # ── players/nfl — reuse KV-cached copy from league.py (24h TTL) ───────
        players_db = kv_get(PLAYERS_CACHE_KEY)
        if players_db is None:
            try:
                players_db = _fetch_json('https://api.sleeper.app/v1/players/nfl')
                kv_set(PLAYERS_CACHE_KEY, players_db, 86400)
            except Exception as e:
                return self._respond(500, {'error': f'Failed to fetch Sleeper players: {e}'})

        # ── Build league chain: current + up to 2 previous seasons ───────────
        # Follows previous_league_id links to get multi-season trade history.
        league_chains = []  # [(league_id, season_str), ...]
        lid = league_id
        for _ in range(3):
            try:
                info = _fetch_json(f'https://api.sleeper.app/v1/league/{lid}')
                season_str = str(info.get('season', current_season))
                league_chains.append((lid, season_str))
                prev = info.get('previous_league_id')
                if not prev or prev == '0':
                    break
                lid = prev
            except Exception:
                break

        # ── Roster ID → display_name from current league ─────────────────────
        # Roster IDs are preserved across seasons in Sleeper dynasty leagues.
        try:
            rosters_raw = _fetch_json(f'https://api.sleeper.app/v1/league/{league_id}/rosters')
            users_raw   = _fetch_json(f'https://api.sleeper.app/v1/league/{league_id}/users')
        except Exception as e:
            return self._respond(500, {'error': f'Failed to fetch roster/user data: {e}'})

        user_map = {
            u['user_id']: (u.get('display_name') or u.get('username') or 'Unknown')
            for u in users_raw
        }
        roster_id_to_owner = {
            r['roster_id']: user_map.get(r['owner_id'], 'Unknown')
            for r in rosters_raw
        }

        # ── Fetch all transactions in parallel across all seasons ─────────────
        # 18 weeks × N seasons fired simultaneously; Sleeper API handles this fine.
        raw_trades = []
        with ThreadPoolExecutor(max_workers=20) as executor:
            future_map = {}
            for (lid, season_str) in league_chains:
                for week in range(1, 19):
                    url = f'https://api.sleeper.app/v1/league/{lid}/transactions/{week}'
                    f   = executor.submit(_fetch_json, url)
                    future_map[f] = (lid, season_str, week)

            for future in as_completed(future_map):
                _lid, season_str, week = future_map[future]
                try:
                    txns = future.result()
                    for t in txns:
                        if t.get('type') == 'trade':
                            t['_season'] = season_str
                            raw_trades.append(t)
                except Exception as exc:
                    print(f'trades.py: transactions fetch failed for week {week} league {_lid}: {exc}')

        # ── Grade all trades ──────────────────────────────────────────────────
        graded = []
        for trade in raw_trades:
            result = _grade_trade(
                trade, roster_id_to_owner, players_db,
                player_ktc_lookup, ktc_names, pick_ktc_lookup, current_season
            )
            if result:
                graded.append(result)

        graded.sort(key=lambda t: t['Date'], reverse=True)
        print(f"trades.py: graded {len(graded)} trades across {len(league_chains)} season(s)")

        # ── Cache and return ──────────────────────────────────────────────────
        kv_set(cache_key, graded, TRADES_TTL)
        self._respond(200, graded)

    def _respond(self, status, body, cache_status='MISS'):
        payload = json.dumps(body).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 's-maxage=3600, stale-while-revalidate')
        self.send_header('x-cache-status', cache_status)
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        pass
