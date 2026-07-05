"""
Vercel Python serverless function: GET /api/power-rankings?league_id=<id>

Generates AI power rankings for any Sleeper dynasty league.
1. Fetches roster data from /api/league (KV-cached, fast on repeat hits)
2. Formats all teams into a single Anthropic prompt
3. Returns JSON in the same shape as public/data/power_rankings.json

Model: claude-haiku-4-5-20251001 (fast + cheap — runs on every external page load)
Cache: power_rankings_{league_id} in Upstash KV, 6-hour TTL
"""

import json
import os
import time
import traceback
from collections import Counter
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

import requests

# ── Vercel KV (shared pattern from league.py / trades.py) ─────────────────────
KV_URL   = os.environ.get('KV_REST_API_URL')
KV_TOKEN = os.environ.get('KV_REST_API_TOKEN')

ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY')
ANTHROPIC_MODEL   = 'claude-haiku-4-5-20251001'
ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

POWER_RANKINGS_TTL = 21600   # 6 hours — AI generation is expensive
LEAGUE_API_URL     = 'https://wilsons-moms-house.vercel.app/api/league'

TIER_ORDER = [
    'Cornerstone', 'Foundational', 'Upside Premier', 'Mainstay',
    'Serviceable', 'Jag Developmental', 'Replaceable',
]


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
    except Exception:
        pass


def _format_team_block(roster, value_rank, n_teams):
    team_name   = roster.get('team_name', roster.get('display_name', 'Unknown'))
    owner       = roster.get('display_name', 'Unknown')
    outlook     = roster.get('outlook', 'Unknown')
    total_ktc   = roster.get('total_ktc', 0)
    cf_total    = roster.get('cf_total', 0)
    players     = roster.get('players', [])
    picks       = roster.get('picks', [])

    player_value = sum(p['ktc_value'] for p in players)
    pick_value   = sum(p['ktc_value'] for p in picks)

    # Top 5 players
    top_str = ', '.join(
        f"{p['name']} ({p['position']}, {p.get('tier') or 'N/A'}, KTC {p['ktc_value']:,})"
        for p in players[:5]
    )

    # Tier breakdown
    tier_counts = Counter(p.get('tier') for p in players if p.get('tier'))
    tier_str    = ', '.join(
        f"{t}: {tier_counts[t]}" for t in TIER_ORDER if t in tier_counts
    )

    # Positional depth — top 3 per position
    depth_lines = []
    for pos in ['QB', 'RB', 'WR', 'TE']:
        pos_players = [p for p in players if p.get('position') == pos][:3]
        if pos_players:
            pnames = ', '.join(
                f"{p['name']} ({p.get('tier') or 'N/A'})" for p in pos_players
            )
            depth_lines.append(f"  {pos}: {pnames}")

    # Pick capital
    total_firsts = sum(1 for p in picks if p['pick_name'].endswith('1st'))
    top_pick     = picks[0] if picks else None
    pick_str     = f"{total_firsts} 1st-round picks"
    if top_pick:
        pick_str += f", top pick: {top_pick['pick_name']} (KTC {top_pick['ktc_value']:,})"

    return (
        f"--- {owner} (Team: {team_name}) ---\n"
        f"Outlook: {outlook}\n"
        f"Value Rank: #{value_rank}/{n_teams}\n"
        f"Total Dynasty Value: {total_ktc:,} "
        f"(Players: {player_value:,}, Picks: {pick_value:,})\n"
        f"Cornerstones+Foundational: {cf_total}\n"
        f"Pick Capital: {pick_str}\n"
        f"\nTop 5 players by KTC:\n{top_str}\n"
        f"\nTier breakdown:\n{tier_str}\n"
        f"\nPositional depth (top 3 per pos):\n" + "\n".join(depth_lines) + "\n"
    )


SYSTEM_PROMPT = (
    "You are a savage, no-holds-barred dynasty fantasy football beat writer. "
    "Your job is to write power rankings blurbs that are smack-talky, opinionated, and funny. "
    "You pull no punches. You compare teams against each other, roast owners who are struggling, "
    "hype up the contenders, and call out delusion where you see it. "
    "You have strong opinions and you are not afraid to share them.\n\n"
    "You will receive data for dynasty fantasy football teams. Based on that data, you must:\n"
    "1. Determine the correct power ranking order from 1 (best) to last (worst) based on dynasty "
    "value, outlook classification, tier composition, and positional depth.\n"
    "2. Assign each team a power_score from 0-100 reflecting your holistic, independent judgment "
    "of their current dynasty strength.\n"
    "3. Write a 3-5 sentence blurb for each team that captures their current situation with "
    "personality and heat.\n"
    "4. Return ONLY a valid JSON array with no markdown, no explanation, no preamble.\n\n"
    "The JSON schema must be exactly:\n"
    "[\n"
    "  {\n"
    '    "rank": 1,\n'
    '    "team_name": "Team Name Here",\n'
    '    "owner": "OwnerName",\n'
    '    "outlook": "Contender",\n'
    '    "power_score": 88,\n'
    '    "blurb": "Your savage 3-5 sentence blurb here."\n'
    "  }\n"
    "]\n\n"
    "Rules:\n"
    "- rank 1 = best dynasty team, rank last = worst\n"
    "- power_score is an integer from 0-100 reflecting your holistic judgment. "
    "It is NOT simply derived from rank — the #1 team does not automatically get 100. "
    "Score teams on their actual merits; tight clusters and large gaps are both valid.\n"
    "- Do NOT just follow the Value Rank order. Use your judgment based on ALL the data.\n"
    "- Make cross-team comparisons and jokes where appropriate.\n"
    "- Be specific: reference actual player names, pick counts, positional weaknesses.\n"
    "- Return ONLY the JSON array. Nothing else."
)


