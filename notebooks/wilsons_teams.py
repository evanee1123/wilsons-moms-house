#!/usr/bin/env python
# coding: utf-8

# In[ ]:


# ============================================================
# 1. Dynasty Fantasy Football Analysis
# ============================================================

import requests
import pandas as pd
import numpy as np
import gspread
from google.oauth2.service_account import Credentials
from google.auth.exceptions import DefaultCredentialsError
from difflib import get_close_matches
from itertools import combinations
from functools import reduce
import nfl_data_py as nfl
import time
import json
import os

# ============================================================
# Config
# ============================================================

LEAGUE_ID   = "1312130103358021632"
MY_USERNAME = "ekleiner1123"
OUTPUT_DIR  = "/Users/evankleiner/wilsons-moms-house/public/data"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

# League roster settings
PURE_STARTERS = {"QB": 1, "RB": 2, "WR": 2, "TE": 1}
FLEX_SPOTS    = [
    {"name": "FLEX", "eligible": ["WR", "RB", "TE"], "count": 2},
    {"name": "SFLX", "eligible": ["QB", "WR", "RB", "TE"], "count": 1},
]
ROUNDS = [1, 2, 3, 4]

# Playoff Picture simulation
REGULAR_SEASON_WEEKS = 14
PLAYOFF_SPOTS        = 6
SIM_ITERATIONS       = 1000

from datetime import datetime
def get_current_season():
    now = datetime.now()
    return now.year if now.month >= 7 else now.year - 1

current_season = get_current_season()
YEARS = [str(current_season+1), str(current_season+2), str(current_season+3), str(current_season+4)]
CURRENT_DRAFT_YEAR = str(current_season + 1)  # the upcoming draft year

# Tier order
TIER_ORDER = [
    "Cornerstone", "Upside Premier", "Foundational", "Mainstay",
    "Productive Vet", "Short-term Winner", "Upside Shot",
    "Short-term Production", "Serviceable",
    "Jag Developmental", "Jag Insurance", "Replaceable"
]
tier_rank_map = {t: i for i, t in enumerate(TIER_ORDER)}

# Position need weights for trade engine
POSITION_NEED = {"RB": 1.0, "WR": 0.5, "QB": 0.3, "TE": 0.2}

# Sell likelihood by outlook
SELL_LIKELIHOOD = {
    "Rebuild":                    1.0,
    "Rebuild (future value)":     0.9,
    "Window Contender":           0.8,
    "Reload":                     0.6,
    "Reload (sell vets for youth)": 0.7,
    "Contender (needs production)": 0.3,
    "Contender":                  0.2,
}

# Untouchable players
UNTOUCHABLE = [
    "Trey McBride",
    "Drake Maye",
    "Puka Nacua",
    "Tetairoa McMillan",
    "Cam Ward",
]

print("Config loaded ✅")


# In[ ]:


# ============================================================
# 2. Pull Sleeper Roster Data
# ============================================================

print("Fetching NFL player database...")
players_db = requests.get("https://api.sleeper.app/v1/players/nfl").json()

users      = requests.get(f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/users").json()
user_map   = {u["user_id"]: u.get("display_name", u.get("username", "Unknown")) for u in users}
rosters    = requests.get(f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/rosters").json()
my_user    = requests.get(f"https://api.sleeper.app/v1/user/{MY_USERNAME}").json()
my_user_id = my_user["user_id"]

roster_id_map = {r["roster_id"]: user_map.get(r["owner_id"], "Unknown") for r in rosters}

# Build master player list
all_players = []
for roster in rosters:
    owner_id   = roster["owner_id"]
    owner_name = user_map.get(owner_id, "Unknown")
    is_me      = owner_id == my_user_id
    all_pids   = list(set((roster.get("players") or []) + (roster.get("taxi") or [])))

    for pid in all_pids:
        p        = players_db.get(pid, {})
        position = p.get("position", "")
        if position not in ["QB", "RB", "WR", "TE"]:
            continue
        all_players.append({
            "player_id": pid,
            "name":      f"{p.get('first_name','')} {p.get('last_name','')}".strip(),
            "position":  position,
            "nfl_team":  p.get("team", "FA"),
            "age":       p.get("age"),
            "years_exp": p.get("years_exp"),
            "on_taxi":   pid in (roster.get("taxi") or []),
            "owner":     owner_name,
            "is_my_team": is_me,
        })

league_df = pd.DataFrame(all_players)
print(f"Rosters loaded: {len(rosters)} teams, {len(league_df)} skill position players ✅")


# In[ ]:


# ============================================================
# 3. Scrape KTC Rankings Directly
# ============================================================

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup
import time
import random

def scrape_ktc_page(page_num, driver):
    """Scrape a single page of KTC rankings."""
    url = f"https://keeptradecut.com/dynasty-rankings?page={page_num}&filters=QB|WR|RB|TE|RDP"
    driver.get(url)
    try:
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CLASS_NAME, "onePlayer"))
        )
    except:
        print(f"  Page {page_num}: timeout")
        return []
    time.sleep(2)

    soup    = BeautifulSoup(driver.page_source, "html.parser")
    players = soup.find_all(class_="onePlayer")
    results = []

    for p in players:
        try:
            # Name
            name_tag = p.find(class_="player-name")
            name     = name_tag.find("a").text.strip() if name_tag else None

            # Team
            team_tag = name_tag.find(class_="player-team") if name_tag else None
            team     = team_tag.text.strip() if team_tag else None

            # Position
            pos_tag  = p.find(class_="position-team")
            position = pos_tag.find(class_="position").text.strip() if pos_tag else None

            # Age
            age_tag = pos_tag.find(class_="age") if pos_tag else None
            age_str = age_tag.text.strip().replace("y.o.", "").strip() if age_tag else None
            try:
                age = float(age_str) if age_str and age_str != "N/A" else None
            except ValueError:
                age = None

            # Value
            val_tag = p.find(class_="value")
            value   = int(val_tag.find("p").text.strip()) if val_tag else None

            if name and value is not None:
                results.append({
                    "Player":   name,
                    "Team":     team,
                    "Position": position,
                    "Age":      age,
                    "Value":    value,
                })
        except Exception as e:
            print(f"  Error parsing player: {e}")
            continue

    return results


def scrape_ktc_all_pages(max_pages=10):
    """
    Scrape all pages of KTC rankings.
    Stops when a page returns 0 players.
    """
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    driver = webdriver.Chrome(
        service=Service(ChromeDriverManager().install()),
        options=options
    )

    all_players = []
    try:
        for page in range(max_pages):
            print(f"  Scraping page {page}...")
            results = scrape_ktc_page(page, driver)
            print(f"    Found {len(results)} players")

            if len(results) == 0:
                print(f"  No players found on page {page} — stopping")
                break

            all_players.extend(results)
            time.sleep(1)
    finally:
        driver.quit()

    return all_players


# ---- Run the scraper ----
print("Scraping KTC rankings...")
raw_players = scrape_ktc_all_pages(max_pages=10)
print(f"\nTotal scraped: {len(raw_players)}")

# ---- Build rankings_df ----
rankings_df = pd.DataFrame(raw_players)

# Clean position — strip number suffix (e.g. "WR1" -> "WR")
rankings_df["position_clean"] = rankings_df["Position"].str.extract(r"([A-Z]+)")

# Separate picks from players
picks_ktc   = rankings_df[rankings_df["position_clean"] == "PICK"].copy()
rankings_df = rankings_df[rankings_df["position_clean"] != "PICK"].copy()

# Picks — name is already clean (e.g. "2026 Early 1st")
picks_ktc["Name"] = picks_ktc["Player"]

# Rename Value column
rankings_df = rankings_df.rename(columns={"Value": "KTC Value"})
picks_ktc   = picks_ktc.rename(columns={"Value": "KTC Value"})

# ---- Generate synthetic pick values for the furthest draft year if KTC doesn't have them yet ----
PICK_TIERS  = ["Early", "Mid", "Late"]
PICK_ROUNDS = ["1st", "2nd", "3rd", "4th"]
existing_years = picks_ktc["Name"].str.extract(r"(\d{4})")[0].dropna().unique().tolist()

# YEARS is already defined in config as [current+1, current+2, current+3]
furthest_year = YEARS[-1]   # e.g. "2029" this year, "2030" next year
baseline_year = YEARS[-2]   # e.g. "2028" this year, "2029" next year

if furthest_year not in existing_years and baseline_year in existing_years:
    print(f"\n{furthest_year} picks not found in KTC — generating from {baseline_year} values with ±10% variance...")
    synthetic_picks = []
    for tier in PICK_TIERS:
        for round_str in PICK_ROUNDS:
            match = picks_ktc[picks_ktc["Name"].str.contains(
                f"{baseline_year}.*{tier}.*{round_str}", case=False, na=False
            )]
            if not match.empty:
                base_value = match.iloc[0]["KTC Value"]
                new_value  = round(base_value * random.uniform(0.90, 1.10))
                pick_name  = match.iloc[0]["Name"].replace(baseline_year, furthest_year)
                synthetic_picks.append({"Name": pick_name, "KTC Value": new_value})
                print(f"  {pick_name}: {new_value} (base {baseline_year} {tier} {round_str}: {base_value})")
            else:
                print(f"  WARNING: No {baseline_year} {tier} {round_str} found — skipping {furthest_year} {tier} {round_str}")

    if synthetic_picks:
        synthetic_df = pd.DataFrame(synthetic_picks)
        for col in picks_ktc.columns:
            if col not in synthetic_df.columns:
                synthetic_df[col] = None
        picks_ktc = pd.concat([picks_ktc, synthetic_df], ignore_index=True)
        print(f"  ✅ Added {len(synthetic_picks)} synthetic {furthest_year} picks")
elif furthest_year in existing_years:
    print(f"\n{furthest_year} picks found in KTC — using real values, no generation needed")

# Use picks_ktc as all_picks for the pick portfolio builder
all_picks = picks_ktc[["Name", "KTC Value"]].copy()

# ---- Summary ----
print(f"\n✅ KTC scrape complete — {len(rankings_df)} players, {len(picks_ktc)} picks")
print(f"   Top player: {rankings_df.iloc[0]['Player']} ({rankings_df.iloc[0]['KTC Value']:,})")
print(f"   Last player: {rankings_df.iloc[-1]['Player']} ({rankings_df.iloc[-1]['KTC Value']:,})")
print(f"   Pick range: {picks_ktc['KTC Value'].max():,} (highest) — {picks_ktc['KTC Value'].min():,} (lowest)")
print(f"   Pick years present: {sorted(picks_ktc['Name'].str.extract(r'(\\d{4})')[0].dropna().unique().tolist())}")


# In[ ]:


# ============================================================
# 4. Calculate Multi-Year Fantasy Production (2022-2025)
# ============================================================

# print("Loading play-by-play data 2022-2025...")
# pbp_dynasty = nfl.import_pbp_data([2022, 2023, 2024, 2025])
from datetime import datetime

def get_pbp_seasons(n_years=4):
    """
    Automatically determine which seasons to pull.
    NFL season year = the year the season starts (e.g. 2024 season = Sept 2024)
    Current season is 2024 if we're before July, 2025 if after.
    """
    current_year  = datetime.now().year
    current_month = datetime.now().month
    # NFL season starts in September — if before July assume previous season just ended
    latest_season = current_year if current_month >= 7 else current_year - 1
    return list(range(latest_season - n_years + 1, latest_season + 1))

SEASONS = get_pbp_seasons(n_years=4)
print(f"Pulling seasons: {SEASONS}")
pbp_dynasty = nfl.import_pbp_data(SEASONS)

pbp         = pbp_dynasty.copy()

# Passing
pass_game = pbp[pbp["passer_player_id"].notna()].groupby(
    ["season", "week", "passer_player_id"]
).agg(
    pass_yards    = ("passing_yards",  "sum"),
    pass_tds      = ("pass_touchdown", "sum"),
    interceptions = ("interception",   "sum"),
).reset_index().rename(columns={"passer_player_id": "player_id"})
pass_game["pass_pts"] = (pass_game["pass_yards"] * 0.04 +
                         pass_game["pass_tds"]    * 4.0  +
                         pass_game["interceptions"] * -1.0).round(2)

# Rushing
rush_game = pbp[pbp["rusher_player_id"].notna()].groupby(
    ["season", "week", "rusher_player_id"]
).agg(
    rush_yards   = ("rushing_yards",  "sum"),
    rush_tds     = ("rush_touchdown", "sum"),
    fumbles_lost = ("fumble_lost",    "sum"),
).reset_index().rename(columns={"rusher_player_id": "player_id"})
rush_game["rush_pts"] = (rush_game["rush_yards"]   * 0.1  +
                         rush_game["rush_tds"]      * 6.0  +
                         rush_game["fumbles_lost"]  * -2.0).round(2)

# Receiving
rec_game = pbp[(pbp["receiver_player_id"].notna()) &
               (pbp["complete_pass"] == 1)].groupby(
    ["season", "week", "receiver_player_id"]
).agg(
    receptions = ("complete_pass",   "sum"),
    rec_yards  = ("receiving_yards", "sum"),
    rec_tds    = ("pass_touchdown",  "sum"),
).reset_index().rename(columns={"receiver_player_id": "player_id"})
rec_game["rec_pts"] = (rec_game["receptions"] * 1.0 +
                       rec_game["rec_yards"]   * 0.1 +
                       rec_game["rec_tds"]     * 6.0).round(2)

# Merge and total
fantasy_game = reduce(
    lambda l, r: pd.merge(l, r, on=["season", "week", "player_id"], how="outer"),
    [pass_game[["season", "week", "player_id", "pass_pts"]],
     rush_game[["season", "week", "player_id", "rush_pts"]],
     rec_game[["season",  "week", "player_id", "rec_pts"]]]
).fillna(0)
fantasy_game["total_pts"] = (fantasy_game["pass_pts"] +
                              fantasy_game["rush_pts"] +
                              fantasy_game["rec_pts"])
fantasy_game = fantasy_game[fantasy_game["total_pts"] > 0]

# Season aggregation — best 3 of 4 years by PPG
season_stats = fantasy_game.groupby(["season", "player_id"]).agg(
    total_pts = ("total_pts", "sum"),
    games     = ("total_pts", "count"),
    ppg       = ("total_pts", "mean"),
).reset_index()
season_stats = season_stats[season_stats["games"] >= 6]

def best_3_of_4(player_seasons):
    top3 = player_seasons.nlargest(min(3, len(player_seasons)), "ppg")
    return pd.Series({
        "avg_ppg":         top3["ppg"].mean(),
        "n_seasons":       len(player_seasons),
        "best_season_ppg": top3["ppg"].max(),
    })

multi_year_prod = season_stats.groupby("player_id").apply(
    best_3_of_4, include_groups=False
).reset_index()

# Map player IDs to names
player_ids_db = nfl.import_ids()
id_map = player_ids_db[["gsis_id", "name", "position"]].dropna(
    subset=["gsis_id"]
).drop_duplicates(subset="gsis_id")

multi_year_prod = multi_year_prod.merge(
    id_map, left_on="player_id", right_on="gsis_id", how="left"
)

# Normalize within position
multi_year_prod["position_clean"] = multi_year_prod["position"].str.extract(r"([A-Z]+)")
pos_max = multi_year_prod.groupby("position_clean")["avg_ppg"].transform("max")
multi_year_prod["multi_year_prod_score"] = (
    multi_year_prod["avg_ppg"] / pos_max * 10000
).fillna(0).round(1)

print(f"Multi-year production calculated: {len(multi_year_prod)} players ✅")


# In[ ]:


