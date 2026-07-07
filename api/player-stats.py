"""
Vercel Python serverless function: GET /api/player-stats?league_id=<id>

Computes production data (best-3-of-4 Avg PPG, position-normalized production score,
combined score, snap share, career season stats) for every rostered player in any
Sleeper dynasty league, sourced entirely from Sleeper's public stats endpoints.

Mirrors the same best-3-of-4 / normalization / combined-score logic used by
wilsons_teams.py's "Multi-Year Production" cell, but computed on demand for any league
(Wilson's cron pipeline itself is untouched).

Response is keyed by Sleeper player ID and includes each player's raw name so the
frontend can merge onto Wilson's playerUniverse.json by normalized name (see
src/utils/playerUtils.js normalizeName/findPlayerByName) — Sleeper's players/nfl DB
only has `gsis_id` populated for a minority of active skill players (confirmed:
~1,259 of ~4,030 QB/RB/WR/TE entries), so GSIS ID is not a reliable merge key and is
intentionally not fetched or returned here.
"""

import json
import os
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from urllib.request import urlopen

import requests

# ── Vercel KV caching ──────────────────────────────────────────────────────────
KV_URL = os.environ.get('KV_REST_API_URL')
KV_TOKEN = os.environ.get('KV_REST_API_TOKEN')

PLAYER_STATS_TTL = 86400   # 24 hours


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


SKILL_POSITIONS = {"QB", "RB", "WR", "TE"}
MIN_GAMES_FOR_PPG = 6   # matches wilsons_teams.py's season_stats games>=6 filter
WEEKLY_WEEKS = list(range(1, 19))


def _get_current_season():
    """Returns the current NFL season year — same logic as wilsons_teams.py get_current_season()."""
    now = datetime.now()
    return now.year if now.month >= 7 else now.year - 1


def _get_prod_seasons(n_years=4):
    """Last n_years seasons ending at the current season — mirrors wilsons_teams.py get_pbp_seasons()."""
    latest = _get_current_season()
    return list(range(latest - n_years + 1, latest + 1))


def _fetch_json(url):
    with urlopen(url, timeout=20) as r:
        return json.loads(r.read())


def _career_row(pos, year, s):
    """Builds one career_stats entry — field names match PlayerDetailModal's qbCols/rbCols/wrTeCols exactly."""
    gp = s.get('gp', 0) or 0
    pts_ppr = s.get('pts_ppr', 0) or 0
    ppg = round(pts_ppr / gp, 1) if gp > 0 else 0
    pos_rank = s.get('pos_rank_ppr')
    fum_lost = s.get('fum_lost', s.get('fum', 0)) or 0

    row = {
        'Season': year,
        'Games': int(gp),
        'Fantasy Pts': round(pts_ppr, 1),
        'PPG': ppg,
        'Pos Rank': int(pos_rank) if pos_rank else None,
    }

    if pos == 'QB':
        pass_att = s.get('pass_att', 0) or 0
        pass_cmp = s.get('pass_cmp', 0) or 0
        pass_yd = s.get('pass_yd', 0) or 0
        pass_td = s.get('pass_td', 0) or 0
        pass_int = s.get('pass_int', 0) or 0
        rush_att = s.get('rush_att', 0) or 0
        rush_yd = s.get('rush_yd', 0) or 0
        rush_td = s.get('rush_td', 0) or 0
        row.update({
            'Completions': int(pass_cmp),
            'Attempts': int(pass_att),
            'Comp %': round(pass_cmp / pass_att * 100, 1) if pass_att > 0 else 0,
            'Pass Yards': int(pass_yd),
            'Yds/Att': round(pass_yd / pass_att, 1) if pass_att > 0 else 0,
            'Pass TDs': int(pass_td),
            'INTs': int(pass_int),
            'Rush Att': int(rush_att),
            'Rush Yards': int(rush_yd),
            'Rush TDs': int(rush_td),
            'Fumbles Lost': int(fum_lost),
        })
    elif pos == 'RB':
        rush_att = s.get('rush_att', 0) or 0
        rush_yd = s.get('rush_yd', 0) or 0
        rush_td = s.get('rush_td', 0) or 0
        rec_tgt = s.get('rec_tgt', 0) or 0
        rec = s.get('rec', 0) or 0
        rec_yd = s.get('rec_yd', 0) or 0
        rec_td = s.get('rec_td', 0) or 0
        row.update({
            'Touches': int(rush_att + rec),
            'Rush Att': int(rush_att),
            'Rush Yards': int(rush_yd),
            'Yds/Carry': round(rush_yd / rush_att, 1) if rush_att > 0 else 0,
            'Rush TDs': int(rush_td),
            'Targets': int(rec_tgt),
            'Receptions': int(rec),
            'Catch %': round(rec / rec_tgt * 100, 1) if rec_tgt > 0 else 0,
            'Rec Yards': int(rec_yd),
            'Yds/Target': round(rec_yd / rec_tgt, 1) if rec_tgt > 0 else 0,
            'Rec TDs': int(rec_td),
            'Fumbles Lost': int(fum_lost),
        })
    else:  # WR / TE
        rec_tgt = s.get('rec_tgt', 0) or 0
        rec = s.get('rec', 0) or 0
        rec_yd = s.get('rec_yd', 0) or 0
        rec_td = s.get('rec_td', 0) or 0
        air_yd = s.get('rec_air_yd', 0) or 0
        yac = s.get('rec_yar', 0) or 0   # Sleeper's "yards after reception" field — YAC equivalent
        rush_att = s.get('rush_att', 0) or 0
        rush_yd = s.get('rush_yd', 0) or 0
        rush_td = s.get('rush_td', 0) or 0
        row.update({
            'Targets': int(rec_tgt),
            'Receptions': int(rec),
            'Catch %': round(rec / rec_tgt * 100, 1) if rec_tgt > 0 else 0,
            'Rec Yards': int(rec_yd),
            'Yds/Target': round(rec_yd / rec_tgt, 1) if rec_tgt > 0 else 0,
            'Yds/Rec': round(rec_yd / rec, 1) if rec > 0 else 0,
            'Rec TDs': int(rec_td),
            'Air Yards': int(air_yd),
            'YAC': int(yac),
            'Rush Att': int(rush_att),
            'Rush Yards': int(rush_yd),
            'Rush TDs': int(rush_td),
            'Fumbles Lost': int(fum_lost),
        })

    return row


