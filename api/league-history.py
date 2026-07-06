"""
Vercel Python serverless function: GET /api/league-history?league_id=<id>

Walks the Sleeper previous_league_id chain (up to 10 seasons) and returns
multi-season league history in the exact shape LeagueHistory.js expects:

{
  historyChampions:   [{ Season, Champion }]
  historyStandings:   [{ Season, Rank, Owner, Wins, Losses, PF, PA, PPG, "Max PF", "Best Score", Champion }]
  historyAllTime:     [{ Rank, Owner, Seasons, Wins, Losses, PF, PA, PPG, "Max PF", "Best Score", Championships, "Win %" }]
  historyBrackets:    [bracket rows (Winners/Losers) + Score rows]
  historyTopWeeks:    [{ Week, Owner, Points }]  top 10 single-game team scores across all seasons
  historyPlayerGames: [{ Category, Rank, Player, Position, Points, Week, Owner, Started }]  top 10 per pos
}

Cache: league_history_{league_id} — 24-hour TTL (history is stable)
"""

import json
import os
import time
import traceback
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

import requests

KV_URL   = os.environ.get('KV_REST_API_URL')
KV_TOKEN = os.environ.get('KV_REST_API_TOKEN')

SLEEPER_BASE    = 'https://api.sleeper.app/v1'
HISTORY_TTL     = 86400   # 24 hours — history doesn't change
MAX_SEASONS     = 10
PLAYERS_KEY     = 'sleeper_players_nfl'
SKILL_POSITIONS = {'QB', 'RB', 'WR', 'TE'}