# ============================================================
# 5. Player ID Lookup (gsis_id mapping)
# ============================================================
# nflfastR advanced-stats pulls (EPA, snap counts, target share, RZ carries,
# draft capital) were removed here — tier assignment now comes from
# public/data/playerTiers.json (see scripts/classify_tiers.py) instead of the
# formula-based score_rb/wr/te/qb functions. This section is kept only because
# gsis_id (used for career season stats matching in section 15 and by the
# frontend's PlayerDetailModal) is derived from nflfastR's player ID table.

import nfl_data_py as nfl

# ---- Build ID to full name lookup ----
print("Building player ID lookup...")
participants = nfl.import_players()

id_to_name = participants[
    participants["gsis_id"].str.startswith("00-", na=False) &
    participants["display_name"].notna()
].set_index("gsis_id")["display_name"].to_dict()

print(f"ID lookup built: {len(id_to_name)} players")

# Build name to gsis_id lookup
name_to_gsis = participants[
    participants["display_name"].notna() &
    participants["gsis_id"].str.startswith("00-", na=False)
].set_index("display_name")["gsis_id"].to_dict()

print(f"name_to_gsis built: {len(name_to_gsis)} players")
print(f"Sample: {list(name_to_gsis.items())[:3]}")


# In[ ]:


# ============================================================
# 6. Merge Multi-Year Production into Rankings
# ============================================================

# ---- Reset rankings_df to clean state before merging ----
cols_to_drop = ["multi_year_prod_score", "avg_ppg", "n_seasons",
                "best_season_ppg", "combined_score", "tier", "tier_rank",
                "name", "multi_year_prod_score_x", "multi_year_prod_score_y"]
rankings_df = rankings_df.drop(
    columns=[c for c in cols_to_drop if c in rankings_df.columns]
)

# Merge multi-year production
rankings_df = rankings_df.merge(
    multi_year_prod[["name","avg_ppg","n_seasons",
                     "best_season_ppg","multi_year_prod_score"]],
    left_on="Player", right_on="name", how="left"
).drop(columns=["name"], errors="ignore")

# Fallback for rookies
rankings_df["multi_year_prod_score"] = rankings_df["multi_year_prod_score"].fillna(
    rankings_df["KTC Value"] * 0.3
).where(
    rankings_df["multi_year_prod_score"].fillna(0) > 0,
    rankings_df["KTC Value"] * 0.3
).round(1)

rankings_df["n_seasons"] = rankings_df["n_seasons"].fillna(0)
rankings_df["avg_ppg"]   = rankings_df["avg_ppg"].fillna(0)

# Combined score — used in grading and trade engine
rankings_df["combined_score"] = rankings_df.apply(
    lambda r: (r["KTC Value"] * 0.7 + r["multi_year_prod_score"] * 0.3
               if r["multi_year_prod_score"] > 0
               else r["KTC Value"]),
    axis=1
).round(1)

# Placeholder tier — will be replaced by AI-classified tier lookup below
rankings_df["tier"]      = "Unclassified"
rankings_df["tier_rank"] = 99

print(f"✅ Rankings merged with multi-year production")
print(f"   Players with production history: {rankings_df['avg_ppg'].gt(0).sum()}")
print(f"   Players without history (rookies): {rankings_df['avg_ppg'].eq(0).sum()}")


# In[ ]:


# ============================================================
# 7. Match Rosters to KTC + Build merged_df
# ============================================================

# Name fixes
name_fixes = {
    "Chig Okonkwo": "Chigoziem Okonkwo",
}
league_df["name_fixed"] = league_df["name"].map(name_fixes).fillna(league_df["name"])

ktc_names = rankings_df["Player"].tolist()
league_df["ktc_name"] = league_df["name_fixed"].apply(
    lambda n: get_close_matches(n, ktc_names, n=1, cutoff=0.85)[0]
    if get_close_matches(n, ktc_names, n=1, cutoff=0.85) else None
)

merged_df = league_df.merge(
    rankings_df[["Player", "position_clean", "Age", "KTC Value",
                 "combined_score", "multi_year_prod_score", "avg_ppg",
                 "n_seasons", "tier", "tier_rank"]],
    left_on="ktc_name", right_on="Player", how="left"
).drop(columns=["Player"], errors="ignore")

# Add after merged_df is created in cell 5
merged_df = merged_df.drop_duplicates(subset=["name", "position"], keep="first")
print(f"After dedup: {len(merged_df)} players")

# Fill missing values
for col in ["KTC Value", "combined_score", "multi_year_prod_score", "avg_ppg"]:
    merged_df[col] = merged_df[col].fillna(0)
merged_df["Age"]       = merged_df["Age"].fillna(merged_df["age"])
merged_df["tier"]      = merged_df["tier"].fillna("Replaceable")
merged_df["tier_rank"] = merged_df["tier_rank"].fillna(99)
merged_df["n_seasons"] = merged_df["n_seasons"].fillna(0)

print(f"✅ Merged df: {merged_df.shape} — "
      f"{merged_df['KTC Value'].gt(0).sum()} matched, "
      f"{merged_df['KTC Value'].eq(0).sum()} unmatched")

# Show unmatched
unmatched = merged_df[merged_df["KTC Value"] == 0][["name","position","owner"]]
if not unmatched.empty:
    print(f"\nUnmatched players:")
    print(unmatched.to_string(index=False))


# In[ ]:


# ============================================================
# 8. Load Draft Picks
# ============================================================

# Pull traded picks from Sleeper
traded_picks = requests.get(
    f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/traded_picks"
).json()