class handler(BaseHTTPRequestHandler):

    def do_GET(self):
        start_time = time.time()
        try:
            self._handle(start_time)
        except Exception:
            tb = traceback.format_exc()
            print(f"player-stats.py unhandled error:\n{tb}")
            last_line = tb.strip().splitlines()[-1]
            self._respond(500, {"error": f"Internal server error: {last_line}"})
        finally:
            elapsed = time.time() - start_time
            print(f"player-stats.py execution time: {elapsed:.2f}s")
            if elapsed > 8:
                print("WARNING: approaching Vercel 10s function limit")

    def _handle(self, start_time):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        league_id_values = params.get("league_id", [])
        bust_cache = 'bust' in params
        if not league_id_values:
            return self._respond(400, {"error": "league_id is required"})
        league_id = league_id_values[0]

        cache_key = f'player_stats_{league_id}'
        if not bust_cache:
            cached = kv_get(cache_key)
            if cached is not None:
                print(f"player-stats.py KV HIT: {cache_key}")
                return self._respond(200, cached, cache_status='HIT')
        else:
            print(f"player-stats.py: bust=1 — bypassing KV cache for {cache_key}")

        # ── Rostered player list — reuses /api/league's own KV cache ──
        try:
            league_resp = requests.get(
                f"https://wilsons-moms-house.vercel.app/api/league?league_id={league_id}",
                timeout=20,
            )
            league_resp.raise_for_status()
            league_data = league_resp.json()
        except Exception as e:
            return self._respond(500, {"error": f"Failed to fetch roster data: {e}"})

        rostered = {}
        for roster in league_data.get("rosters", []):
            for p in roster.get("players", []):
                sid = p.get("sleeper_id")
                if sid and p.get("position") in SKILL_POSITIONS:
                    rostered[sid] = p
        if not rostered:
            payload = {}
            kv_set(cache_key, payload, PLAYER_STATS_TTL)
            return self._respond(200, payload)

        prod_seasons = _get_prod_seasons(n_years=4)
        prod_seasons_set = set(prod_seasons)
        # ALL_SEASONS covers a player's entire career (Sleeper's season-stats endpoint's real coverage
        # starts at 2009 — years before that return an identical rank-only placeholder payload with
        # no gp field) so career_stats can show every season played, not just a narrow recent window.
        # avg_ppg/multi_year_prod_score must stay on the original 4-year prod_seasons window, so
        # ALL_SEASONS is only used to build career_stats.
        ALL_SEASONS = list(range(2009, _get_current_season() + 1))

        # ── Fetch season stats for all fetched years in parallel (ALL_SEASONS is a superset of prod_seasons) ──
        season_stats_by_year = {}
        with ThreadPoolExecutor(max_workers=8) as executor:
            future_to_year = {
                executor.submit(
                    _fetch_json,
                    f"https://api.sleeper.app/v1/stats/nfl/regular/{year}?season_type=regular"
                ): year
                for year in ALL_SEASONS
            }
            for future in as_completed(future_to_year):
                year = future_to_year[future]
                try:
                    season_stats_by_year[year] = future.result()
                except Exception as e:
                    raise RuntimeError(f"Season stats fetch failed for {year}: {e}")

        # ── Per-player season history + best-3-of-4 avg_ppg ──
        player_seasons = {}   # sid -> list of {year, gp, ppg} — prod_seasons window only
        player_career = {}    # sid -> list of career_stats rows (all seasons played, no gp>=6 filter) — ALL_SEASONS window

        for year in ALL_SEASONS:
            year_stats = season_stats_by_year.get(year, {})
            for sid, p in rostered.items():
                s = year_stats.get(sid)
                if not s:
                    continue
                pos = p["position"]

                gp = s.get('gp', 0) or 0
                if gp >= 1:
                    player_career.setdefault(sid, []).append(_career_row(pos, year, s))

                if year in prod_seasons_set:
                    pts_ppr = s.get('pts_ppr', 0) or 0
                    if gp >= MIN_GAMES_FOR_PPG:
                        player_seasons.setdefault(sid, []).append({
                            "year": year,
                            "gp": gp,
                            "ppg": pts_ppr / gp,
                        })

        avg_ppg_by_sid = {}
        seasons_by_sid = {}
        games_by_sid = {}
        for sid, seasons in player_seasons.items():
            top3 = sorted(seasons, key=lambda x: -x["ppg"])[:3]
            avg_ppg_by_sid[sid] = sum(x["ppg"] for x in top3) / len(top3)
            seasons_by_sid[sid] = len(seasons)
            games_by_sid[sid] = int(sum(x["gp"] for x in seasons))

        # ── Normalize within position, among all rostered players in this league ──
        pos_max = {}
        for sid, avg_ppg in avg_ppg_by_sid.items():
            pos = rostered[sid]["position"]
            pos_max[pos] = max(pos_max.get(pos, 0), avg_ppg)

        # ── Determine most recent completed season for snap share (no hardcoded year) ──
        snap_season = prod_seasons[-1]
        for year in reversed(prod_seasons):
            year_stats = season_stats_by_year.get(year, {})
            if any((year_stats.get(sid) or {}).get('gp', 0) for sid in rostered):
                snap_season = year
                break

        # ── Fetch weekly stats for the snap season, all weeks in parallel ──
        weekly_stats_by_week = {}
        with ThreadPoolExecutor(max_workers=18) as executor:
            future_to_week = {
                executor.submit(
                    _fetch_json,
                    f"https://api.sleeper.app/v1/stats/nfl/regular/{snap_season}/{week}?season_type=regular"
                ): week
                for week in WEEKLY_WEEKS
            }
            for future in as_completed(future_to_week):
                week = future_to_week[future]
                try:
                    weekly_stats_by_week[week] = future.result()
                except Exception as e:
                    print(f"player-stats.py: weekly fetch failed for week {week}: {e}")
                    weekly_stats_by_week[week] = {}

        snap_pct_by_sid = {}
        for sid in rostered:
            pcts = []
            for week in WEEKLY_WEEKS:
                s = weekly_stats_by_week.get(week, {}).get(sid)
                if not s:
                    continue
                off_snp = s.get('off_snp', 0) or 0
                tm_off_snp = s.get('tm_off_snp', 0) or 0
                if off_snp > 0 and tm_off_snp > 0:
                    pcts.append(off_snp / tm_off_snp * 100)
            if pcts:
                snap_pct_by_sid[sid] = round(sum(pcts) / len(pcts), 1)

        # ── Assemble response ──
        result = {}
        for sid, p in rostered.items():
            pos = p["position"]
            ktc_value = p.get("ktc_value", 0) or 0

            avg_ppg = avg_ppg_by_sid.get(sid, 0)
            max_for_pos = pos_max.get(pos, 0)
            multi_year_prod_score = round(avg_ppg / max_for_pos * 10000, 1) if avg_ppg > 0 and max_for_pos > 0 else 0
            combined_score = (
                round(ktc_value * 0.7 + multi_year_prod_score * 0.3, 1)
                if multi_year_prod_score > 0
                else ktc_value
            )

            career_stats = sorted(player_career.get(sid, []), key=lambda r: -r['Season'])

            result[sid] = {
                "avg_ppg": round(avg_ppg, 1),
                "seasons": seasons_by_sid.get(sid, 0),
                "games": games_by_sid.get(sid, 0),
                "multi_year_prod_score": multi_year_prod_score,
                "combined_score": combined_score,
                "snap_pct": snap_pct_by_sid.get(sid, 0),
                "career_stats": career_stats,
                "name": p.get("name"),
                "position": pos,
            }

        kv_set(cache_key, result, PLAYER_STATS_TTL)
        self._respond(200, result)

    def _respond(self, status, body, cache_status='MISS'):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "s-maxage=3600, stale-while-revalidate")
        self.send_header("x-cache-status", cache_status)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        pass