class handler(BaseHTTPRequestHandler):

    def do_GET(self):
        start_time = time.time()
        try:
            self._handle(start_time)
        except Exception:
            tb = traceback.format_exc()
            print(f"power-rankings.py unhandled error:\n{tb}")
            last_line = tb.strip().splitlines()[-1]
            self._respond(500, {"error": f"Internal server error: {last_line}"})
        finally:
            elapsed = time.time() - start_time
            print(f"power-rankings.py execution time: {elapsed:.2f}s")

    def _handle(self, start_time):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        league_id_list = params.get("league_id", [])
        if not league_id_list:
            return self._respond(400, {"error": "league_id is required"})
        league_id = league_id_list[0]

        if not ANTHROPIC_API_KEY:
            return self._respond(500, {"error": "ANTHROPIC_API_KEY not configured"})

        # ── KV cache — 6-hour TTL; AI generation is expensive ─────────────────
        cache_key = f"power_rankings_{league_id}"
        cached = kv_get(cache_key)
        if cached is not None:
            print(f"power-rankings.py KV HIT: {cache_key}")
            return self._respond(200, cached, cache_status='HIT')

        # ── Fetch league roster data from /api/league (already KV-cached) ──────
        league_resp = requests.get(
            f"{LEAGUE_API_URL}?league_id={league_id}",
            timeout=30,
        )
        if not league_resp.ok:
            return self._respond(500, {
                "error": f"Failed to fetch league data: {league_resp.status_code}"
            })
        league_data = league_resp.json()

        rosters = league_data.get('rosters', [])
        n_teams = len(rosters)
        if n_teams == 0:
            return self._respond(500, {"error": "No rosters found for this league"})

        # ── Build prompt — all teams in one call ───────────────────────────────
        # Rosters arrive sorted by total_ktc descending from /api/league,
        # so value_rank = index + 1.
        teams_text = '\n'.join(
            _format_team_block(r, i + 1, n_teams) for i, r in enumerate(rosters)
        )
        user_message = (
            f"Here is the data for all {n_teams} teams in our dynasty league. "
            f"Generate power rankings ranked 1 (best) to {n_teams} (worst) with a "
            f"power_score and blurb for each team. Return ONLY the JSON array.\n\n"
            f"{teams_text}"
        )

        print(f"power-rankings.py calling Anthropic for league {league_id} "
              f"({n_teams} teams), elapsed so far: {time.time() - start_time:.2f}s")

        anthropic_resp = requests.post(
            ANTHROPIC_API_URL,
            headers={
                "x-api-key":         ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type":      "application/json",
            },
            json={
                "model":      ANTHROPIC_MODEL,
                "max_tokens": 4096,
                "system":     SYSTEM_PROMPT,
                "messages":   [{"role": "user", "content": user_message}],
            },
            timeout=50,
        )
        if not anthropic_resp.ok:
            print(f"Anthropic error: {anthropic_resp.status_code} {anthropic_resp.text[:300]}")
            return self._respond(500, {
                "error": f"Anthropic API error: {anthropic_resp.status_code}"
            })

        raw_text = anthropic_resp.json()['content'][0]['text'].strip()

        # Strip accidental markdown code fences (model occasionally adds them)
        if raw_text.startswith('```'):
            lines = raw_text.split('\n')
            raw_text = '\n'.join(lines[1:])
            if raw_text.endswith('```'):
                raw_text = raw_text[:-3].rstrip()

        try:
            rankings_raw = json.loads(raw_text)
        except json.JSONDecodeError as e:
            print(f"power-rankings.py JSON parse error: {e}\nRaw: {raw_text[:500]}")
            return self._respond(500, {"error": "Failed to parse AI response as JSON"})

        # Normalize fields; clamp power_score to [0, 100]
        rankings = []
        for item in rankings_raw:
            try:
                score = max(0, min(100, int(item.get('power_score', 50))))
            except (TypeError, ValueError):
                score = 50
            rankings.append({
                'rank':       int(item.get('rank', 0)),
                'team_name':  str(item.get('team_name', '')),
                'owner':      str(item.get('owner', '')),
                'outlook':    str(item.get('outlook', '')),
                'power_score': score,
                'blurb':      str(item.get('blurb', '')),
            })

        result = {
            'generated_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'rankings':     sorted(rankings, key=lambda x: x['rank']),
        }

        kv_set(cache_key, result, POWER_RANKINGS_TTL)
        self._respond(200, result)

    def _respond(self, status, body, cache_status='MISS'):
        payload = json.dumps(body).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('x-cache-status', cache_status)
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        pass