# Get upcoming draft dynamically
drafts = requests.get(f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/drafts").json()
upcoming_draft = next(
    (d for d in drafts if d['status'] in ['pre_draft', 'drafting']),
    drafts[0] if drafts else None
)
DRAFT_ID       = upcoming_draft['draft_id']
draft_details  = requests.get(f"https://api.sleeper.app/v1/draft/{DRAFT_ID}").json()
slot_to_roster = draft_details["slot_to_roster_id"]
print(f"Draft ID: {DRAFT_ID} | Status: {upcoming_draft['status']}")

# Build slot to owner name map
slot_to_owner = {}
for slot_str, roster_id in slot_to_roster.items():
    slot  = int(slot_str)
    owner = roster_id_map.get(roster_id, 'Unknown')
    slot_to_owner[slot] = owner

n_teams = len(slot_to_roster)

def pick_tier_current(slot, n_teams=10):
    equivalent_slot = round(slot * 12 / n_teams)
    if equivalent_slot <= 4:   return "Early"
    elif equivalent_slot <= 8: return "Mid"
    else:                      return "Late"

def default_future_tier(round_num):
    if round_num in [1, 2]: return "Mid"
    else:                   return "Early"

def pick_display_name(year, round_num, slot, tier, n_teams=10):
    round_str = {1:"1st", 2:"2nd", 3:"3rd", 4:"4th"}.get(round_num, f"{round_num}th")
    if year == CURRENT_DRAFT_YEAR and slot is not None and upcoming_draft['status'] not in ['complete']:
        pick_num = str(int(slot)).zfill(2)
        return f"{CURRENT_DRAFT_YEAR} {round_num}.{pick_num}"
    else:
        return f"{year} {tier} {round_str}"

def pick_ktc_name(year, round_num, tier):
    if round_num == 4:
        return f"{year} Late 3rd"
    round_str = {1:"1st", 2:"2nd", 3:"3rd", 4:"4th"}.get(round_num, f"{round_num}th")
    return f"{year} {tier} {round_str}"

# Build master pick list
all_league_picks = []

if upcoming_draft['status'] not in ['complete']:
    for slot_str, roster_id in slot_to_roster.items():
        slot = int(slot_str)
        for rnd in ROUNDS:
            all_league_picks.append({
                "year":           CURRENT_DRAFT_YEAR,
                "round":          rnd,
                "slot":           slot,
                "tier":           pick_tier_current(slot),
                "original_owner": roster_id,
                "current_owner":  roster_id,
            })
else:
    print(f"  Skipping {CURRENT_DRAFT_YEAR} picks — draft already complete")

future_years = YEARS[1:] if upcoming_draft['status'] not in ['complete'] else YEARS[1:]
for year in future_years:
    for roster in rosters:
        for rnd in ROUNDS:
            all_league_picks.append({
                "year":           year,
                "round":          rnd,
                "slot":           None,
                "tier":           default_future_tier(rnd),
                "original_owner": roster["roster_id"],
                "current_owner":  roster["roster_id"],
            })

# Apply trades
for tp in traded_picks:
    orig      = tp["roster_id"]
    new_owner = tp["owner_id"]
    year      = str(tp["season"])
    rnd       = tp["round"]
    for pick in all_league_picks:
        if (pick["original_owner"] == orig and pick["year"] == year and
                pick["round"] == rnd and pick["current_owner"] == orig):
            pick["current_owner"] = new_owner
            break

picks_master_df = pd.DataFrame(all_league_picks)
picks_master_df["original_owner_name"] = picks_master_df["original_owner"].map(roster_id_map)
picks_master_df["current_owner_name"]  = picks_master_df["current_owner"].map(roster_id_map)

picks_master_df["pick_display_name"] = picks_master_df.apply(
    lambda r: pick_display_name(r["year"], r["round"], r["slot"], r["tier"]), axis=1
)
picks_master_df["ktc_lookup_name"] = picks_master_df.apply(
    lambda r: pick_ktc_name(r["year"], r["round"], r["tier"]), axis=1
)

picks_master_df["ktc_value"] = picks_master_df["ktc_lookup_name"].apply(
    lambda name: all_picks[all_picks["Name"] == name]["KTC Value"].iloc[0]
    if name in all_picks["Name"].values else 0
)

print(f"✅ Pick portfolio built: {len(picks_master_df)} picks")
print(f"   Pick years in all_picks: {sorted(all_picks['Name'].str.extract(r'(\\d{4})')[0].dropna().unique().tolist())}")

# Sample output
first_future = future_years[0]
print(f"\nSample {first_future} picks:")
print(picks_master_df[picks_master_df["year"] == first_future].head(5)[
    ["year","round","pick_display_name","original_owner_name","current_owner_name","ktc_value"]
].to_string(index=False))

second_future = future_years[1] if len(future_years) > 1 else None
if second_future:
    print(f"\nSample {second_future} picks:")
    print(picks_master_df[picks_master_df["year"] == second_future].head(5)[
        ["year","round","pick_display_name","original_owner_name","current_owner_name","ktc_value"]
    ].to_string(index=False))


# In[ ]:


# ============================================================
# 9. Build gsis_id Lookup
# ============================================================
import re

# ---- Fix name lookup — handle suffixes and nicknames ----
def clean_name(name):
    return re.sub(r'\s+(Jr\.?|Sr\.?|II|III|IV|V)$', '', name, flags=re.IGNORECASE).strip()

name_to_gsis_clean = {}
for display, gsis in name_to_gsis.items():
    name_to_gsis_clean[display] = gsis
    cleaned = clean_name(display)
    if cleaned != display:
        name_to_gsis_clean[cleaned] = gsis

MANUAL_OVERRIDES = {
    "Kenneth Walker":   name_to_gsis.get("Kenneth Walker III"),
    "Brian Thomas":     name_to_gsis.get("Brian Thomas Jr."),
    "Jimmy Horn":       name_to_gsis.get("Jimmy Horn Jr."),
    "Chris Rodriguez":  name_to_gsis.get("Chris Rodriguez Jr."),
    "Tre' Harris":      name_to_gsis.get("Tre Harris"),
    "Michael Penix":    name_to_gsis.get("Michael Penix Jr."),
    "Luther Burden":    name_to_gsis.get("Luther Burden III"),
    "Harold Fannin":    name_to_gsis.get("Harold Fannin Jr."),
    "Dont'e Thornton":  name_to_gsis.get("Dontae Thornton"),
    "Marvin Mims":      name_to_gsis.get("Marvin Mims Jr."),
    "Tyrone Tracy":     name_to_gsis.get("Tyrone Tracy Jr."),
    "Ollie Gordon":     name_to_gsis.get("Ollie Gordon II"),
    "Calvin Austin":    name_to_gsis.get("Calvin Austin III"),
}
for name, gsis in MANUAL_OVERRIDES.items():
    if gsis:
        name_to_gsis_clean[name] = gsis

# Manual ID fixes where PBP ID differs from participants ID
name_to_gsis_clean["Lamar Jackson"] = "00-0034796"

merged_df["gsis_id"] = merged_df["name"].map(name_to_gsis_clean)

print(f"Players matched to gsis_id: {merged_df['gsis_id'].notna().sum()} / {len(merged_df)}")
print("Unmatched players:")
print(merged_df[merged_df["gsis_id"].isna()][["name","position","owner"]].to_string(index=False))


# In[ ]:


# ============================================================
# 10. AI-Classified Tier Assignment
# ============================================================
# Tiers come from public/data/playerTiers.json, produced by scripts/classify_tiers.py
# — a standalone script run manually 2-5x/year that makes a single Anthropic API call
# to classify every rostered player into a tier. This section only performs the
# lookup + fallback; it does not call the Anthropic API and does not run the old
# formula-based score_rb/score_wr/score_te/score_qb scoring.

with open(os.path.join(OUTPUT_DIR, "playerTiers.json")) as f:
    ai_tiers = json.load(f)

ai_tier_names = list(ai_tiers.keys())

# KTC-only tier thresholds — safety net for any player missing from playerTiers.json.
# Mirrors api/league.py's _assign_player_tier(), used there for external leagues.
_KTC_TIER_THRESHOLDS = [
    (6500, "Cornerstone"),
    (5500, "Foundational"),
    (4500, "Upside Premier"),
    (3500, "Mainstay"),
    (2500, "Serviceable"),
    (1500, "Jag Developmental"),
    (1,    "Replaceable"),
]

def _ktc_fallback_tier(ktc_value):
    for threshold, tier in _KTC_TIER_THRESHOLDS:
        if ktc_value >= threshold:
            return tier
    return "Replaceable"

def assign_ai_tier(row):
    name = row["name"]
    ktc  = row["KTC Value"] if pd.notna(row.get("KTC Value")) else 0

    if name in ai_tiers:
        return ai_tiers[name]

    match = get_close_matches(name, ai_tier_names, n=1, cutoff=0.85)
    if match:
        return ai_tiers[match[0]]

    return _ktc_fallback_tier(ktc)

merged_df["tier_new"] = merged_df.apply(assign_ai_tier, axis=1)

print("AI-classified tiers assigned ✅")
print(f"\nTier distribution:")
print(merged_df["tier_new"].value_counts())

print(f"\nCornerstone players:")
print(merged_df[merged_df["tier_new"] == "Cornerstone"][
    ["name","position","age","KTC Value","tier_new"]
].sort_values(["position","KTC Value"], ascending=[True, False]).to_string(index=False))

print(f"\nFoundational players:")
print(merged_df[merged_df["tier_new"] == "Foundational"][
    ["name","position","age","KTC Value","tier_new"]
].sort_values(["position","KTC Value"], ascending=[True, False]).to_string(index=False))

print(f"\nUpside Premier players:")
print(merged_df[merged_df["tier_new"] == "Upside Premier"][
    ["name","position","age","KTC Value","tier_new"]
].sort_values(["position","KTC Value"], ascending=[True, False]).to_string(index=False))

# Replace old tier with new AI-classified tier
merged_df["tier_old"] = merged_df["tier"]  # keep backup
merged_df["tier"]     = merged_df["tier_new"]

# Update tier_rank
tier_rank_map = {
    "Cornerstone":          1,
    "Foundational":         2,
    "Upside Premier":       3,
    "Mainstay":             4,
    "Productive Vet":       5,
    "Short-term Winner":    6,
    "Upside Shot":          7,
    "Short-term Production":8,
    "Serviceable":          9,
    "Jag Developmental":   10,
    "Jag Insurance":       11,
    "Replaceable":         12,
}
merged_df["tier_rank"] = merged_df["tier"].map(tier_rank_map).fillna(99)

print("✅ Tier column updated with AI-classified tiers")
print(f"\nFinal tier distribution:")
print(merged_df["tier"].value_counts())


# In[ ]:


# ============================================================
# 15. Career Season Stats from Sleeper API (2005-2025)
# ============================================================

import requests
import time
from datetime import datetime

def get_current_season():
    now = datetime.now()
    return now.year if now.month >= 7 else now.year - 1

CAREER_SEASONS = list(range(2005, get_current_season() + 1))
print(f"Pulling seasons: {CAREER_SEASONS[0]} — {CAREER_SEASONS[-1]}")

# Build Sleeper ID to position map from our rostered players
# players_db is already loaded from cell 1
sleeper_id_to_pos = {}
sleeper_id_to_name = {}
for pid, p in players_db.items():
    pos = p.get('position', '')
    if pos in ['QB', 'RB', 'WR', 'TE']:
        sleeper_id_to_pos[pid] = pos
        sleeper_id_to_name[pid] = p.get('full_name', '')

# Build gsis_id to sleeper_id map using merged_df
# merged_df has both sleeper player_id and gsis_id
gsis_to_sleeper = merged_df.dropna(subset=['gsis_id', 'player_id']).set_index('gsis_id')['player_id'].to_dict()
sleeper_to_gsis  = {v: k for k, v in gsis_to_sleeper.items()}

# Get rostered Sleeper IDs
rostered_sleeper_ids = set(merged_df['player_id'].dropna().tolist())
print(f"Rostered players: {len(rostered_sleeper_ids)}")

# Pull season stats for each year
print("Pulling Sleeper season stats...")
all_season_stats = {}

for year in CAREER_SEASONS:
    url = f"https://api.sleeper.app/v1/stats/nfl/regular/{year}?season_type=regular"
    res = requests.get(url).json()
    all_season_stats[year] = res
    print(f"  {year}: {len(res)} players")
    time.sleep(0.3)  # be nice to the API

print("✅ Season stats pulled")

# ---- Build position-specific stat rows ----
qb_rows = []
rb_rows = []
wr_rows = []
te_rows = []

for year, year_stats in all_season_stats.items():
    for sleeper_id, stats in year_stats.items():
        if sleeper_id not in rostered_sleeper_ids:
            continue

        pos  = sleeper_id_to_pos.get(sleeper_id, '')
        name = sleeper_id_to_name.get(sleeper_id, '')
        gsis = sleeper_to_gsis.get(sleeper_id, '')

        if not pos or not name:
            continue

        gp       = stats.get('gp', 0) or 0
        pts_ppr  = stats.get('pts_ppr', 0) or 0
        ppg      = round(pts_ppr / gp, 1) if gp > 0 else 0
        pos_rank = stats.get('pos_rank_ppr', None)
        fum_lost = stats.get('fum_lost', stats.get('fum', 0) or 0)  # use fum_lost if available

        base = {
            'GSIS ID':     gsis,
            'Sleeper ID':  sleeper_id,
            'Player':      name,
            'Season':      year,
            'Games':       int(gp),
            'Fantasy Pts': round(pts_ppr, 1),
            'PPG':         ppg,
            'Pos Rank':    int(pos_rank) if pos_rank else None,
        }

        if pos == 'QB':
            pass_att = stats.get('pass_att', 0) or 0
            pass_cmp = stats.get('pass_cmp', 0) or 0
            pass_yd  = stats.get('pass_yd', 0) or 0
            pass_td  = stats.get('pass_td', 0) or 0
            pass_int = stats.get('pass_int', 0) or 0
            rush_att = stats.get('rush_att', 0) or 0
            rush_yd  = stats.get('rush_yd', 0) or 0
            rush_td  = stats.get('rush_td', 0) or 0

            comp_pct    = round(pass_cmp / pass_att * 100, 1) if pass_att > 0 else 0
            yards_per_att = round(pass_yd / pass_att, 1) if pass_att > 0 else 0

            qb_rows.append({**base,
                'Completions':  int(pass_cmp),
                'Attempts':     int(pass_att),
                'Comp %':       comp_pct,
                'Pass Yards':   int(pass_yd),
                'Yds/Att':      yards_per_att,
                'Pass TDs':     int(pass_td),
                'INTs':         int(pass_int),
                'Rush Att':     int(rush_att),
                'Rush Yards':   int(rush_yd),
                'Rush TDs':     int(rush_td),
                'Fumbles Lost': int(fum_lost),
            })

        elif pos == 'RB':
            rush_att = stats.get('rush_att', 0) or 0
            rush_yd  = stats.get('rush_yd', 0) or 0
            rush_td  = stats.get('rush_td', 0) or 0
            rec_tgt  = stats.get('rec_tgt', 0) or 0
            rec      = stats.get('rec', 0) or 0
            rec_yd   = stats.get('rec_yd', 0) or 0
            rec_td   = stats.get('rec_td', 0) or 0

            touches      = int(rush_att + rec)
            ypc          = round(rush_yd / rush_att, 1) if rush_att > 0 else 0
            ypt          = round(rec_yd / rec_tgt, 1)  if rec_tgt > 0 else 0
            catch_rate   = round(rec / rec_tgt * 100, 1) if rec_tgt > 0 else 0

            rb_rows.append({**base,
                'Touches':      touches,
                'Rush Att':     int(rush_att),
                'Rush Yards':   int(rush_yd),
                'Yds/Carry':    ypc,
                'Rush TDs':     int(rush_td),
                'Targets':      int(rec_tgt),
                'Receptions':   int(rec),
                'Catch %':      catch_rate,
                'Rec Yards':    int(rec_yd),
                'Yds/Target':   ypt,
                'Rec TDs':      int(rec_td),
                'Fumbles Lost': int(fum_lost),
            })

        elif pos == 'WR':
            rec_tgt  = stats.get('rec_tgt', 0) or 0
            rec      = stats.get('rec', 0) or 0
            rec_yd   = stats.get('rec_yd', 0) or 0
            rec_td   = stats.get('rec_td', 0) or 0
            air_yd   = stats.get('rec_air_yd', 0) or 0
            yac      = stats.get('rec_yac', 0) or 0
            rush_att = stats.get('rush_att', 0) or 0
            rush_yd  = stats.get('rush_yd', 0) or 0
            rush_td  = stats.get('rush_td', 0) or 0

            catch_rate = round(rec / rec_tgt * 100, 1) if rec_tgt > 0 else 0
            ypt        = round(rec_yd / rec_tgt, 1)    if rec_tgt > 0 else 0
            ypr        = round(rec_yd / rec, 1)         if rec > 0    else 0

            wr_rows.append({**base,
                'Targets':      int(rec_tgt),
                'Receptions':   int(rec),
                'Catch %':      catch_rate,
                'Rec Yards':    int(rec_yd),
                'Yds/Target':   ypt,
                'Yds/Rec':      ypr,
                'Rec TDs':      int(rec_td),
                'Air Yards':    int(air_yd),
                'YAC':          int(yac),
                'Rush Att':     int(rush_att),
                'Rush Yards':   int(rush_yd),
                'Rush TDs':     int(rush_td),
                'Fumbles Lost': int(fum_lost),
            })

        elif pos == 'TE':
            rec_tgt  = stats.get('rec_tgt', 0) or 0
            rec      = stats.get('rec', 0) or 0
            rec_yd   = stats.get('rec_yd', 0) or 0
            rec_td   = stats.get('rec_td', 0) or 0
            air_yd   = stats.get('rec_air_yd', 0) or 0
            yac      = stats.get('rec_yac', 0) or 0
            rush_att = stats.get('rush_att', 0) or 0
            rush_yd  = stats.get('rush_yd', 0) or 0
            rush_td  = stats.get('rush_td', 0) or 0

            catch_rate = round(rec / rec_tgt * 100, 1) if rec_tgt > 0 else 0
            ypt        = round(rec_yd / rec_tgt, 1)    if rec_tgt > 0 else 0
            ypr        = round(rec_yd / rec, 1)         if rec > 0    else 0

            te_rows.append({**base,
                'Targets':      int(rec_tgt),
                'Receptions':   int(rec),
                'Catch %':      catch_rate,
                'Rec Yards':    int(rec_yd),
                'Yds/Target':   ypt,
                'Yds/Rec':      ypr,
                'Rec TDs':      int(rec_td),
                'Air Yards':    int(air_yd),
                'YAC':          int(yac),
                'Rush Att':     int(rush_att),
                'Rush Yards':   int(rush_yd),
                'Rush TDs':     int(rush_td),
                'Fumbles Lost': int(fum_lost),
            })

# ---- Convert to DataFrames ----
# Filter out seasons with no stats
def has_meaningful_stats(row, pos):
    if pos == 'QB':
        return row.get('Attempts', 0) > 0
    elif pos == 'RB':
        return row.get('Rush Att', 0) > 0 or row.get('Receptions', 0) > 0
    elif pos in ['WR', 'TE']:
        return row.get('Targets', 0) > 0 or row.get('Rush Att', 0) > 0
    return False

qb_df = pd.DataFrame(qb_rows)
qb_df = qb_df[qb_df.apply(lambda r: has_meaningful_stats(r, 'QB'), axis=1)]
qb_df = qb_df.sort_values(['Player','Season'], ascending=[True,False])

rb_df = pd.DataFrame(rb_rows)
rb_df = rb_df[rb_df.apply(lambda r: has_meaningful_stats(r, 'RB'), axis=1)]
rb_df = rb_df.sort_values(['Player','Season'], ascending=[True,False])

wr_df = pd.DataFrame(wr_rows)
wr_df = wr_df[wr_df.apply(lambda r: has_meaningful_stats(r, 'WR'), axis=1)]
wr_df = wr_df.sort_values(['Player','Season'], ascending=[True,False])

te_df = pd.DataFrame(te_rows)
te_df = te_df[te_df.apply(lambda r: has_meaningful_stats(r, 'TE'), axis=1)]
te_df = te_df.sort_values(['Player','Season'], ascending=[True,False])

print(f"\nRows built:")
print(f"  QB: {len(qb_df)}")
print(f"  RB: {len(rb_df)}")
print(f"  WR: {len(wr_df)}")
print(f"  TE: {len(te_df)}")


# In[ ]:


# ============================================================
# 16. Build All Analysis
# ============================================================

# ---- Lineup logic ----
def get_starters(team_df):
    available = team_df.copy().sort_values("combined_score", ascending=False)
    starters, used_ids = [], set()
    for pos, count in PURE_STARTERS.items():
        for _, p in available[(available["position"] == pos) &
                               (~available["player_id"].isin(used_ids))].head(count).iterrows():
            starters.append({**p, "slot": pos}); used_ids.add(p["player_id"])
    for flex in FLEX_SPOTS:
        for _ in range(flex["count"]):
            elig = available[(available["position"].isin(flex["eligible"])) &
                             (~available["player_id"].isin(used_ids))].head(1)
            if not elig.empty:
                p = elig.iloc[0]; starters.append({**p, "slot": flex["name"]}); used_ids.add(p["player_id"])
    for _, p in available[~available["player_id"].isin(used_ids)].iterrows():
        starters.append({**p, "slot": "BENCH"})
    return pd.DataFrame(starters)

# ---- Roster grades ----
def grade_team(team_df, owner):
    lineup   = get_starters(team_df)
    starters = lineup[lineup["slot"] != "BENCH"]
    bench    = lineup[lineup["slot"] == "BENCH"]
    row      = {"owner": owner}
    for pos in ["QB", "RB", "WR", "TE"]:
        ps = starters[starters["position"] == pos]
        pb = bench[bench["position"] == pos]
        sv = ps["combined_score"].mean() if len(ps) > 0 else 0
        dv = pb["combined_score"].mean() if len(pb) > 0 else 0
        pa = lineup[lineup["position"] == pos].sort_values("combined_score", ascending=False)
        row[f"{pos}_grade"]         = round(sv * 0.7 + dv * 0.3, 1)
        row[f"{pos}_starter_value"] = round(sv, 1)
        row[f"{pos}_depth_value"]   = round(dv, 1)
        row[f"{pos}_n_starters"]    = len(ps)
        row[f"{pos}_n_bench"]       = len(pb)
        row[f"{pos}_top_player"]    = pa.iloc[0]["name"]           if len(pa) > 0 else "None"
        row[f"{pos}_top_score"]     = pa.iloc[0]["combined_score"] if len(pa) > 0 else 0
    row["total_grade"] = round(
        row["QB_grade"]*0.30 + row["RB_grade"]*0.25 +
        row["WR_grade"]*0.25 + row["TE_grade"]*0.20, 1)
    return row

# ---- Build grades FIRST ----
grades_df = pd.DataFrame([grade_team(merged_df[merged_df["owner"] == o], o)
                           for o in merged_df["owner"].unique()])
grades_df = grades_df.sort_values("total_grade", ascending=False).reset_index(drop=True)
grades_df["rank"] = grades_df.index + 1

# ---- Dynamic position needs ----
def calculate_position_needs(grades_df, owner):
    position_needs = {}
    for pos in ["QB", "RB", "WR", "TE"]:
        pos_rank = grades_df[f"{pos}_grade"].rank(ascending=False)
        my_rank  = pos_rank[grades_df["owner"] == owner].values[0]
        n_teams  = len(grades_df)
        need     = (my_rank - 1) / (n_teams - 1)
        need     = max(0.1, round(need, 2))
        position_needs[pos] = need
    return position_needs

POSITION_NEED = calculate_position_needs(grades_df, MY_USERNAME)

print("Dynamic position needs based on your roster:")
for pos, need in sorted(POSITION_NEED.items(), key=lambda x: x[1], reverse=True):
    my_grade  = grades_df[grades_df["owner"] == MY_USERNAME].iloc[0][f"{pos}_grade"]
    pos_ranks = grades_df[f"{pos}_grade"].rank(ascending=False)
    my_rank   = int(pos_ranks[grades_df["owner"] == MY_USERNAME].values[0])
    print(f"  {pos}: need={need:.2f}  grade={my_grade:.0f}  rank=#{my_rank} of {len(grades_df)}")

# ---- Positional proportion ----
pos_value = merged_df.groupby(["owner", "position"]).agg(
    pos_ktc_value=("KTC Value", "sum")).reset_index()
pos_pivot = pos_value.pivot(index="owner", columns="position",
                             values="pos_ktc_value").fillna(0).reset_index()
for pos in ["QB", "RB", "WR", "TE"]:
    if pos not in pos_pivot.columns: pos_pivot[pos] = 0
pos_pivot["total_player_value"] = pos_pivot[["QB","RB","WR","TE"]].sum(axis=1)
for pos in ["QB","RB","WR","TE"]:
    pos_pivot[f"{pos}_pct"] = (pos_pivot[pos] / pos_pivot["total_player_value"] * 100).round(1)
pos_pivot["flex_pct"]   = pos_pivot["WR_pct"] + pos_pivot["RB_pct"]
pos_pivot["onesie_pct"] = pos_pivot["QB_pct"] + pos_pivot["TE_pct"]

# ---- Value & production share ----
pick_value_by_owner = picks_master_df[picks_master_df["year"] != YEARS[-1]].groupby("current_owner_name")["ktc_value"].sum().reset_index()
pick_value_by_owner.columns = ["owner", "pick_ktc_value"]
pick_count_by_owner = picks_master_df[picks_master_df["round"]==1].groupby(
    "current_owner_name").size().reset_index(name="first_round_picks")
pick_count_by_owner.columns = ["owner", "first_round_picks"]

player_value_by_owner = merged_df.groupby("owner").agg(
    player_ktc_value = ("KTC Value",            "sum"),
    total_avg_ppg    = ("multi_year_prod_score", "sum"),
    n_players        = ("name",                  "count"),
).reset_index()

team_summary = (player_value_by_owner
    .merge(pick_value_by_owner, on="owner", how="left")
    .merge(pick_count_by_owner, on="owner", how="left"))
team_summary["pick_ktc_value"]    = team_summary["pick_ktc_value"].fillna(0)
team_summary["first_round_picks"] = team_summary["first_round_picks"].fillna(0).astype(int)
team_summary["total_ktc_value"]   = team_summary["player_ktc_value"] + team_summary["pick_ktc_value"]

league_total_value      = team_summary["total_ktc_value"].sum()
league_total_production = team_summary["total_avg_ppg"].sum()
expected_share          = 100 / len(team_summary)

team_summary["value_share"]      = (team_summary["total_ktc_value"] / league_total_value      * 100).round(2)
team_summary["production_share"] = (team_summary["total_avg_ppg"]   / league_total_production * 100).round(2)
team_summary["share_gap"]        = (team_summary["value_share"] - team_summary["production_share"]).round(2)
team_summary["value_vs_expected"]      = (team_summary["value_share"]      - expected_share).round(2)
team_summary["production_vs_expected"] = (team_summary["production_share"] - expected_share).round(2)
team_summary = team_summary.sort_values("value_share", ascending=False).reset_index(drop=True)
team_summary["value_rank"]      = team_summary["value_share"].rank(ascending=False).astype(int)
team_summary["production_rank"] = team_summary["production_share"].rank(ascending=False).astype(int)

print("All analysis built ✅")


# In[ ]:


# ============================================================
# 17. Team Outlook Classification
# ============================================================

outlook_df = team_summary.merge(
    pos_pivot[["owner","QB_pct","RB_pct","WR_pct","TE_pct","flex_pct","onesie_pct"]],
    on="owner", how="left")

tier_summary = merged_df.groupby(["owner","tier"]).size().unstack(fill_value=0).reset_index()
for t in TIER_ORDER:
    if t not in tier_summary.columns: tier_summary[t] = 0
tier_summary["CF_total"] = (
    tier_summary["Cornerstone"] +
    tier_summary["Foundational"] +
    tier_summary.get("Upside Premier", 0) * 0.5
).round(1)
outlook_df = outlook_df.merge(tier_summary, on="owner", how="left")

for year in YEARS:
    yp = picks_master_df[(picks_master_df["round"]==1) &
                          (picks_master_df["year"]==year)].groupby(
        "current_owner_name").size().reset_index(name=f"first_{year}")
    yp.columns = ["owner", f"first_{year}"]
    outlook_df = outlook_df.merge(yp, on="owner", how="left")
    outlook_df[f"first_{year}"] = outlook_df[f"first_{year}"].fillna(0).astype(int)

outlook_df["total_firsts"] = sum(outlook_df[f"first_{y}"] for y in YEARS)

def draft_status(n):
    if n == 0: return "Deficient"
    elif n <= 2: return "Adequate"
    elif n <= 4: return "Surplus"
    else: return "Overload"

for year in YEARS:
    outlook_df[f"dc_{year}"] = outlook_df[f"first_{year}"].apply(draft_status)

def classify_outlook(row):
    vr, pr, cf = row["value_rank"], row["production_rank"], row["CF_total"]
    gap, tf    = row["share_gap"],  row["total_firsts"]

    # Window Contender — producing well but low value/foundation
    # Must have value rank 6+ so high value teams can't be window contenders
    if pr <= 4 and vr >= 8:                        return "Window Contender"
    if pr <= 5 and vr >= 7:                        return "Window Contender"

    # True Contender
    if vr <= 3 and pr <= 6 and cf >= 3:
        return "Contender (needs production)" if gap > 4 else "Contender"
    if vr <= 5 and pr <= 5 and cf >= 4:            return "Contender"

    # Reload
    if vr <= 6 and cf >= 3 and tf >= 2:            return "Reload"
    if vr <= 5 and gap > 3:                        return "Reload (sell vets for youth)"

    # Rebuild
    if vr >= 7 or cf <= 2:
        return "Rebuild (future value)" if tf >= 3 else "Rebuild"

    return "Reload"

outlook_df["outlook"] = outlook_df.apply(classify_outlook, axis=1)
outlook_df = outlook_df.sort_values("value_rank").reset_index(drop=True)

owner_outlook = outlook_df.set_index("owner")["outlook"].to_dict()

print("Outlook classified ✅")
print(outlook_df[["owner","outlook","CF_total","value_share","production_share","share_gap"]].to_string(index=False))


# In[ ]:


# ============================================================
# 17b. Competitive Window — Core Age, Peak Window, Age Runway, Value Curve
# ============================================================

# ---- Age Runway display buckets (unchanged — used only for the runway bar) ----
AGE_BUCKETS = {
    "QB": [("Young", 0, 25), ("Prime", 26, 30), ("Late Prime", 31, 33), ("Aging", 34, 999)],
    "RB": [("Young", 0, 23), ("Prime", 24, 26), ("Late Prime", 27, 28), ("Aging", 29, 999)],
    "WR": [("Young", 0, 23), ("Prime", 24, 27), ("Late Prime", 28, 30), ("Aging", 31, 999)],
    "TE": [("Young", 0, 23), ("Prime", 24, 27), ("Late Prime", 28, 30), ("Aging", 31, 999)],
}

def get_age_bucket(position, age):
    for name, lo, hi in AGE_BUCKETS.get(position, AGE_BUCKETS["WR"]):
        if lo <= age <= hi:
            return name
    return "Aging"

# ---- Growth curve buckets (drive the value PROJECTION, separate from the runway display) ----
# (bucket_name, lo_age, hi_age, annual_rate)
GROWTH_CURVES = {
    "QB": [
        ("Rising",   0, 25,  0.12),
        ("Prime",   26, 30,  0.03),
        ("Peak",    31, 33, -0.02),
        ("Decline", 34, 999, -0.15),
    ],
    "RB": [
        ("Rising",   0, 24,  0.15),
        ("Prime",   25, 26,  0.02),
        ("Late",    27, 28, -0.12),
        ("Decline", 29, 999, -0.25),
    ],
    "WR": [
        ("Rising",   0, 24,  0.12),
        ("Prime",   25, 28,  0.03),
        ("Late",    29, 30, -0.08),
        ("Decline", 31, 999, -0.18),
    ],
    "TE": [
        ("Rising",   0, 24,  0.10),
        ("Prime",   25, 28,  0.02),
        ("Late",    29, 30, -0.08),
        ("Decline", 31, 999, -0.18),
    ],
}
GROWTH_ZERO_AGE = {"QB": 36, "RB": 30, "WR": 33, "TE": 33}
VALUE_FLOOR, VALUE_CEILING = 500, 9999

def get_growth_bucket(position, age):
    curves = GROWTH_CURVES.get(position, GROWTH_CURVES["WR"])
    for name, lo, hi, rate in curves:
        if lo <= age <= hi:
            return name, rate
    return curves[-1][0], curves[-1][3]

# ---- Outlook-aware multipliers (Step 3) ----
OUTLOOK_MULT = {
    "Rebuild":                      {"young": 1.4, "pick": 1.3, "aging": 0.7},
    "Rebuild (future value)":       {"young": 1.4, "pick": 1.3, "aging": 0.7},
    "Reload":                       {"young": 1.2, "pick": 1.1, "aging": 0.9},
    "Reload (sell vets for youth)": {"young": 1.2, "pick": 1.1, "aging": 0.9},
    "Contender":                    {"young": 1.0, "pick": 0.9, "aging": 1.0},
    "Window Contender":             {"young": 1.0, "pick": 0.9, "aging": 1.0},
    "Contender (needs production)": {"young": 1.0, "pick": 0.9, "aging": 1.0},
}
DEFAULT_MULT = {"young": 1.0, "pick": 1.0, "aging": 1.0}

# Project the current year plus one year beyond the furthest pick year (YEARS[-1])
NUM_PROJECTION_YEARS = len(YEARS) + 1
VALUE_CURVE_YEARS = [int(CURRENT_DRAFT_YEAR) + i for i in range(NUM_PROJECTION_YEARS)]

def project_player_value(position, age, ktc_value, young_mult, aging_mult):
    """Ages a player 1 year at a time using the position's growth curve.
    Rising-bucket rates are scaled by young_mult; Decline-bucket dollar
    values are scaled by aging_mult. Returns one value per
    VALUE_CURVE_YEARS entry (index 0 = current value, unprojected)."""
    zero_age = GROWTH_ZERO_AGE.get(position, 33)
    values = [min(ktc_value, VALUE_CEILING)]
    running_value = values[0]
    for i in range(1, len(VALUE_CURVE_YEARS)):
        projected_age = age + i
        if running_value <= 0 or projected_age >= zero_age:
            running_value = 0
        else:
            bucket, rate = get_growth_bucket(position, projected_age)
            if bucket == "Rising":
                rate = rate * young_mult
            running_value = running_value * (1 + rate)
            if bucket == "Decline":
                running_value = running_value * aging_mult
            running_value = min(max(running_value, VALUE_FLOOR), VALUE_CEILING)
        values.append(running_value)
    return values

# ---- Pick conversion value (Step 2) ----
# Picks convert at 100% of KTC value in their draft year only. No growth is
# applied in subsequent years -- the pick's KTC value already reflects the
# player's projected worth, and any further upside once they're rostered is
# captured by the player age curves above, not by the pick itself.
VALUE_CURVE_YEAR_STRS = [str(y) for y in VALUE_CURVE_YEARS]

def pick_value_by_year(owner_name, pick_mult):
    """Returns {year_str: dollar contribution} for an owner's future picks.
    Each pick contributes 100% of its KTC value (scaled by the outlook-aware
    pick_mult) in its draft year only."""
    contributions = {}
    owner_picks = picks_master_df[picks_master_df["current_owner_name"] == owner_name]
    for _, pick in owner_picks.iterrows():
        draft_year = pick["year"]
        if draft_year == CURRENT_DRAFT_YEAR or draft_year not in VALUE_CURVE_YEAR_STRS:
            continue
        contributions[draft_year] = contributions.get(draft_year, 0) + pick["ktc_value"] * pick_mult
    return contributions

# ---- Projected value cap (Step 4 prerequisite) ----
# Grounds the ceiling in real league context: no team should project further
# than 25% above whatever the single highest current team value in the
# league already is.
MAX_TEAM_VALUE = outlook_df["total_ktc_value"].max()
VALUE_CURVE_CAP = MAX_TEAM_VALUE * 1.25

competitive_window_rows = []
for owner_name in merged_df["owner"].unique():
    outlook = owner_outlook.get(owner_name, "Reload")
    mult    = OUTLOOK_MULT.get(outlook, DEFAULT_MULT)

    team_players = merged_df[
        (merged_df["owner"] == owner_name) & (merged_df["KTC Value"] > 0) &
        (~merged_df["name"].str.contains("Pick", case=False, na=False))
    ]
    total_value = team_players["KTC Value"].sum()

    # ---- Core Age: KTC-value-weighted average age ----
    core_age = round((team_players["age"] * team_players["KTC Value"]).sum() / total_value, 1) \
        if total_value > 0 else 0

    # ---- Age Runway: % of total KTC value per display bucket ----
    bucket_values = {"Young": 0.0, "Prime": 0.0, "Late Prime": 0.0, "Aging": 0.0}
    for _, p in team_players.iterrows():
        bucket_values[get_age_bucket(p["position"], p["age"])] += p["KTC Value"]
    age_runway = {
        b: round(v / total_value * 100, 1) if total_value > 0 else 0.0
        for b, v in bucket_values.items()
    }

    # ---- Value Curve: outlook-aware player projections + pick conversion (Steps 1-3) ----
    curve_totals = [0.0] * len(VALUE_CURVE_YEARS)
    for _, p in team_players.iterrows():
        projected = project_player_value(
            p["position"], p["age"], p["KTC Value"], mult["young"], mult["aging"]
        )
        curve_totals = [a + b for a, b in zip(curve_totals, projected)]

    pick_contrib = pick_value_by_year(owner_name, mult["pick"])
    for idx, year in enumerate(VALUE_CURVE_YEARS):
        curve_totals[idx] += pick_contrib.get(str(year), 0)

    # ---- Clamp to the league-context cap before deriving Peak Year/Window/Gain ----
    curve_totals = [min(v, VALUE_CURVE_CAP) for v in curve_totals]

    value_curve = {year: round(val, 0) for year, val in zip(VALUE_CURVE_YEARS, curve_totals)}

    # ---- Peak Year / Peak Window / Years to Peak / Peak Gain % (Step 4) ----
    current_value = curve_totals[0]
    peak_idx      = max(range(len(curve_totals)), key=lambda i: curve_totals[i])
    peak_year     = VALUE_CURVE_YEARS[peak_idx]
    peak_value    = curve_totals[peak_idx]

    threshold     = peak_value * 0.90
    in_window     = {i for i in range(len(curve_totals)) if curve_totals[i] >= threshold}
    lo = hi = peak_idx
    while (lo - 1) in in_window: lo -= 1
    while (hi + 1) in in_window: hi += 1
    if lo == hi:
        lo = max(lo - 1, 0)
        hi = min(hi + 1, len(VALUE_CURVE_YEARS) - 1)
    peak_window   = f"{VALUE_CURVE_YEARS[lo]}–{VALUE_CURVE_YEARS[hi]}"
    years_to_peak = peak_year - int(CURRENT_DRAFT_YEAR)

    peak_gain_pct = round((peak_value - current_value) / current_value * 100, 1) \
        if current_value > 0 else 0.0
    if peak_gain_pct < 0.5:
        peak_gain_pct = 0.0

    competitive_window_rows.append({
        "owner":         owner_name,
        "core_age":      core_age,
        "peak_year":     peak_year,
        "peak_window":   peak_window,
        "years_to_peak": years_to_peak,
        "peak_gain_pct": peak_gain_pct,
        "age_runway":    age_runway,
        "value_curve":   value_curve,
    })

competitive_window_df = pd.DataFrame(competitive_window_rows)
outlook_df = outlook_df.merge(competitive_window_df, on="owner", how="left")

print("Competitive Window calculated ✅")
print(outlook_df[["owner","outlook","core_age","peak_year","peak_window","years_to_peak","peak_gain_pct"]].to_string(index=False))


# In[ ]:


# ============================================================
# 18. Trade Engine
# ============================================================

# ---- Buy targets ----
other_players = merged_df[
    (merged_df["owner"] != MY_USERNAME) & (merged_df["KTC Value"] > 1000)
].copy()

def buy_score(row):
    pos, ktc, age    = row["position"], row["KTC Value"], row["age"] if pd.notna(row["age"]) else 99
    owner, tier      = row["owner"], row["tier"]
    combined         = row["combined_score"]
    pos_need         = POSITION_NEED.get(pos, 0.3)
    sell_lkl         = SELL_LIKELIHOOD.get(owner_outlook.get(owner, "Reload"), 0.5)
    value_score      = combined / 10000
    age_score        = 1.0 if age<=23 else 0.85 if age<=25 else 0.70 if age<=27 else 0.50 if age<=29 else 0.25
    prod_ktc_ratio   = (row["multi_year_prod_score"] / ktc) if ktc > 0 else 0
    value_gap_score  = min(prod_ktc_ratio / 2, 1.0)
    tier_bonus       = {"Cornerstone":0.30,"Upside Premier":0.28,"Foundational":0.25,
                        "Mainstay":0.15,"Upside Shot":0.10,"Productive Vet":0.10,
                        "Short-term Winner":0.05}.get(tier, 0.0)
    return round((value_score*0.35 + pos_need*0.25 + sell_lkl*0.20 +
                  age_score*0.15 + value_gap_score*0.05) + tier_bonus, 4)

other_players["buy_score"]      = other_players.apply(buy_score, axis=1)
other_players["owner_outlook"]  = other_players["owner"].map(owner_outlook)
top_buys = other_players.sort_values("buy_score", ascending=False).head(30)

# ---- Sell candidates ----
def sell_score(row):
    pos, ktc, age = row["position"], row["KTC Value"], row["age"] if pd.notna(row["age"]) else 99
    tier, prod    = row["tier"], row["multi_year_prod_score"]
    if tier == "Cornerstone"   and age <= 26: return 0.05
    if tier == "Upside Premier" and age <= 24: return 0.08
    if tier == "Foundational"  and age <= 25: return 0.10
    if tier == "Upside Shot"   and age <= 22 and ktc >= 4000: return 0.12
    pos_excess      = {"WR":1.0,"QB":0.6,"TE":0.3,"RB":0.1}.get(pos, 0.5)
    age_risk        = 1.0 if age>=30 else 0.7 if age>=28 else 0.4 if age>=26 else 0.1
    sell_high_score = min((ktc/prod if prod>0 else 2.0) / 3, 1.0)
    tier_sell       = {"Replaceable":1.0,"Jag Insurance":0.9,"Jag Developmental":0.8,
                       "Serviceable":0.6,"Short-term Production":0.5,"Productive Vet":0.4,
                       "Mainstay":0.2,"Upside Shot":0.15,"Foundational":0.05,
                       "Upside Premier":0.03,"Cornerstone":0.0}.get(tier, 0.3)
    return round(pos_excess*0.30 + age_risk*0.25 + sell_high_score*0.25 + tier_sell*0.20, 4)

# ---- Sell candidates for ALL teams ----
all_sell_candidates = []

for team_owner in merged_df["owner"].unique():
    team_players = merged_df[merged_df["owner"] == team_owner].copy()
    team_players["sell_score"] = team_players.apply(sell_score, axis=1)
    all_sell_candidates.append(team_players)

all_sell_candidates_df = pd.concat(all_sell_candidates, ignore_index=True)

# Keep your team's sell candidates for trade engine compatibility
sell_candidates = all_sell_candidates_df[
    all_sell_candidates_df["owner"] == MY_USERNAME
].sort_values("sell_score", ascending=False)

# Keep my_players for trade chips compatibility
my_players = merged_df[merged_df["owner"] == MY_USERNAME].copy()
my_players["sell_score"] = my_players.apply(sell_score, axis=1)

# ---- Trade chips ----
my_trade_chips = my_players[["name","position","KTC Value","sell_score","tier","age"]].copy()
my_trade_chips.columns = ["name","position","ktc_value","sell_score","tier","age"]
my_trade_chips["type"] = "player"

my_picks_portfolio = picks_master_df[
    picks_master_df["current_owner_name"] == MY_USERNAME
][["year","round","tier","original_owner_name","ktc_value"]].copy()
my_picks_portfolio["name"] = my_picks_portfolio.apply(
    lambda r: f"{r['year']} {r['tier']} {['1st','2nd','3rd','4th'][r['round']-1]}", axis=1)
my_picks_portfolio["type"] = "pick"

my_trade_chips_filtered = my_trade_chips[~my_trade_chips["name"].isin(UNTOUCHABLE)].copy()

print("Trade engine built ✅")
print(f"\nTop 10 buy targets:")
print(top_buys[["name","position","age","KTC Value","tier","owner","buy_score"]].head(10).to_string(index=False))


# In[ ]:


# ============================================================
# 19. KTC Value Adjustment + Trade Package Builder
# ============================================================

def ktc_value_adjustment(target_ktc, n_pieces, star_side_total=None):
    """
    Approximate KTC value adjustment.
    target_ktc      — KTC of the top star being acquired
    n_pieces        — number of pieces on the package side
    star_side_total — total face value on the star side (including adds)
                      if None assumes pure 1-player star side
    """
    if n_pieces <= 1:
        return 0

    base_rates = {2: 0.46, 3: 0.55, 4: 0.63, 5: 0.70}
    base_rate  = base_rates.get(n_pieces, 0.75)
    stud_mult  = 1.0 + max(0, (target_ktc - 5000) / 100) * 0.003
    base_adj   = round(target_ktc * base_rate * stud_mult)

    # If star side added value back, reduce adjustment
    if star_side_total and star_side_total > target_ktc:
        ratio    = (target_ktc / star_side_total) ** 0.9
        base_adj = round(base_adj * ratio)

    return base_adj

def find_trade_packages(target_name, target_ktc, max_gap=0.20,
                        max_players=3, max_picks=3):
    player_chips = my_trade_chips_filtered.sort_values("sell_score", ascending=False).to_dict("records")
    pick_chips   = my_picks_portfolio.to_dict("records")
    packages     = []

    def evaluate(chips):
        n          = len(chips)
        face       = sum(c["ktc_value"] for c in chips)
        adj        = ktc_value_adjustment(target_ktc, n)
        needed     = target_ktc + adj
        gap        = face - needed
        if abs(gap) / needed <= max_gap:
            packages.append({
                "chips": chips, "face_value": face, "adjustment": adj,
                "needed": needed, "gap": gap, "n_pieces": n,
                "type": ("mixed" if any(c["type"]=="pick" for c in chips) and
                         any(c["type"]=="player" for c in chips)
                         else "picks only" if all(c["type"]=="pick" for c in chips)
                         else "players only"),
            })

    for n in range(1, max_players+1):
        for combo in combinations(player_chips, n): evaluate(list(combo))
    for n in range(1, max_picks+1):
        for combo in combinations(pick_chips, n):   evaluate(list(combo))
    for np_ in range(1, max_players):
        for nk in range(1, max_picks):
            for pc in combinations(player_chips, np_):
                for pk in combinations(pick_chips, nk): evaluate(list(pc)+list(pk))

    packages = sorted(packages, key=lambda x: abs(x["gap"]))
    seen, unique = set(), []
    for p in packages:
        key = frozenset(c["name"] for c in p["chips"])
        if key not in seen: seen.add(key); unique.append(p)
    return unique

def print_trade_packages(target_name, target_ktc, packages, max_show=5):
    print(f"\n{'='*75}")
    print(f"  Target: {target_name} (KTC: {target_ktc:,.0f})")
    print(f"{'='*75}")
    if not packages:
        print(f"  No packages found within 20% — loosen untouchables or add picks")
        return
    print(f"  Found {len(packages)} packages — showing top {min(max_show,len(packages))}:\n")
    for i, pkg in enumerate(packages[:max_show]):
        gap_str = f"+{pkg['gap']:,.0f}" if pkg['gap']>=0 else f"{pkg['gap']:,.0f}"
        print(f"  Package {i+1} ({pkg['type']}) — Face:{pkg['face_value']:,.0f} | "
              f"Adj:{pkg['adjustment']:,.0f} | Needed:{pkg['needed']:,.0f} | Gap:{gap_str}")
        for chip in pkg["chips"]:
            icon = "📋" if chip.get("type")=="pick" else "🏈"
            print(f"    {icon} {chip['name']:<30} KTC:{chip['ktc_value']:>5,.0f}  [{chip.get('tier','')}]")
        print()

print("Trade package builder ready ✅")


# In[ ]:


# ============================================================
# 20. Custom Trade Evaluator
# ============================================================

def evaluate_trade(giving, receiving):
    def lookup(name):
        pm = rankings_df[rankings_df["Player"].str.lower() == name.lower()]
        if not pm.empty:
            r     = pm.iloc[0]
            tier  = merged_df[merged_df["ktc_name"] == r["Player"]]["tier"].values
            owner = merged_df[merged_df["ktc_name"] == r["Player"]]["owner"].values
            return {"name":name,"ktc":r["KTC Value"],"tier":tier[0] if len(tier)>0 else "Unknown",
                    "pos":r["position_clean"],"age":r["Age"],
                    "owner":owner[0] if len(owner)>0 else "Unknown","type":"player"}
        pm = all_picks[all_picks["Name"].str.lower() == name.lower()]
        if not pm.empty:
            return {"name":name,"ktc":pm.iloc[0]["KTC Value"],"tier":"Draft Pick",
                    "pos":"PI","age":None,"owner":"Pick","type":"pick"}
        pm = my_picks_portfolio[my_picks_portfolio["name"].str.lower() == name.lower()]
        if not pm.empty:
            return {"name":name,"ktc":pm.iloc[0]["ktc_value"],"tier":"Draft Pick",
                    "pos":"PI","age":None,"owner":MY_USERNAME,"type":"pick"}
        print(f"  ⚠️  Could not find: '{name}'")
        return {"name":name,"ktc":0,"tier":"Unknown","pos":"?","age":None,"owner":"Unknown","type":"unknown"}

    giving_assets    = [lookup(n) for n in giving]
    receiving_assets = [lookup(n) for n in receiving]
    giving_value     = sum(a["ktc"] for a in giving_assets)
    receiving_value  = sum(a["ktc"] for a in receiving_assets)
    ng, nr           = len(giving_assets), len(receiving_assets)

    if ng > nr:
        top_star_ktc    = max(a["ktc"] for a in receiving_assets)
        star_side_total = receiving_value
        adj             = ktc_value_adjustment(top_star_ktc, ng, star_side_total)
        your_needed     = giving_value
        their_needed    = receiving_value + adj
    elif nr > ng:
        top_star_ktc    = max(a["ktc"] for a in giving_assets)
        star_side_total = giving_value
        adj             = ktc_value_adjustment(top_star_ktc, nr, star_side_total)
        your_needed     = giving_value + adj
        their_needed    = receiving_value
    else:
        adj = 0; your_needed = giving_value; their_needed = receiving_value

    surplus = their_needed - your_needed
    verdict = ("✅ Strong WIN"   if surplus > 1000 else
               "✅ Slight WIN"  if surplus > 300  else
               "〰️ FAIR"        if surplus >= -300 else
               "⚠️ Slight LOSS" if surplus >= -1000 else
               "🔴 Strong LOSS")

    print(f"\n{'='*65}")
    print(f"  Trade Evaluator")
    print(f"{'='*65}")

    print(f"\n  YOU GIVE:")
    for a in giving_assets:
        age_str = f"Age:{a['age']:.0f}" if a["age"] else "     "
        print(f"    {'📋' if a['type']=='pick' else '🏈'} {a['name']:<30} KTC:{a['ktc']:>6,.0f}  {age_str}  [{a['tier']}]")
    print(f"    {'─'*55}")
    print(f"    Face value:  {giving_value:>6,.0f}")
    if ng > nr:
        print(f"    + Adj on star side: {adj:>6,.0f}")
    if nr > ng:
        print(f"    + Adj needed:{adj:>6,.0f}  ({nr} pieces)")
        print(f"    Total needed:{your_needed:>6,.0f}")

    print(f"\n  YOU RECEIVE:")
    for a in receiving_assets:
        age_str   = f"Age:{a['age']:.0f}" if a["age"] else "     "
        owner_str = f"({a['owner']})" if a["owner"] != MY_USERNAME else ""
        print(f"    {'📋' if a['type']=='pick' else '🏈'} {a['name']:<30} KTC:{a['ktc']:>6,.0f}  {age_str}  [{a['tier']}]  {owner_str}")
    print(f"    {'─'*55}")
    print(f"    Face value:  {receiving_value:>6,.0f}")
    if ng > nr:
        print(f"    + Adj:       {adj:>6,.0f}  (stud premium for {ng} pieces)")
        print(f"    Total:       {their_needed:>6,.0f}")
    if nr > ng:
        print(f"    + Adj on star side: {adj:>6,.0f}")

    print(f"\n  {'─'*62}")
    print(f"  Your surplus: {surplus:>+,.0f}")
    print(f"  Verdict:      {verdict}")

    print(f"\n  Positional impact:")
    print(f"  {'─'*50}")
    print(f"  LOSING:")
    for a in giving_assets:
        if a["type"] == "player":
            print(f"    ➖ {a['name']:<25} {a['pos']:<4} [{a['tier']}]")
    if not any(a["type"] == "player" for a in giving_assets):
        print(f"    (no players — picks only)")

    print(f"  GAINING:")
    for a in receiving_assets:
        if a["type"] == "player":
            need_str = ("🔴 High need"     if POSITION_NEED.get(a["pos"], 0.3) >= 0.8 else
                        "🟡 Moderate need" if POSITION_NEED.get(a["pos"], 0.3) >= 0.5 else
                        "🟢 Low need")
            print(f"    ➕ {a['name']:<25} {a['pos']:<4} [{a['tier']}]  {need_str}")
    if not any(a["type"] == "player" for a in receiving_assets):
        print(f"    (no players — picks only)")
    print(f"{'='*65}\n")

print("Trade evaluator ready ✅")


# In[ ]:


# Build all league IDs dynamically
def get_all_league_ids(current_id):
    league_ids = []
    league_id = current_id
    while league_id:
        info = requests.get(f"https://api.sleeper.app/v1/league/{league_id}").json()
        season = info.get('season')
        league_ids.append((season, league_id))
        league_id = info.get('previous_league_id')
        time.sleep(0.3)
    return league_ids

all_league_ids = get_all_league_ids(LEAGUE_ID)
print(f"League history: {[(s, lid[:8]+'...') for s, lid in all_league_ids]}")


# In[ ]:


# Pull all trades from all seasons
def get_all_trades(league_ids):
    all_trades = []
    for season, league_id in league_ids:
        season_trades = []
        for week in range(1, 19):
            trades = requests.get(
                f"https://api.sleeper.app/v1/league/{league_id}/transactions/{week}"
            ).json()
            week_trades = [t for t in trades if t.get('type') == 'trade']
            for t in week_trades:
                t['season'] = season
                t['league_id_source'] = league_id
            season_trades.extend(week_trades)
            time.sleep(0.2)
        all_trades.extend(season_trades)
        print(f"  {season}: {len(season_trades)} trades found")
    return all_trades

print("Pulling all trades...")
all_trades = get_all_trades(all_league_ids)
print(f"Total trades: {len(all_trades)}")


# In[ ]:


# ============================================================
# 21. Trade Grades 
# ============================================================

# Pick & Name Setup

NAME_FIXES = {
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
}

# Non-players to ignore (kickers, defenses, retired)
IGNORE_KEYWORDS = [
    'Eagles','Chiefs','Packers','Steelers','Ravens','Cowboys','Titans',
    'Jets','Buccaneers','Chargers','Texans','Browns','Bills','Commanders',
    'Bengals','Seahawks','Saints','Patriots','49ers','Dolphins',
    'Tucker','Elliott','Bass','Moody','Gay','Myers','Koo','Dicker',
    'Sanders','Butker','McPherson','Aubrey'
]

def build_pick_lookup(draft_picks, season):
    for pick in draft_picks:
        round_num = pick['round']
        slot      = pick['draft_slot']
        first     = pick['metadata'].get('first_name', '')
        last      = pick['metadata'].get('last_name', '')
        name      = f"{first} {last}".strip()
        name      = NAME_FIXES.get(name, name)

        ktc_match = rankings_df[rankings_df['Player'].str.lower() == name.lower()]
        ktc_val   = int(ktc_match.iloc[0]['KTC Value']) if not ktc_match.empty else 0

        slot_str  = str(slot).zfill(2)
        pick_to_player[(season, round_num, slot)] = {
            'player_name': name,
            'ktc_value':   ktc_val,
            'display':     f"{season} {round_num}.{slot_str} ({name})",
        }

# Pull draft picks for all completed seasons dynamically
print("Pulling draft results...")

pick_to_player = {}
startup_season = min(int(s) for s, _ in all_league_ids)  # earliest = startup draft

for season_str, league_id in all_league_ids:
    season_int = int(season_str)

    # Skip current season — draft hasn't happened yet
    if season_int >= current_season + 1:
        continue

    drafts = requests.get(
        f"https://api.sleeper.app/v1/league/{league_id}/drafts"
    ).json()
    if not drafts:
        continue

    draft_id     = drafts[0]['draft_id']
    draft_picks  = requests.get(
        f"https://api.sleeper.app/v1/draft/{draft_id}/picks"
    ).json()

    draft_type = "startup" if season_int == startup_season else "rookie"
    print(f"  {season_str} {draft_type} draft: {len(draft_picks)} picks")
    build_pick_lookup(draft_picks, season_int)
    time.sleep(0.3)

print(f"\nPick lookup built: {len(pick_to_player)} picks")

# Summary
zero_non_trivial = [
    (k,v) for k,v in pick_to_player.items()
    if v['ktc_value'] == 0
    and not any(x in v['player_name'] for x in IGNORE_KEYWORDS)
]
print(f"Zero-value non-trivial picks: {len(zero_non_trivial)} (retired/cut players)")


# Build Graded Trade History

def get_player_ktc(sleeper_id):
    """Get current KTC value for a Sleeper player ID."""
    p = players_db.get(str(sleeper_id), {})
    name = p.get('full_name', '')
    name = NAME_FIXES.get(name, name)
    if not name:
        return 0, 'Unknown'
    match = rankings_df[rankings_df['Player'].str.lower() == name.lower()]
    if not match.empty:
        return int(match.iloc[0]['KTC Value']), name
    return 0, name

def get_pick_ktc(pick, n_teams=10):
    season    = int(pick['season'])
    round_num = pick['round']

    round_str = {1:'1st', 2:'2nd', 3:'3rd', 4:'4th'}.get(round_num, f"{round_num}th")

    # Startup draft rounds beyond 4 have no KTC equivalent
    startup_season = min(s for s, _ in all_league_ids)  # earliest season = startup
    if season == startup_season and round_num > 4:
        return 0, f"{startup_season} Startup {round_num}th"

    tier     = pick.get('tier', 'Mid')
    ktc_name = f"{season} {tier} {round_str}"
    match    = all_picks[all_picks['Name'] == ktc_name]

    if not match.empty:
        ktc_val = int(match.iloc[0]['KTC Value'])
        return ktc_val, f"{season} {tier} {round_str}"

    # Past year — average 2026/2027/2028 equivalent as proxy
    proxy_vals = []
    proxy_years = [current_season + 1, current_season + 2, current_season + 3]
    for yr in proxy_years:
        proxy = all_picks[all_picks['Name'] == f"{yr} {tier} {round_str}"]
        if not proxy.empty:
            proxy_vals.append(int(proxy.iloc[0]['KTC Value']))

    ktc_val = round(sum(proxy_vals) / len(proxy_vals)) if proxy_vals else 0
    return ktc_val, f"{season} {tier} {round_str}"

def grade_trade(trade):
    """Grade a single trade using current KTC values with stud adjustment."""
    roster_ids  = trade.get('roster_ids', [])
    adds        = trade.get('adds', {}) or {}
    drops       = trade.get('drops', {}) or {}
    draft_picks = trade.get('draft_picks', []) or []
    created     = trade.get('created', 0)
    season      = trade.get('season', '?')

    from datetime import datetime
    date = datetime.fromtimestamp(created / 1000).strftime('%Y-%m-%d')

    if len(roster_ids) < 2:
        return None

    roster_a, roster_b = roster_ids[0], roster_ids[1]
    owner_a = roster_id_map.get(roster_a, f"Roster {roster_a}")
    owner_b = roster_id_map.get(roster_b, f"Roster {roster_b}")

    side_a = {'owner': owner_a, 'roster_id': roster_a, 'assets': [], 'total': 0}
    side_b = {'owner': owner_b, 'roster_id': roster_b, 'assets': [], 'total': 0}

    for player_id, to_roster in adds.items():
        ktc_val, name = get_player_ktc(player_id)
        asset = {'type': 'player', 'name': name, 'ktc': ktc_val}
        if to_roster == roster_a:
            side_a['assets'].append(asset)
            side_a['total'] += ktc_val
        elif to_roster == roster_b:
            side_b['assets'].append(asset)
            side_b['total'] += ktc_val

    for pick in draft_picks:
        to_roster = pick.get('owner_id')
        ktc_val, display = get_pick_ktc(pick)
        asset = {'type': 'pick', 'name': display, 'ktc': ktc_val}
        if to_roster == roster_a:
            side_a['assets'].append(asset)
            side_a['total'] += ktc_val
        elif to_roster == roster_b:
            side_b['assets'].append(asset)
            side_b['total'] += ktc_val

    # Apply stud adjustment
    n_a = len(side_a['assets'])
    n_b = len(side_b['assets'])

    def ktc_adj(top_ktc, n_pieces, star_total):
        if n_pieces <= 1: return 0
        base_rates = {2: 0.46, 3: 0.55, 4: 0.63, 5: 0.70}
        base_rate  = base_rates.get(n_pieces, 0.75)
        stud_mult  = 1.0 + max(0, (top_ktc - 5000) / 100) * 0.003
        adj        = round(top_ktc * base_rate * stud_mult)
        if star_total and star_total > top_ktc:
            ratio = (top_ktc / star_total) ** 0.9
            adj   = round(adj * ratio)
        return adj

    if n_a > n_b:
        top_b     = max((a['ktc'] for a in side_b['assets']), default=0)
        adj       = ktc_adj(top_b, n_a, side_b['total'])
        adj_a     = side_a['total']
        adj_b     = side_b['total'] + adj
    elif n_b > n_a:
        top_a     = max((a['ktc'] for a in side_a['assets']), default=0)
        adj       = ktc_adj(top_a, n_b, side_a['total'])
        adj_a     = side_a['total'] + adj
        adj_b     = side_b['total']
    else:
        adj       = 0
        adj_a     = side_a['total']
        adj_b     = side_b['total']

    surplus_a = adj_a - adj_b

    return {
        'date':      date,
        'season':    season,
        'side_a':    side_a,
        'side_b':    side_b,
        'adj_a':     adj_a,
        'adj_b':     adj_b,
        'surplus_a': surplus_a,
        'adj':       adj,
        'n_a':       n_a,
        'n_b':       n_b,
    }

# Regrade all trades
print("Grading all trades with adjustment...")
graded_trades = []
for trade in all_trades:
    result = grade_trade(trade)
    if result:
        graded_trades.append(result)

print(f"Graded {len(graded_trades)} trades")

# Build Trade History DataFrame

trade_rows = []
for t in graded_trades:
    side_a = t['side_a']
    side_b = t['side_b']

    # Build asset strings
    a_assets = ' | '.join([f"{a['name']} ({a['ktc']:,})" for a in side_a['assets']])
    b_assets = ' | '.join([f"{a['name']} ({a['ktc']:,})" for a in side_b['assets']])

    trade_rows.append({
        'Date':            t['date'],
        'Season':          t['season'],
        'Team A':          side_a['owner'],
        'Team A Received': a_assets,
        'Team A Face':     side_a['total'],
        'Team A Adjusted': t['adj_a'],
        'Team B':          side_b['owner'],
        'Team B Received': b_assets,
        'Team B Face':     side_b['total'],
        'Team B Adjusted': t['adj_b'],
        'Surplus A':       t['surplus_a'],
        'Surplus B':       -t['surplus_a'],
        'N Assets A':      t['n_a'],
        'N Assets B':      t['n_b'],
    })

trade_history_df = pd.DataFrame(trade_rows).sort_values('Date', ascending=False)

print(f"Trade history built: {len(trade_history_df)} trades")

print("Trade Grades ready ✅")


# In[ ]:


# ============================================================
# 22. League History Data
# ============================================================

def get_player_position(player_id, players_db):
    p = players_db.get(str(player_id), {})
    return p.get('position', None)

def calc_max_points(players_points, players_db):
    eligible = []
    for pid, pts in players_points.items():
        pos = get_player_position(pid, players_db)
        if pos in ['QB', 'RB', 'WR', 'TE']:
            eligible.append((pid, pts, pos))

    eligible.sort(key=lambda x: x[1], reverse=True)
    used  = set()
    total = 0

    for pos, count in PURE_STARTERS.items():
        filled = 0
        for pid, pts, ppos in eligible:
            if filled >= count: break
            if ppos == pos and pid not in used:
                total += pts
                used.add(pid)
                filled += 1

    for flex in FLEX_SPOTS:
        filled = 0
        for pid, pts, ppos in eligible:
            if filled >= flex['count']: break
            if ppos in flex['eligible'] and pid not in used:
                total += pts
                used.add(pid)
                filled += 1

    return round(total, 2)

def get_season_history(league_id, season):
    rosters      = requests.get(f"https://api.sleeper.app/v1/league/{league_id}/rosters").json()
    users        = requests.get(f"https://api.sleeper.app/v1/league/{league_id}/users").json()
    user_map     = {u['user_id']: u.get('display_name', u.get('username', 'Unknown')) for u in users}
    rid_to_owner = {r['roster_id']: user_map.get(r['owner_id'], 'Unknown') for r in rosters}

    print(f"  Pulling {season} regular season...")
    stats = {r['roster_id']: {
        'wins': 0, 'losses': 0, 'pf': 0, 'pa': 0,
        'games': 0, 'max_pf': 0, 'best_score': 0
    } for r in rosters}

    top_weeks        = []
    top_player_games = []

    for week in range(1, 15):
        matchups = requests.get(
            f"https://api.sleeper.app/v1/league/{league_id}/matchups/{week}"
        ).json()
        if not matchups:
            continue

        matchup_map = {}
        for team in matchups:
            mid = team['matchup_id']
            if mid not in matchup_map:
                matchup_map[mid] = []
            matchup_map[mid].append(team)

        for mid, teams in matchup_map.items():
            if len(teams) != 2:
                continue
            a, b = teams
            ap, bp = a['points'] or 0, b['points'] or 0

            a_max = calc_max_points(a.get('players_points', {}), players_db)
            b_max = calc_max_points(b.get('players_points', {}), players_db)

            stats[a['roster_id']]['pf']         += ap
            stats[a['roster_id']]['pa']         += bp
            stats[a['roster_id']]['games']      += 1
            stats[a['roster_id']]['max_pf']     += a_max
            stats[a['roster_id']]['best_score']  = max(stats[a['roster_id']]['best_score'], ap)

            stats[b['roster_id']]['pf']         += bp
            stats[b['roster_id']]['pa']         += ap
            stats[b['roster_id']]['games']      += 1
            stats[b['roster_id']]['max_pf']     += b_max
            stats[b['roster_id']]['best_score']  = max(stats[b['roster_id']]['best_score'], bp)

            if ap > bp:
                stats[a['roster_id']]['wins']   += 1
                stats[b['roster_id']]['losses'] += 1
            else:
                stats[b['roster_id']]['wins']   += 1
                stats[a['roster_id']]['losses'] += 1

            # Top scoring weeks
            for team, pts in [(a, ap), (b, bp)]:
                top_weeks.append({
                    'season': season,
                    'week':   week,
                    'owner':  rid_to_owner.get(team['roster_id'], 'Unknown'),
                    'points': pts,
                    'label':  f"{season} Week {week}",
                })

            # Top player games
            a_pids     = set(a.get('players_points', {}).keys())
            a_starters = set(a.get('starters', []))
            b_starters = set(b.get('starters', []))
            all_players_pts = {**a.get('players_points', {}), **b.get('players_points', {})}

            for pid, pts in all_players_pts.items():
                pos = get_player_position(pid, players_db)
                if pos not in ['QB', 'RB', 'WR', 'TE']:
                    continue
                p_info    = players_db.get(str(pid), {})
                name      = p_info.get('full_name', pid)
                on_a      = pid in a_pids
                owner_rid = a['roster_id'] if on_a else b['roster_id']
                started   = pid in (a_starters if on_a else b_starters)
                top_player_games.append({
                    'season':  season,
                    'week':    week,
                    'name':    name,
                    'pos':     pos,
                    'points':  pts,
                    'owner':   rid_to_owner.get(owner_rid, 'Unknown'),
                    'label':   f"{season} Week {week}",
                    'started': 'Starter' if started else 'Bench',
                })

        time.sleep(0.1)

    # Playoff weeks
    print(f"  Pulling {season} playoffs...")
    playoff_matchups = {}
    for week in range(15, 18):
        matchups = requests.get(
            f"https://api.sleeper.app/v1/league/{league_id}/matchups/{week}"
        ).json()
        if matchups:
            playoff_matchups[week] = matchups
            matchup_map = {}
            for team in matchups:
                mid = team['matchup_id']
                if mid not in matchup_map:
                    matchup_map[mid] = []
                matchup_map[mid].append(team)

            for mid, teams in matchup_map.items():
                for team in teams:
                    pts = team['points'] or 0
                    if pts > 0:
                        top_weeks.append({
                            'season': season,
                            'week':   week,
                            'owner':  rid_to_owner.get(team['roster_id'], 'Unknown'),
                            'points': pts,
                            'label':  f"{season} Week {week}",
                        })

                    # Player games in playoffs
                    starters_set = set(team.get('starters', []))
                    for pid, ppts in team.get('players_points', {}).items():
                        pos = get_player_position(pid, players_db)
                        if pos not in ['QB', 'RB', 'WR', 'TE']:
                            continue
                        p_info = players_db.get(str(pid), {})
                        name   = p_info.get('full_name', pid)
                        top_player_games.append({
                            'season':  season,
                            'week':    week,
                            'name':    name,
                            'pos':     pos,
                            'points':  ppts,
                            'owner':   rid_to_owner.get(team['roster_id'], 'Unknown'),
                            'label':   f"{season} Week {week}",
                            'started': 'Starter' if pid in starters_set else 'Bench',
                        })

        time.sleep(0.1)

    # Champion
    league_info = requests.get(f"https://api.sleeper.app/v1/league/{league_id}").json()
    champ_rid   = int(league_info.get('metadata', {}).get('latest_league_winner_roster_id', 0))
    champ_name  = rid_to_owner.get(champ_rid, 'Unknown')

    # Brackets
    winners_bracket = requests.get(f"https://api.sleeper.app/v1/league/{league_id}/winners_bracket").json()
    losers_bracket  = requests.get(f"https://api.sleeper.app/v1/league/{league_id}/losers_bracket").json()

    # Build standings
    rows = []
    for rid, s in stats.items():
        games = s['games'] or 1
        rows.append({
            'season':     season,
            'roster_id':  rid,
            'owner':      rid_to_owner.get(rid, 'Unknown'),
            'wins':       s['wins'],
            'losses':     s['losses'],
            'pf':         round(s['pf'], 2),
            'pa':         round(s['pa'], 2),
            'ppg':        round(s['pf'] / games, 2),
            'max_pf':     round(s['max_pf'], 2),
            'best_score': round(s['best_score'], 2),
            'is_champ':   rid == champ_rid,
        })

    rows = sorted(rows, key=lambda x: (-x['wins'], -x['pf']))
    for i, r in enumerate(rows):
        r['rank'] = i + 1

    # Top 10 scoring weeks
    top_weeks_sorted = sorted(top_weeks, key=lambda x: x['points'], reverse=True)[:10]

    # Top 10 player games overall
    top_player_games_sorted = sorted(top_player_games, key=lambda x: x['points'], reverse=True)[:10]

    # Top 10 per position
    top_by_pos = {}
    for pos in ['QB', 'RB', 'WR', 'TE']:
        pos_games = [g for g in top_player_games if g['pos'] == pos]
        top_by_pos[pos] = sorted(pos_games, key=lambda x: x['points'], reverse=True)[:10]

    return {
        'season':           season,
        'standings':        rows,
        'champion':         champ_name,
        'champ_roster_id':  champ_rid,
        'winners_bracket':  winners_bracket,
        'losers_bracket':   losers_bracket,
        'playoff_matchups': playoff_matchups,
        'rid_to_owner':     rid_to_owner,
        'top_weeks':        top_weeks_sorted,
        'top_player_games': top_player_games_sorted,
        'top_by_pos':       top_by_pos,
    }

# Pull history for all completed seasons
print("Pulling league history...")
league_history   = {}
all_top_weeks    = []
all_player_games = []
all_top_by_pos   = {pos: [] for pos in ['QB', 'RB', 'WR', 'TE']}

for season_str, league_id in all_league_ids:
    season_int = int(season_str)
    if season_int >= int(current_season) + 1:
        continue
    print(f"\nPulling {season_str}...")
    history = get_season_history(league_id, season_str)
    league_history[season_str] = history
    all_top_weeks.extend(history['top_weeks'])
    all_player_games.extend(history['top_player_games'])
    for pos in ['QB', 'RB', 'WR', 'TE']:
        all_top_by_pos[pos].extend(history['top_by_pos'][pos])
    time.sleep(0.5)

# All-time top 10s
all_top_weeks    = sorted(all_top_weeks,    key=lambda x: x['points'], reverse=True)[:10]
all_player_games = sorted(all_player_games, key=lambda x: x['points'], reverse=True)[:10]
for pos in ['QB', 'RB', 'WR', 'TE']:
    all_top_by_pos[pos] = sorted(all_top_by_pos[pos], key=lambda x: x['points'], reverse=True)[:10]

print(f"\n✅ League history built for seasons: {list(league_history.keys())}")

for season, hist in league_history.items():
    print(f"\n{season} Champion: {hist['champion']} 🏆")
    print("Standings:")
    for r in hist['standings']:
        champ = ' 🏆' if r['is_champ'] else ''
        print(f"  #{r['rank']} {r['owner']}: {r['wins']}-{r['losses']} | "
              f"PF: {r['pf']} | PPG: {r['ppg']} | MaxPF: {r['max_pf']} | Best: {r['best_score']}{champ}")

print(f"\nAll-time top 10 scoring weeks:")
for i, w in enumerate(all_top_weeks):
    print(f"  #{i+1} {w['owner']} — {w['points']} pts ({w['label']})")

print(f"\nAll-time top 10 player games:")
for i, g in enumerate(all_player_games):
    print(f"  #{i+1} {g['name']} ({g['pos']}) — {g['points']} pts ({g['label']}) [{g['owner']}] {g['started']}")

for pos in ['QB', 'RB', 'WR', 'TE']:
    print(f"\nTop 10 {pos} games:")
    for i, g in enumerate(all_top_by_pos[pos]):
        print(f"  #{i+1} {g['name']} — {g['points']} pts ({g['label']}) [{g['owner']}] {g['started']}")


# In[ ]:


# ============================================================
# 23. Push All Data to JSON Files
# ============================================================

import json
import os
import numpy as np

def clean_for_json(obj):
    """Recursively convert numpy types to native Python types."""
    if isinstance(obj, dict):
        return {k: clean_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_for_json(v) for v in obj]
    elif isinstance(obj, (np.integer, np.int64)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64)):
        return round(float(obj), 2)
    elif isinstance(obj, float) and np.isnan(obj):
        return None
    elif isinstance(obj, bool):
        return obj
    else:
        return obj