# ── KV helpers ────────────────────────────────────────────────────────────────
def kv_get(key):
    if not KV_URL or not KV_TOKEN:
        return None
    try:
        r = requests.get(
            f"{KV_URL}/get/{key}",
            headers={"Authorization": f"Bearer {KV_TOKEN}"},
            timeout=5,
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
        requests.post(
            f"{KV_URL}/pipeline",
            headers={"Authorization": f"Bearer {KV_TOKEN}"},
            json=[["SET", key, json.dumps(value), "EX", ex_seconds]],
            timeout=10,
        )
    except Exception as e:
        print(f"league-history.py kv_set '{key}' error: {e}")


# ── Sleeper fetch ─────────────────────────────────────────────────────────────
def sleeper(path, timeout=15):
    r = requests.get(f"{SLEEPER_BASE}{path}", timeout=timeout)
    r.raise_for_status()
    return r.json()


# ── Points from roster settings ───────────────────────────────────────────────
def roster_pf(s):
    f = s.get('fpts', 0) or 0
    d = s.get('fpts_decimal', 0) or 0
    return round(f + d / 100, 2)


def roster_pa(s):
    f = s.get('fpts_against', 0) or 0
    d = s.get('fpts_against_decimal', 0) or 0
    return round(f + d / 100, 2)


# ── Walk the previous_league_id chain ─────────────────────────────────────────
def walk_chain(start_id):
    """Return list of (league_id, season_str, league_info) newest-first, up to MAX_SEASONS."""
    chain = []
    lid   = start_id
    for _ in range(MAX_SEASONS):
        try:
            info = sleeper(f"/league/{lid}")
        except Exception as e:
            print(f"league-history: failed to fetch league {lid}: {e}")
            break
        chain.append((lid, str(info.get('season', '?')), info))
        prev = info.get('previous_league_id')
        if not prev or str(prev) in ('0', ''):
            break
        lid = str(prev)
    return chain


# ── Fetch one season's raw data (all calls in parallel) ───────────────────────
def fetch_season_raw(league_id, season, info):
    playoff_start = int((info.get('settings') or {}).get('playoff_week_start', 15))
    reg_weeks     = list(range(1, playoff_start))
    po_weeks      = list(range(playoff_start, playoff_start + 3))

    raw = {
        'league_id':       league_id,
        'season':          season,
        'playoff_start':   playoff_start,
        'rosters':         [],
        'users':           [],
        'winners_bracket': [],
        'losers_bracket':  [],
        'matchups':        {},   # week_int -> list of matchup entries
    }

    def fetch(label, path, week=None):
        try:
            return label, week, sleeper(path)
        except Exception as e:
            print(f"league-history: {label} week={week} failed for {season}: {e}")
            return label, week, []

    with ThreadPoolExecutor(max_workers=25) as ex:
        futs = [
            ex.submit(fetch, 'rosters',  f"/league/{league_id}/rosters"),
            ex.submit(fetch, 'users',    f"/league/{league_id}/users"),
            ex.submit(fetch, 'winners',  f"/league/{league_id}/winners_bracket"),
            ex.submit(fetch, 'losers',   f"/league/{league_id}/losers_bracket"),
        ]
        for w in (reg_weeks + po_weeks):
            futs.append(ex.submit(fetch, 'week', f"/league/{league_id}/matchups/{w}", w))

        for fut in as_completed(futs):
            try:
                label, week, data = fut.result()
            except Exception as e:
                print(f"league-history: future failed for {season}: {e}")
                continue
            if   label == 'rosters': raw['rosters']          = data or []
            elif label == 'users':   raw['users']             = data or []
            elif label == 'winners': raw['winners_bracket']   = data or []
            elif label == 'losers':  raw['losers_bracket']    = data or []
            elif label == 'week':    raw['matchups'][week]    = data or []

    return raw


# ── Process one season into the required output shape ─────────────────────────
def process_season(raw, players_db):
    season        = raw['season']
    playoff_start = raw['playoff_start']
    rosters       = raw['rosters'] or []
    users         = raw['users']   or []
    winners_br    = raw['winners_bracket'] or []
    losers_br     = raw['losers_bracket']  or []
    matchups      = raw['matchups']

    # Skip seasons with no completed games (e.g. current preseason)
    total_wins = sum((r.get('settings') or {}).get('wins', 0) or 0 for r in rosters)
    if total_wins == 0:
        return None

    # roster_id -> display_name
    user_map  = {u['user_id']: u.get('display_name') or u.get('username', '?') for u in users}
    rid_owner = {}
    for r in rosters:
        rid_owner[r['roster_id']] = user_map.get(r.get('owner_id'), f"Team {r['roster_id']}")

    reg_weeks = list(range(1, playoff_start))
    po_weeks  = list(range(playoff_start, playoff_start + 3))

    # Per-roster weekly tracking
    team_scores  = defaultdict(list)   # rid -> [actual_pts, ...]
    team_max_pts = defaultdict(list)   # rid -> [max_pts, ...]

    for w in reg_weeks:
        for entry in (matchups.get(w) or []):
            rid = entry.get('roster_id')
            pts = float(entry.get('points', 0) or 0)
            mx  = float(entry.get('max_points') or pts)
            team_scores[rid].append(pts)
            team_max_pts[rid].append(mx)

    # Build standings rows
    rows = []
    for r in rosters:
        rid   = r['roster_id']
        owner = rid_owner.get(rid, f"Team {rid}")
        s     = r.get('settings') or {}
        wins  = int(s.get('wins', 0) or 0)
        lss   = int(s.get('losses', 0) or 0)
        pf    = roster_pf(s)
        pa    = roster_pa(s)
        games = wins + lss
        ppg   = round(pf / games, 2) if games else 0.0

        scores    = team_scores.get(rid, [])
        best      = round(max(scores), 2) if scores else 0.0
        mx_list   = team_max_pts.get(rid, [])
        max_pf    = round(sum(mx_list), 2) if mx_list else pf

        rows.append({
            'Owner': owner, 'Wins': wins, 'Losses': lss,
            'PF': pf, 'PA': pa, 'PPG': ppg,
            'Max PF': max_pf, 'Best Score': best,
        })

    rows.sort(key=lambda x: (-x['Wins'], -x['PF']))

    # Champion: highest round's m=1 winner in the winners bracket
    champion = None
    if winners_br:
        max_r  = max((e.get('r', 0) for e in winners_br), default=0)
        finals = [e for e in winners_br if e.get('r') == max_r]
        if finals:
            champ_entry = min(finals, key=lambda x: x.get('m', 999))
            w_rid = champ_entry.get('w')
            if w_rid:
                champion = rid_owner.get(w_rid)
    if not champion and rows:
        champion = rows[0]['Owner']

    # historyStandings rows
    standings = []
    for i, row in enumerate(rows):
        standings.append({
            'Season': season, 'Rank': i + 1,
            'Owner': row['Owner'], 'Wins': row['Wins'], 'Losses': row['Losses'],
            'PF': row['PF'], 'PA': row['PA'], 'PPG': row['PPG'],
            'Max PF': row['Max PF'], 'Best Score': row['Best Score'],
            'Champion': row['Owner'] == champion,
        })

    # historyBrackets: Winners + Losers entries with sequential global match numbers
    brackets  = []
    match_ctr = [0]

    def add_br(btype, entry):
        match_ctr[0] += 1
        t1 = entry.get('t1')
        t2 = entry.get('t2')
        w  = entry.get('w')
        l  = entry.get('l')
        brackets.append({
            'Season': season, 'Type': btype, 'Match': match_ctr[0],
            'Round': entry.get('r', 0),
            'T1': t1, 'T2': t2, 'Winner': w, 'Loser': l,
            'T1_Owner':  rid_owner.get(t1, '') if t1 else '',
            'T2_Owner':  rid_owner.get(t2, '') if t2 else '',
            'Win_Owner': rid_owner.get(w, '')  if w  else '',
            'Los_Owner': rid_owner.get(l, '')  if l  else '',
        })

    for e in winners_br:
        add_br('Winners', e)
    for e in losers_br:
        add_br('Losers', e)

    # Score entries for playoff weeks (one row per team per week)
    for idx, pw in enumerate(po_weeks):
        r_round = idx + 1
        for entry in (matchups.get(pw) or []):
            rid   = entry.get('roster_id')
            owner = rid_owner.get(rid, '')
            if not owner:
                continue
            pts = round(float(entry.get('points', 0) or 0), 2)
            brackets.append({
                'Season': season, 'Type': 'Score', 'Match': None,
                'Round': r_round, 'T1': rid, 'T2': None, 'Winner': None, 'Loser': None,
                'T1_Owner': owner, 'T2_Owner': '', 'Win_Owner': '', 'Los_Owner': '',
                'Points': pts, 'Week': pw,
            })

    # historyTopWeeks: one entry per team per regular-season week
    top_weeks = []
    for w in reg_weeks:
        for entry in (matchups.get(w) or []):
            rid   = entry.get('roster_id')
            owner = rid_owner.get(rid, '')
            pts   = round(float(entry.get('points', 0) or 0), 2)
            if owner and pts > 0:
                top_weeks.append({'Week': f"{season} Week {w}", 'Owner': owner, 'Points': pts})

    # historyPlayerGames: top player scores from matchup players_points
    player_games = []
    if players_db:
        for w in reg_weeks:
            for entry in (matchups.get(w) or []):
                rid      = entry.get('roster_id')
                owner    = rid_owner.get(rid, '')
                if not owner:
                    continue
                starters = set(entry.get('starters') or [])
                pp       = entry.get('players_points') or {}
                for pid, pts in pp.items():
                    if not pts or float(pts) <= 0:
                        continue
                    info = players_db.get(str(pid)) or {}
                    name = info.get('full_name', '')
                    pos  = info.get('position', '')
                    if not name or pos not in SKILL_POSITIONS:
                        continue
                    player_games.append({
                        'season': season, 'week': w,
                        'Category': pos, 'Player': name, 'Position': pos,
                        'Points': round(float(pts), 2),
                        'Week': f"{season} Week {w}",
                        'Owner': owner,
                        'Started': 'Starter' if pid in starters else 'Bench',
                    })

    return {
        'champion': champion, 'season': season,
        'standings': standings, 'brackets': brackets,
        'top_weeks': top_weeks, 'player_games': player_games,
    }


# ── Aggregate all seasons into the final response ─────────────────────────────
def aggregate(results):
    champions    = []
    standings    = []
    brackets     = []
    all_tw       = []
    all_pg       = []
    owner_agg    = defaultdict(lambda: {
        'Wins': 0, 'Losses': 0, 'PF': 0.0, 'PA': 0.0,
        'MaxPF': 0.0, 'Best': 0.0, 'Champs': 0, 'Seasons': 0,
    })

    for r in results:
        season = r['season']
        if r['champion']:
            champions.append({'Season': season, 'Champion': r['champion']})
        standings.extend(r['standings'])
        brackets.extend(r['brackets'])
        all_tw.extend(r['top_weeks'])
        all_pg.extend(r['player_games'])

        for row in r['standings']:
            o = row['Owner']
            a = owner_agg[o]
            a['Wins']    += row['Wins']
            a['Losses']  += row['Losses']
            a['PF']      += row['PF']
            a['PA']      += row['PA']
            a['MaxPF']   += row['Max PF']
            a['Best']     = max(a['Best'], row['Best Score'])
            a['Seasons'] += 1
            if row['Champion']:
                a['Champs'] += 1

    # All-time standings
    at_rows = []
    for owner, a in owner_agg.items():
        total = a['Wins'] + a['Losses']
        at_rows.append({
            'Owner':         owner,
            'Seasons':       a['Seasons'],
            'Wins':          a['Wins'],
            'Losses':        a['Losses'],
            'PF':            round(a['PF'], 2),
            'PA':            round(a['PA'], 2),
            'PPG':           round(a['PF'] / total, 2) if total else 0.0,
            'Max PF':        round(a['MaxPF'], 2),
            'Best Score':    round(a['Best'], 2),
            'Championships': a['Champs'],
            'Win %':         round(a['Wins'] / total * 100, 1) if total else 0.0,
        })
    at_rows.sort(key=lambda x: (-x['Wins'], -x['PF']))
    all_time = [{'Rank': i + 1, **r} for i, r in enumerate(at_rows)]

    # Top 10 weeks overall
    all_tw.sort(key=lambda x: -x['Points'])
    top_weeks = all_tw[:10]

    # Top 10 player games per category
    def top10(pool, cat):
        filtered = pool if cat == 'Overall' else [g for g in pool if g['Category'] == cat]
        filtered = sorted(filtered, key=lambda x: -x['Points'])[:10]
        out = []
        for i, g in enumerate(filtered):
            out.append({
                'Category': cat, 'Rank': i + 1,
                'Player': g['Player'], 'Position': g['Position'],
                'Points': g['Points'], 'Week': g['Week'],
                'Owner': g['Owner'], 'Started': g['Started'],
            })
        return out

    pg_out = []
    for cat in ('Overall', 'QB', 'RB', 'WR', 'TE'):
        pg_out.extend(top10(all_pg, cat))

    return {
        'historyChampions':   champions,
        'historyStandings':   standings,
        'historyAllTime':     all_time,
        'historyBrackets':    brackets,
        'historyTopWeeks':    top_weeks,
        'historyPlayerGames': pg_out,
    }


# ── Vercel handler ────────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):

    def do_GET(self):
        t0 = time.time()
        try:
            self._handle()
        except Exception:
            tb = traceback.format_exc()
            print(f"league-history.py unhandled error:\n{tb}")
            self._respond(500, {'error': f"Internal server error: {tb.strip().splitlines()[-1]}"})
        finally:
            elapsed = time.time() - t0
            print(f"league-history.py execution time: {elapsed:.2f}s")
            if elapsed > 8:
                print(f"WARNING: execution over 8s — {elapsed:.2f}s total")

    def _handle(self):
        params     = parse_qs(urlparse(self.path).query)
        id_list    = params.get('league_id', [])
        bust_cache = 'bust' in params
        if not id_list:
            return self._respond(400, {'error': 'league_id is required'})
        league_id = id_list[0]

        cache_key = f"league_history_{league_id}"
        if not bust_cache:
            cached = kv_get(cache_key)
            if cached is not None:
                print(f"league-history.py KV HIT: {cache_key}")
                return self._respond(200, cached, cache_status='HIT')
        else:
            print(f"league-history.py: bust=1 — bypassing KV cache for {cache_key}")

        # Walk previous_league_id chain to collect all season league IDs
        chain = walk_chain(league_id)
        print(f"league-history.py: {len(chain)} seasons in chain for {league_id}")
        if not chain:
            return self._respond(400, {'error': 'Could not fetch league data'})

        # Fetch all seasons in parallel (each season's calls are also parallelized internally)
        season_raws = []
        with ThreadPoolExecutor(max_workers=min(len(chain), MAX_SEASONS)) as ex:
            futures = {
                ex.submit(fetch_season_raw, lid, season, info): (lid, season)
                for lid, season, info in chain
            }
            for fut in as_completed(futures):
                lid, season = futures[fut]
                try:
                    season_raws.append(fut.result())
                except Exception as e:
                    print(f"league-history.py: season {season} fetch error: {e}")

        # Players DB from KV (shared 24h cache with league.py and trades.py).
        # If KV is cold (no recent league.py call), fetch directly from Sleeper and warm the cache.
        players_db = kv_get(PLAYERS_KEY)
        if not players_db:
            print("league-history.py: sleeper_players_nfl not in KV — fetching from Sleeper")
            try:
                pr = requests.get(f"{SLEEPER_BASE}/players/nfl", timeout=30)
                pr.raise_for_status()
                players_db = pr.json()
                kv_set(PLAYERS_KEY, players_db, 86400)
                print(f"league-history.py: fetched and cached sleeper_players_nfl ({len(players_db)} entries)")
            except Exception as e:
                print(f"league-history.py: could not fetch players_db: {e}")
                players_db = {}
        else:
            print(f"league-history.py: sleeper_players_nfl KV hit ({len(players_db)} entries)")

        # Process each season
        results = []
        for raw in season_raws:
            try:
                res = process_season(raw, players_db)
                if res is not None:
                    results.append(res)
                    print(f"league-history.py: season {raw['season']} — {len(res['player_games'])} player game entries")
                else:
                    print(f"league-history.py: season {raw['season']} skipped (no completed games)")
            except Exception as e:
                print(f"league-history.py: season {raw.get('season', '?')} process error: {e}")
                traceback.print_exc()

        if not results:
            empty = {
                'historyChampions': [], 'historyStandings': [], 'historyAllTime': [],
                'historyBrackets': [], 'historyTopWeeks': [], 'historyPlayerGames': [],
            }
            return self._respond(200, empty)

        # Sort seasons most-recent-first for consistent display ordering
        results.sort(key=lambda x: x['season'], reverse=True)

        response = aggregate(results)
        print(f"league-history.py: historyPlayerGames count={len(response.get('historyPlayerGames', []))}")
        # Always write back to KV so bust=1 also refreshes the cache for future requests.
        kv_set(cache_key, response, HISTORY_TTL)
        self._respond(200, response)

    def _respond(self, status, body, cache_status='MISS'):
        payload = json.dumps(body).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type',                'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('x-cache-status',              cache_status)
        self.send_header('Content-Length',              str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        pass
