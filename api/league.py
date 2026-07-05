"""
Vercel Python serverless function: GET /api/league?league_id=<id>

Returns structured per-roster KTC data for any Sleeper dynasty league.
KTC values are served from cron-written static files — never re-scraped on demand.
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

# ── Vercel KV caching ──────────────────────────────────────────────────────────
KV_URL = os.environ.get('KV_REST_API_URL')
KV_TOKEN = os.environ.get('KV_REST_API_TOKEN')

PLAYERS_CACHE_KEY = 'sleeper_players_nfl'
PLAYERS_TTL = 86400  # 24 hours — players don't change intraday
LEAGUE_TTL = 3600    # 1 hour — per-league full response


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


# ── Name corrections to improve difflib matching — mirrors wilsons_teams.py ──
_NAME_FIXES = {
    "Chig Okonkwo": "Chigoziem Okonkwo",
}

SKILL_POSITIONS = {"QB", "RB", "WR", "TE"}
ROUNDS = [1, 2, 3, 4]

# KTC threshold for approximating Cornerstone/Foundational tier — matches the floor of
# Wilson's Foundational tier and is used as a proxy since external leagues don't have
# production data for the full tier assignment logic.
CF_KTC_THRESHOLD = 5000

# KTC-only tier thresholds — mirrors the direct KTC override values used in wilsons_teams.py's
# position scoring cells (6500 Cornerstone, 5500 Foundational, 4500 Upside Premier) plus
# observed breakpoints from Wilson's league data for the lower tiers.
_KTC_TIER_THRESHOLDS = [
    (6500, "Cornerstone"),
    (5500, "Foundational"),
    (4500, "Upside Premier"),
    (3500, "Mainstay"),
    (2500, "Serviceable"),
    (1500, "Jag Developmental"),
    (1,    "Replaceable"),
]


def _assign_player_tier(ktc_value):
    """KTC-only tier approximation for external leagues without production/age data."""
    for threshold, tier in _KTC_TIER_THRESHOLDS:
        if ktc_value >= threshold:
            return tier
    return None


def _classify_outlook(value_rank, cf_total, total_firsts):
    """
    Simplified replication of Wilson's classify_outlook for external leagues.
    Omits production-rank and share-gap gates (not available without cron data).
    Mirrors wilsons_teams.py classify_outlook() for the remaining conditions.
    """
    vr, cf, tf = value_rank, cf_total, total_firsts

    # Contender — top value + strong Cornerstone/Foundational foundation
    if vr <= 3 and cf >= 3:
        return "Contender"
    if vr <= 5 and cf >= 4:
        return "Contender"

    # Reload — mid-tier value + established core + draft capital
    if vr <= 6 and cf >= 3 and tf >= 2:
        return "Reload"

    # Rebuild — low value rank or weak foundation
    if vr >= 7 or cf <= 2:
        return "Rebuild (future value)" if tf >= 3 else "Rebuild"

    return "Reload"


def _get_current_season():
    """Returns the current NFL season year — same logic as wilsons_teams.py."""
    now = datetime.now()
    return now.year if now.month >= 7 else now.year - 1


def _pick_tier_current(slot, n_teams):
    """Early/Mid/Late tier for a known draft slot — mirrors wilsons_teams.py."""
    equivalent_slot = round(slot * 12 / n_teams)
    if equivalent_slot <= 4:
        return "Early"
    elif equivalent_slot <= 8:
        return "Mid"
    return "Late"


def _default_future_tier(round_num):
    """Default tier for future-year picks where slot is unknown — mirrors wilsons_teams.py."""
    return "Mid" if round_num in (1, 2) else "Early"


def _pick_ktc_name(year, round_num, tier):
    """
    Constructs the KTC lookup name for a pick — mirrors pick_ktc_name in wilsons_teams.py.
    Round 4 maps to 'Late 3rd' (KTC doesn't price 4th-rounders separately).
    """
    if round_num == 4:
        return f"{year} Late 3rd"
    round_str = {1: "1st", 2: "2nd", 3: "3rd"}.get(round_num, f"{round_num}th")
    return f"{year} {tier} {round_str}"


def _fetch_json(url):
    with urlopen(url, timeout=20) as r:
        return json.loads(r.read())


class handler(BaseHTTPRequestHandler):

    def do_GET(self):
        start_time = time.time()
        try:
            self._handle(start_time)
        except Exception:
            tb = traceback.format_exc()
            print(f"league.py unhandled error:\n{tb}")
            last_line = tb.strip().splitlines()[-1]
            self._respond(500, {"error": f"Internal server error: {last_line}"})
        finally:
            elapsed = time.time() - start_time
            print(f"league.py execution time: {elapsed:.2f}s")
            if elapsed > 8:
                print("WARNING: approaching Vercel 10s function limit")

    def _handle(self, start_time):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        league_id_values = params.get("league_id", [])
        if not league_id_values:
            return self._respond(400, {"error": "league_id is required"})
        league_id = league_id_values[0]

        # ── Layer 2: full per-league response cache (1 hour TTL) ──────────────
        cache_key = f'league_{league_id}'
        cached = kv_get(cache_key)
        if cached is not None:
            print(f"league.py KV HIT: {cache_key}")
            return self._respond(200, cached, cache_status='HIT')

        # Fetch KTC data from /api/ktc — avoids direct file access in serverless
        try:
            ktc_resp = requests.get(
                "https://wilsons-moms-house.vercel.app/api/ktc", timeout=20
            )
            ktc_resp.raise_for_status()
            ktc_data = ktc_resp.json()
        except Exception as e:
            return self._respond(500, {"error": f"Failed to fetch KTC data: {e}"})

        ktc_name_to_value = {p["Player / Pick"]: p["KTC Value"] for p in ktc_data["players"]}
        ktc_names = list(ktc_name_to_value.keys())
        ktc_pick_lookup = {p["Pick Name"]: p["KTC Value"] for p in ktc_data["picks"]}

        # ── Layer 1: players/nfl cache (24 hour TTL) ──────────────────────────
        cached_players = kv_get(PLAYERS_CACHE_KEY)
        players_cache_hit = cached_players is not None
        if players_cache_hit:
            print("league.py KV HIT: sleeper_players_nfl")

        # Fetch all Sleeper endpoints in parallel; skip players/nfl if cached
        sleeper_urls = {
            "league_info":   f"https://api.sleeper.app/v1/league/{league_id}",
            "rosters":       f"https://api.sleeper.app/v1/league/{league_id}/rosters",
            "users":         f"https://api.sleeper.app/v1/league/{league_id}/users",
            "traded_picks":  f"https://api.sleeper.app/v1/league/{league_id}/traded_picks",
            "drafts":        f"https://api.sleeper.app/v1/league/{league_id}/drafts",
        }
        if not players_cache_hit:
            sleeper_urls["players_db"] = "https://api.sleeper.app/v1/players/nfl"

        sleeper_data = {}
        with ThreadPoolExecutor(max_workers=6) as executor:
            future_to_key = {executor.submit(_fetch_json, url): key
                             for key, url in sleeper_urls.items()}
            for future in as_completed(future_to_key):
                key = future_to_key[future]
                try:
                    sleeper_data[key] = future.result()
                except Exception as e:
                    raise RuntimeError(f"Sleeper API fetch failed for {key}: {e}")

        league_info  = sleeper_data["league_info"]
        rosters      = sleeper_data["rosters"]
        users        = sleeper_data["users"]
        traded_picks = sleeper_data["traded_picks"]
        drafts       = sleeper_data["drafts"]

        # Resolve players_db from cache or fresh fetch, then populate cache if missed
        players_db = cached_players if players_cache_hit else sleeper_data.get("players_db", {})
        if not players_cache_hit:
            kv_set(PLAYERS_CACHE_KEY, players_db, PLAYERS_TTL)

        # user_id → display_name + team_name (from metadata.team_name when set)
        user_map = {}
        for u in users:
            meta = u.get("metadata") or {}
            display = u.get("display_name") or u.get("username") or "Unknown"
            user_map[u["user_id"]] = {
                "display_name": display,
                "team_name": meta.get("team_name") or display,
            }

        # roster_id → display_name (for traded_picks ownership resolution)
        roster_id_map = {
            r["roster_id"]: user_map.get(r["owner_id"], {}).get("display_name", "Unknown")
            for r in rosters
        }

        # ── Pick portfolio — mirrors wilsons_teams.py cell 8 logic ──
        current_season    = _get_current_season()
        CURRENT_DRAFT_YEAR = str(current_season + 1)
        YEARS = [str(current_season + i) for i in range(1, 5)]
        n_teams = len(rosters)

        upcoming_draft = next(
            (d for d in drafts if d["status"] in ("pre_draft", "drafting")),
            drafts[0] if drafts else None,
        )

        all_league_picks = []

        if upcoming_draft and upcoming_draft["status"] not in ("complete",):
            draft_details = _fetch_json(
                f"https://api.sleeper.app/v1/draft/{upcoming_draft['draft_id']}"
            )
            slot_to_roster = draft_details.get("slot_to_roster_id", {})
            for slot_str, roster_id in slot_to_roster.items():
                slot = int(slot_str)
                for rnd in ROUNDS:
                    all_league_picks.append({
                        "year":           CURRENT_DRAFT_YEAR,
                        "round":          rnd,
                        "slot":           slot,
                        "tier":           _pick_tier_current(slot, n_teams),
                        "original_owner": roster_id,
                        "current_owner":  roster_id,
                    })

        for year in YEARS[1:]:
            for roster in rosters:
                for rnd in ROUNDS:
                    all_league_picks.append({
                        "year":           year,
                        "round":          rnd,
                        "slot":           None,
                        "tier":           _default_future_tier(rnd),
                        "original_owner": roster["roster_id"],
                        "current_owner":  roster["roster_id"],
                    })

        # Apply traded picks — mirrors wilsons_teams.py trade application loop
        for tp in traded_picks:
            orig      = tp["roster_id"]
            new_owner = tp["owner_id"]
            year      = str(tp["season"])
            rnd       = tp["round"]
            for pick in all_league_picks:
                if (pick["original_owner"] == orig
                        and pick["year"] == year
                        and pick["round"] == rnd
                        and pick["current_owner"] == orig):
                    pick["current_owner"] = new_owner
                    break

        # Group picks by current owner (roster_id)
        picks_by_roster = {}
        for pick in all_league_picks:
            rid        = pick["current_owner"]
            ktc_lookup = _pick_ktc_name(pick["year"], pick["round"], pick["tier"])
            picks_by_roster.setdefault(rid, []).append({
                "pick_name": ktc_lookup,
                "ktc_value": int(ktc_pick_lookup.get(ktc_lookup, 0)),
            })

        # ── Per-roster output ──
        result_rosters = []
        for roster in rosters:
            owner_id  = roster["owner_id"]
            roster_id = roster["roster_id"]
            user_info = user_map.get(owner_id, {})
            team_name = user_info.get("team_name") or user_info.get("display_name") or "Unknown"

            players_list = []
            for pid in (roster.get("players") or []):
                p        = players_db.get(pid, {})
                position = p.get("position", "")
                if position not in SKILL_POSITIONS:
                    continue
                raw_name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
                name     = _NAME_FIXES.get(raw_name, raw_name)
                matches  = get_close_matches(name, ktc_names, n=1, cutoff=0.85)
                ktc_val  = int(ktc_name_to_value[matches[0]]) if matches else 0
                players_list.append({
                    "sleeper_id": pid,
                    "name":       raw_name,
                    "ktc_value":  ktc_val,
                    "position":   position,
                    "tier":       _assign_player_tier(ktc_val),
                })

            roster_picks = picks_by_roster.get(roster_id, [])
            total_ktc    = (
                sum(p["ktc_value"] for p in players_list)
                + sum(p["ktc_value"] for p in roster_picks)
            )

            cf_total     = sum(1 for p in players_list if p["ktc_value"] >= CF_KTC_THRESHOLD)
            total_firsts = sum(1 for p in roster_picks if p["pick_name"].endswith("1st"))

            result_rosters.append({
                "owner_id":      owner_id,
                "display_name":  user_info.get("display_name") or "Unknown",
                "team_name":     team_name,
                "players":       sorted(players_list, key=lambda x: -x["ktc_value"]),
                "picks":         sorted(roster_picks, key=lambda x: -x["ktc_value"]),
                "total_ktc":     int(total_ktc),
                "_cf_total":     cf_total,
                "_total_firsts": total_firsts,
            })

        result_rosters.sort(key=lambda x: -x["total_ktc"])

        for i, r in enumerate(result_rosters):
            cf  = r.pop("_cf_total")
            tf  = r.pop("_total_firsts")
            r["outlook"]  = _classify_outlook(i + 1, cf, tf)
            r["cf_total"] = cf

        response_payload = {
            "league_id":   league_id,
            "league_name": league_info.get("name", ""),
            "season":      league_info.get("season", ""),
            "rosters":     result_rosters,
        }

        # ── Layer 2 write: cache the full response for 1 hour ─────────────────
        kv_set(cache_key, response_payload, LEAGUE_TTL)

        self._respond(200, response_payload)

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
        # Suppress BaseHTTPRequestHandler's default access log noise
        pass