def push_json(filename, data):
    filepath = os.path.join(OUTPUT_DIR, filename)
    with open(filepath, 'w') as f:
        json.dump(clean_for_json(data), f)
    print(f"  ✅ {filename}")

def df_to_records(df):
    return clean_for_json(df.fillna('').to_dict(orient='records'))

os.makedirs(OUTPUT_DIR, exist_ok=True)
print(f"Pushing all data to JSON files...")
print(f"Output: {OUTPUT_DIR}\n")

# Player Universe
print("Pushing Player Universe...")
pu = merged_df[[
    "name","position","nfl_team","age","owner","on_taxi",
    "KTC Value","multi_year_prod_score","combined_score",
    "avg_ppg","n_seasons","tier","is_my_team",
    "gsis_id"
]].copy()
pu.columns = [
    "Player","Position","NFL Team","Age","Dynasty Owner","On Taxi",
    "KTC Value","Multi-Year Prod Score","Combined Score",
    "Avg PPG","Seasons","Tier","My Team",
    "GSIS ID"
]
push_json('playerUniverse.json', df_to_records(
    pu.sort_values(["Dynasty Owner","Position","KTC Value"], ascending=[True,True,False])
))

# Team Overview
print("Pushing Team Overview...")
year_cols      = [col for year in YEARS for col in (f"first_{year}", f"dc_{year}")]
year_col_names = [col for year in YEARS for col in (f"{year} 1sts", f"{year} Status")]

to = outlook_df[[
    "owner","outlook","value_share","production_share","share_gap",
    "value_rank","production_rank","CF_total",
    *year_cols,
    "total_firsts","player_ktc_value","pick_ktc_value","total_ktc_value",
    "core_age","peak_year","peak_window","years_to_peak","peak_gain_pct","age_runway","value_curve"
]].copy()
to.columns = [
    "Owner","Outlook","Value Share %","Production Share %","Gap",
    "Value Rank","Production Rank","C+F Total",
    *year_col_names,
    "Total 1sts","Player Value","Pick Value","Total Value",
    "Core Age","Peak Year","Peak Window","Years to Peak","Peak Gain %","Age Runway","Value Curve"
]
push_json('teamOverview.json', df_to_records(to))

# Roster Grades
print("Pushing Roster Grades...")
rg = grades_df[[
    "owner","rank","total_grade",
    "QB_grade","QB_starter_value","QB_depth_value","QB_top_player",
    "RB_grade","RB_starter_value","RB_depth_value","RB_top_player",
    "WR_grade","WR_starter_value","WR_depth_value","WR_top_player",
    "TE_grade","TE_starter_value","TE_depth_value","TE_top_player"
]].copy()
rg.columns = [
    "Owner","Rank","Total Grade",
    "QB Grade","QB Starter Val","QB Depth Val","QB Top Player",
    "RB Grade","RB Starter Val","RB Depth Val","RB Top Player",
    "WR Grade","WR Starter Val","WR Depth Val","WR Top Player",
    "TE Grade","TE Starter Val","TE Depth Val","TE Top Player"
]
push_json('rosterGrades.json', df_to_records(rg))

# Positional Proportion
print("Pushing Positional Proportion...")
pp = pos_pivot[[
    "owner","QB_pct","RB_pct","WR_pct","TE_pct",
    "flex_pct","onesie_pct","QB","RB","WR","TE","total_player_value"
]].copy()
pp.columns = [
    "Owner","QB %","RB %","WR %","TE %","Flex %","Onesie %",
    "QB Value","RB Value","WR Value","TE Value","Total Player Value"
]
push_json('positionalProportion.json', df_to_records(pp))

# League Rosters
print("Pushing League Rosters...")
league_rosters = merged_df[[
    "owner","name","position","nfl_team","age",
    "on_taxi","KTC Value","multi_year_prod_score",
    "combined_score","avg_ppg","n_seasons","tier"
]].copy()
league_rosters = league_rosters.sort_values(
    ["owner","combined_score"], ascending=[True,False]
).reset_index(drop=True)
league_rosters["roster_rank"] = league_rosters.groupby("owner").cumcount() + 1
league_rosters.columns = [
    "Owner","Player","Position","NFL Team","Age",
    "On Taxi","KTC Value","Multi-Year Prod Score",
    "Combined Score","Avg PPG","Seasons","Tier","Roster Rank"
]
league_rosters = league_rosters[[
    "Owner","Roster Rank","Player","Position","NFL Team","Age",
    "On Taxi","KTC Value","Multi-Year Prod Score",
    "Combined Score","Avg PPG","Seasons","Tier"
]]
push_json('leagueRosters.json', df_to_records(league_rosters))

# KTC Rankings
print("Pushing KTC Rankings...")
ktc_players = merged_df[["name","KTC Value","multi_year_prod_score","combined_score"]].copy()
ktc_players = ktc_players.rename(columns={"name": "Player"})
ktc_players["Type"] = "Player"
ktc_picks = all_picks[["Name","KTC Value"]].copy()
ktc_picks.columns = ["Player","KTC Value"]
ktc_picks["multi_year_prod_score"] = 0
ktc_picks["combined_score"]        = ktc_picks["KTC Value"]
ktc_picks["Type"]                  = "Pick"
ktc_combined = pd.concat([ktc_players, ktc_picks], ignore_index=True)
ktc_combined = ktc_combined.sort_values("KTC Value", ascending=False).reset_index(drop=True)
ktc_combined.insert(0, "Rank", range(1, len(ktc_combined) + 1))
ktc_combined.columns = ["Rank","Player / Pick","KTC Value","Multi-Year Prod Score","Combined Score","Type"]
ktc_combined = ktc_combined.drop(columns=["Type"])
push_json('ktcRankings.json', df_to_records(ktc_combined))

# Canary: warn if the KTC rankings file looks suspiciously small (scraper regression detector)
_ktc_path = os.path.join(OUTPUT_DIR, 'ktcRankings.json')
try:
    with open(_ktc_path) as _f:
        _ktc_count = len(json.load(_f))
    if _ktc_count < 200:
        print(f"WARNING: ktcRankings.json contains only {_ktc_count} players — expected 200+. Possible KTC scraper regression.")
except Exception as _e:
    print(f"WARNING: Could not read back ktcRankings.json for canary check: {_e}")

# Pick Portfolio
print("Pushing Pick Portfolio...")
pk = picks_master_df[[
    "year","round","slot","tier","pick_display_name",
    "original_owner_name","current_owner_name","ktc_value"
]].copy()
pk = pk.sort_values(["current_owner_name","year","round","slot"])
pk.columns = [
    "Year","Round","Slot","Tier","Pick Name",
    "Original Owner","Current Owner","KTC Value"
]
push_json('pickPortfolio.json', df_to_records(pk))

# Pick Values
print("Pushing Pick Values...")
pick_values = all_picks.copy()
pick_values.columns = ["Pick Name","KTC Value"]
push_json('pickValues.json', df_to_records(pick_values))

# Career Season Stats
print("Pushing Career Season Stats...")
push_json('qbSeasonStats.json', df_to_records(qb_df))
push_json('rbSeasonStats.json', df_to_records(rb_df))
push_json('wrSeasonStats.json', df_to_records(wr_df))
push_json('teSeasonStats.json', df_to_records(te_df))

# Trade History
print("Pushing Trade History...")
push_json('tradeHistory.json', df_to_records(trade_history_df))

# Trade Targets
print("Pushing Trade Targets...")
bt = top_buys[[
    "name","position","age","KTC Value","multi_year_prod_score",
    "combined_score","tier","owner","owner_outlook","buy_score"
]].copy()
bt.columns = [
    "Player","Position","Age","KTC Value","Multi-Year Prod Score",
    "Combined Score","Tier","Current Owner","Owner Outlook","Buy Score"
]
trade_targets_data = {'buy': df_to_records(bt), 'sell': {}}
for team_owner in merged_df["owner"].unique():
    team_sells = all_sell_candidates_df[
        all_sell_candidates_df["owner"] == team_owner
    ].sort_values("sell_score", ascending=False)
    sc = team_sells[[
        "name","position","age","KTC Value","multi_year_prod_score",
        "combined_score","tier","sell_score"
    ]].copy()
    sc.columns = [
        "Player","Position","Age","KTC Value","Multi-Year Prod Score",
        "Combined Score","Tier","Sell Score"
    ]
    trade_targets_data['sell'][team_owner] = df_to_records(sc)
push_json('tradeTargets.json', trade_targets_data)

# League History
print("Pushing League History...")
all_standings = []
for season, hist in league_history.items():
    all_standings.extend(hist['standings'])
standings_df = pd.DataFrame(all_standings)[[
    'season','rank','owner','wins','losses','pf','pa','ppg','max_pf','best_score','is_champ'
]]
standings_df.columns = [
    'Season','Rank','Owner','Wins','Losses','PF','PA','PPG','Max PF','Best Score','Champion'
]
push_json('historyStandings.json', df_to_records(standings_df))

champs = pd.DataFrame([
    {'Season': s, 'Champion': h['champion']}
    for s, h in league_history.items()
])
push_json('historyChampions.json', df_to_records(champs))

top_weeks_df = pd.DataFrame(all_top_weeks)[['label','owner','points']]
top_weeks_df.columns = ['Week','Owner','Points']
push_json('historyTopWeeks.json', df_to_records(top_weeks_df))

all_games_rows = []
for i, g in enumerate(all_player_games):
    all_games_rows.append({
        'Category': 'Overall', 'Rank': i+1,
        'Player': g['name'], 'Position': g['pos'],
        'Points': g['points'], 'Week': g['label'],
        'Owner': g['owner'], 'Started': g['started'],
    })
for pos in ['QB','RB','WR','TE']:
    for i, g in enumerate(all_top_by_pos[pos]):
        all_games_rows.append({
            'Category': pos, 'Rank': i+1,
            'Player': g['name'], 'Position': g['pos'],
            'Points': g['points'], 'Week': g['label'],
            'Owner': g['owner'], 'Started': g['started'],
        })
push_json('historyPlayerGames.json', all_games_rows)

alltime_df = standings_df.copy()
alltime_df['Champion'] = alltime_df['Champion'].astype(int)
alltime = alltime_df.groupby('Owner').agg(
    Seasons       = ('Season',     'count'),
    Wins          = ('Wins',       'sum'),
    Losses        = ('Losses',     'sum'),
    PF            = ('PF',         'sum'),
    PA            = ('PA',         'sum'),
    Max_PF        = ('Max PF',     'sum'),
    Best_Score    = ('Best Score', 'max'),
    Championships = ('Champion',   'sum'),
).reset_index()
alltime['PF']      = alltime['PF'].round(2)
alltime['PA']      = alltime['PA'].round(2)
alltime['Max_PF']  = alltime['Max_PF'].round(2)
alltime['PPG']     = (alltime['PF'] / (alltime['Wins'] + alltime['Losses'])).round(2)
alltime['Win_Pct'] = (alltime['Wins'] / (alltime['Wins'] + alltime['Losses']) * 100).round(1)
alltime = alltime.sort_values('Wins', ascending=False).reset_index(drop=True)
alltime.insert(0, 'Rank', range(1, len(alltime) + 1))
alltime.columns = [
    'Rank','Owner','Seasons','Wins','Losses','PF','PA',
    'Max PF','Best Score','Championships','PPG','Win %'
]
push_json('historyAllTime.json', df_to_records(alltime))

bracket_rows = []
for season, hist in league_history.items():
    rid_to_owner = hist['rid_to_owner']
    for m in hist['winners_bracket']:
        bracket_rows.append({
            'Season': season, 'Type': 'Winners',
            'Match': m['m'], 'Round': m['r'],
            'T1': m.get('t1'), 'T2': m.get('t2'),
            'Winner': m.get('w'), 'Loser': m.get('l'),
            'T1_Owner': rid_to_owner.get(m.get('t1'), ''),
            'T2_Owner': rid_to_owner.get(m.get('t2'), ''),
            'Win_Owner': rid_to_owner.get(m.get('w'), ''),
            'Los_Owner': rid_to_owner.get(m.get('l'), ''),
        })
    for m in hist['losers_bracket']:
        bracket_rows.append({
            'Season': season, 'Type': 'Losers',
            'Match': m['m'], 'Round': m['r'],
            'T1': m.get('t1'), 'T2': m.get('t2'),
            'Winner': m.get('w'), 'Loser': m.get('l'),
            'T1_Owner': rid_to_owner.get(m.get('t1'), ''),
            'T2_Owner': rid_to_owner.get(m.get('t2'), ''),
            'Win_Owner': rid_to_owner.get(m.get('w'), ''),
            'Los_Owner': rid_to_owner.get(m.get('l'), ''),
        })
    for week, matchups in hist['playoff_matchups'].items():
        for team in matchups:
            bracket_rows.append({
                'Season': season, 'Type': 'Score',
                'Match': team['matchup_id'],
                'Round': int(week) - 14,
                'T1': team['roster_id'], 'T2': None,
                'Winner': None, 'Loser': None,
                'T1_Owner': rid_to_owner.get(team['roster_id'], ''),
                'T2_Owner': '', 'Win_Owner': '', 'Los_Owner': '',
                'Points': team['points'], 'Week': int(week),
            })
push_json('historyBrackets.json', clean_for_json(bracket_rows))

# Current Standings
print("Pushing Current Standings...")
standings_data = []
for roster in rosters:
    owner  = roster_id_map.get(roster['roster_id'], 'Unknown')
    wins   = roster.get('settings', {}).get('wins', 0)
    losses = roster.get('settings', {}).get('losses', 0)
    pf     = roster.get('settings', {}).get('fpts', 0)
    pa     = roster.get('settings', {}).get('fpts_against', 0)
    games  = wins + losses
    standings_data.append({
        'owner':  owner,
        'wins':   wins,
        'losses': losses,
        'avgPF':  round(pf / games, 1) if games > 0 else 0,
        'avgPA':  round(pa / games, 1) if games > 0 else 0,
    })
push_json('standings.json', standings_data)

print(f"\n✅ All JSON files pushed to {OUTPUT_DIR}")


# In[ ]:


# ============================================================
# 24. Append Value History Snapshot
# ============================================================

from datetime import date

print("Pushing Value History Snapshot...")

snapshot_date = date.today().isoformat()

teams_snapshot = {}
for owner_name, owner_df in merged_df.groupby("owner"):
    by_position = {
        pos: int(round(owner_df.loc[owner_df["position"] == pos, "KTC Value"].sum()))
        for pos in ["QB", "RB", "WR", "TE"]
    }
    teams_snapshot[owner_name] = {
        "totalKTC": int(round(owner_df["KTC Value"].sum())),
        "byPosition": by_position,
    }

value_history_path = os.path.join(OUTPUT_DIR, "valueHistory.json")
if os.path.exists(value_history_path):
    with open(value_history_path, "r") as f:
        value_history = json.load(f)
else:
    value_history = []

value_history = [entry for entry in value_history if entry.get("date") != snapshot_date]
value_history.append({"date": snapshot_date, "teams": teams_snapshot})
value_history.sort(key=lambda entry: entry["date"])

push_json('valueHistory.json', value_history)


# In[ ]:


# ============================================================
# 25. Fetch 2026 Schedule
# ============================================================

print("Fetching schedule...")

sim_season = int(CURRENT_DRAFT_YEAR)

schedule_weeks = []
any_real_scores = False

for week in range(1, REGULAR_SEASON_WEEKS + 1):
    week_matchups = requests.get(
        f"https://api.sleeper.app/v1/league/{LEAGUE_ID}/matchups/{week}"
    ).json()
    pairs = []
    if week_matchups:
        matchup_map = {}
        for team in week_matchups:
            matchup_map.setdefault(team['matchup_id'], []).append(team)
        for mid, teams in matchup_map.items():
            if len(teams) != 2:
                continue
            a, b = teams
            pairs.append([
                roster_id_map.get(a['roster_id'], 'Unknown'),
                roster_id_map.get(b['roster_id'], 'Unknown'),
            ])
            if (a.get('points') or 0) > 0 or (b.get('points') or 0) > 0:
                any_real_scores = True
    schedule_weeks.append({'week': week, 'matchups': pairs})
    time.sleep(0.1)

schedule_has_pairings = any(w['matchups'] for w in schedule_weeks)

if schedule_has_pairings and not any_real_scores:
    schedule_note = "Preseason \u2014 schedule pairings available from Sleeper, scores not yet recorded."
elif any_real_scores:
    schedule_note = "Live scores in progress."
else:
    schedule_note = "Sleeper has not generated matchups yet for this season."

schedule_data = {
    'season': sim_season,
    'weeks': REGULAR_SEASON_WEEKS,
    'source': 'sleeper' if schedule_has_pairings else 'unavailable',
    'scores_recorded': any_real_scores,
    'note': schedule_note,
    'schedule': schedule_weeks,
}
push_json('schedule.json', schedule_data)


# In[ ]:


# ============================================================
# 26. Playoff Picture Monte Carlo Simulation
# ============================================================

print("Running Playoff Picture simulation...")

owners_list = list(to['Owner'])

# Historical PPG from the most recently completed season only (not all-time
# average) + best score, from League History standings
recent_season = str(current_season)
recent_standings_df = standings_df[standings_df['Season'] == recent_season]

hist_ppg_by_owner  = recent_standings_df.groupby('Owner')['PPG'].mean()
hist_best_by_owner = recent_standings_df.groupby('Owner')['Best Score'].max()
hist_std_by_owner  = recent_standings_df.groupby('Owner')['PPG'].std(ddof=1)

# Roster strength: player-only KTC value normalized onto the PPG scale
player_value_by_owner = to.set_index('Owner')['Player Value']
league_avg_player_ktc = player_value_by_owner.mean()
league_avg_ppg        = hist_ppg_by_owner.mean()

raw_blended_ppg          = {}
historical_ppg_by_owner  = {}
roster_strength_by_owner = {}
for owner in owners_list:
    historical_ppg = float(hist_ppg_by_owner.get(owner, league_avg_ppg))
    player_ktc     = float(player_value_by_owner.get(owner, league_avg_player_ktc))
    roster_strength_score = (player_ktc / league_avg_player_ktc) * league_avg_ppg
    blended_ppg = 0.25 * historical_ppg + 0.75 * roster_strength_score

    historical_ppg_by_owner[owner]  = historical_ppg
    roster_strength_by_owner[owner] = roster_strength_score
    raw_blended_ppg[owner]          = blended_ppg

# Compress blended PPG toward the league mean (+/-8.5%) so roster strength
# alone can't push a team to a near-certain blended score relative to the
# rest of the field — keeps the simulation spread realistic. A wider +/-20%
# band still left the top team locked at 100% playoff odds over a full
# 14-week season (season-long aggregation dampens weekly variance's effect
# on top-6 inclusion much faster than it widens the score gap), so the band
# was tightened until the top team landed in the 85-95% target range while
# still keeping distinct playoff_pct values across the field via std_dev
# differences even when blended_ppg ties at the clipped ceiling/floor.
league_mean_blended = float(np.mean(list(raw_blended_ppg.values())))
max_blended_ppg = league_mean_blended * 1.085
min_blended_ppg = league_mean_blended * 0.915

team_sim_params = {}
for owner in owners_list:
    historical_ppg        = historical_ppg_by_owner[owner]
    roster_strength_score = roster_strength_by_owner[owner]
    blended_ppg = min(max(raw_blended_ppg[owner], min_blended_ppg), max_blended_ppg)

    best_score = float(hist_best_by_owner.get(owner, blended_ppg * 1.3))
    std_dev    = hist_std_by_owner.get(owner, np.nan)
    if pd.isna(std_dev) or std_dev <= 0:
        std_dev = max(5.0, (best_score - blended_ppg) / 1.5)

    team_sim_params[owner] = {
        'historical_ppg':        round(historical_ppg, 2),
        'roster_strength_score': round(roster_strength_score, 2),
        'blended_ppg':           round(blended_ppg, 2),
        'std_dev':               round(float(std_dev), 2),
    }


def build_round_robin(teams, n_weeks):
    """Fallback schedule generator: standard circle method, repeating once the
    single round-robin (n-1 rounds) is exhausted, for any week Sleeper hasn't
    populated yet."""
    teams = list(teams)
    if len(teams) % 2 != 0:
        teams.append(None)
    n = len(teams)
    rounds = []
    rotation = teams[:]
    for _ in range(n - 1):
        round_pairs = []
        for i in range(n // 2):
            a, b = rotation[i], rotation[n - 1 - i]
            if a is not None and b is not None:
                round_pairs.append([a, b])
        rounds.append(round_pairs)
        rotation = [rotation[0]] + [rotation[-1]] + rotation[1:-1]
    return [rounds[w % len(rounds)] for w in range(n_weeks)]


round_robin_weeks = build_round_robin(owners_list, REGULAR_SEASON_WEEKS)

sim_schedule_full = []
for i, week_entry in enumerate(schedule_weeks):
    sim_schedule_full.append(week_entry['matchups'] if week_entry['matchups'] else round_robin_weeks[i])

# Current season record (Sleeper rosters already reflect every completed
# matchup) — used to lock in played weeks instead of re-simulating them
current_record_by_owner = {}
for roster in rosters:
    owner    = roster_id_map.get(roster['roster_id'], 'Unknown')
    settings = roster.get('settings', {}) or {}
    current_record_by_owner[owner] = {
        'wins':   settings.get('wins', 0),
        'losses': settings.get('losses', 0),
        'pf':     float(settings.get('fpts', 0)),
    }

season_started = any(
    r['wins'] + r['losses'] > 0 for r in current_record_by_owner.values()
)
weeks_played = max(
    (r['wins'] + r['losses'] for r in current_record_by_owner.values()), default=0
) if season_started else 0
current_week = min(weeks_played + 1, REGULAR_SEASON_WEEKS)

# Only the remaining weeks get simulated — completed weeks are locked in via
# each team's actual current win/loss record and points-for below
sim_schedule = sim_schedule_full[weeks_played:]

# Monte Carlo simulation
rng = np.random.default_rng()
playoff_counts = {owner: 0 for owner in owners_list}

for _ in range(SIM_ITERATIONS):
    wins   = {owner: current_record_by_owner[owner]['wins'] for owner in owners_list}
    points = {owner: current_record_by_owner[owner]['pf']   for owner in owners_list}

    for week_pairs in sim_schedule:
        for owner_a, owner_b in week_pairs:
            params_a = team_sim_params[owner_a]
            params_b = team_sim_params[owner_b]
            score_a = max(50, rng.normal(params_a['blended_ppg'], params_a['std_dev']))
            score_b = max(50, rng.normal(params_b['blended_ppg'], params_b['std_dev']))

            # Upset factor — 10% chance per team of a significantly off week
            # (good or bad), independent of the bye-week proxy below
            if rng.random() < 0.10:
                upset_mult = rng.uniform(0.65, 0.85) if rng.random() < 0.5 else rng.uniform(1.15, 1.35)
                score_a *= upset_mult
            if rng.random() < 0.10:
                upset_mult = rng.uniform(0.65, 0.85) if rng.random() < 0.5 else rng.uniform(1.15, 1.35)
                score_b *= upset_mult

            # Bye week proxy — 15% chance per team of a down week (bye,
            # injury, etc); intentionally stacks with the upset factor above
            if rng.random() < 0.15:
                score_a *= rng.uniform(0.80, 0.92)
            if rng.random() < 0.15:
                score_b *= rng.uniform(0.80, 0.92)

            points[owner_a] += score_a
            points[owner_b] += score_b
            if score_a > score_b:
                wins[owner_a] += 1
            else:
                wins[owner_b] += 1

    ranked = sorted(owners_list, key=lambda o: (-wins[o], -points[o]))
    for owner in ranked[:PLAYOFF_SPOTS]:
        playoff_counts[owner] += 1

outlook_by_owner = to.set_index('Owner')['Outlook']
team_name_map = {}
for u in users:
    display = u.get('display_name') or u.get('username', 'Unknown')
    team    = (u.get('metadata') or {}).get('team_name') or display
    team_name_map[display] = team

playoff_teams_output = []
for owner in owners_list:
    params = team_sim_params[owner]
    record = current_record_by_owner[owner]
    playoff_teams_output.append({
        'owner':                 owner,
        'team_name':             team_name_map.get(owner, owner),
        'playoff_pct':           round(playoff_counts[owner] / SIM_ITERATIONS, 3),
        'blended_ppg':           params['blended_ppg'],
        'historical_ppg':        params['historical_ppg'],
        'roster_strength_score': params['roster_strength_score'],
        'current_wins':          record['wins'],
        'current_losses':        record['losses'],
        'outlook':               outlook_by_owner.get(owner, 'Unknown'),
    })

playoff_teams_output.sort(key=lambda t: t['playoff_pct'], reverse=True)

playoff_picture_data = {
    'generated_at':     datetime.utcnow().isoformat() + 'Z',
    'season':           sim_season,
    'weeks_simulated':  REGULAR_SEASON_WEEKS,
    'weeks_played':     weeks_played,
    'current_week':     current_week,
    'season_started':   season_started,
    'playoff_spots':    PLAYOFF_SPOTS,
    'iterations':       SIM_ITERATIONS,
    'teams':            playoff_teams_output,
}
push_json('playoffPicture.json', playoff_picture_data)


# In[ ]:


# ============================================================
# 27. Export Data for Tableau
# ============================================================

import os

EXPORT_PATH = "./tableau_exports/"
os.makedirs(EXPORT_PATH, exist_ok=True)

# ---- Player Universe ----
merged_df[[
    "name", "position", "nfl_team", "age", "owner", "on_taxi",
    "KTC Value", "multi_year_prod_score", "combined_score",
    "avg_ppg", "n_seasons", "tier", "tier_rank", "is_my_team"
]].to_csv(f"{EXPORT_PATH}player_universe.csv", index=False)

# ---- Team Overview ----
outlook_df[[
    "owner", "outlook", "value_share", "production_share", "share_gap",
    "value_rank", "production_rank", "CF_total",
    "first_2026", "first_2027", "first_2028", "total_firsts",
    "player_ktc_value", "pick_ktc_value", "total_ktc_value",
    "QB_pct", "RB_pct", "WR_pct", "TE_pct", "flex_pct", "onesie_pct",
    "Cornerstone", "Upside Premier", "Foundational", "Mainstay",
    "Upside Shot", "Serviceable"
]].to_csv(f"{EXPORT_PATH}team_overview.csv", index=False)

# ---- Roster Grades ----
grades_df.to_csv(f"{EXPORT_PATH}roster_grades.csv", index=False)

# ---- Positional Proportion ----
pos_pivot.to_csv(f"{EXPORT_PATH}positional_proportion.csv", index=False)

# ---- Pick Portfolio ----
picks_master_df[[
    "year", "round", "tier", "original_owner_name",
    "current_owner_name", "ktc_value"
]].to_csv(f"{EXPORT_PATH}pick_portfolio.csv", index=False)

# ---- Buy Targets ----
top_buys[[
    "name", "position", "age", "KTC Value", "multi_year_prod_score",
    "combined_score", "tier", "owner", "owner_outlook", "buy_score"
]].to_csv(f"{EXPORT_PATH}buy_targets.csv", index=False)

# ---- Sell Candidates ----
sell_candidates[[
    "name", "position", "age", "KTC Value", "multi_year_prod_score",
    "combined_score", "tier", "sell_score"
]].to_csv(f"{EXPORT_PATH}sell_candidates.csv", index=False)

# ---- KTC Rankings ----
rankings_df[[
    "Player", "position_clean", "Age", "KTC Value",
    "multi_year_prod_score", "combined_score", "avg_ppg",
    "n_seasons", "tier", "tier_rank"
]].to_csv(f"{EXPORT_PATH}ktc_rankings.csv", index=False)

print("✅ All CSVs exported to ./tableau_exports/")
print(f"\nFiles exported:")
for f in os.listdir(EXPORT_PATH):
    size = os.path.getsize(f"{EXPORT_PATH}{f}")
    print(f"  {f:<35} {size:>8,} bytes")


# In[ ]:




