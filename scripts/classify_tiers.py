#!/usr/bin/env python3
"""
Standalone AI tier classifier — run manually 2-5x/year, not part of the regular pipeline.

Reads public/data/playerUniverse.json (rostered players + current tier as prior) and
public/data/ktcRankings.json (KTC values), makes a single Anthropic API call to reclassify
every rostered player into a tier, and writes public/data/playerTiers.json.

Does NOT touch the formula-based tier assignment in notebooks/wilsons_teams.py and is NOT
wired into any page or data pipeline yet — output is for review only.
"""

import os
import re
import json

import anthropic

try:
    from dotenv import load_dotenv, find_dotenv
    _dotenv_path = find_dotenv(usecwd=True)
    if _dotenv_path:
        load_dotenv(_dotenv_path)
except ImportError:
    pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', 'public', 'data'))

MODEL = 'claude-sonnet-4-6'

TIER_DEFINITIONS = '''Cornerstone: The best of the best. Elite dynasty asset, young (21-27), highly insulated, franchise-defining value. The players you build around and never trade without a massive return. High production, high upside, and the situation to sustain it.

Foundational: High-end starter with strong insulation and a high value floor. Not quite Cornerstone but multiple peak years ahead. Ceiling hasn't fully been realized yet. Core pieces you don't move without a massive return.

Upside Premier: Young player with high insulation due to team investment and situation. KTC value driven more by upside and age than proven production. The development path is Upside Premier → Foundational → Cornerstone.

Mainstay: Reliable every-week starter. Value ceiling is capped but dependable year in and year out. Not elite but you always know what you're getting. Younger version of a Productive Vet.

Productive Vet: Older player with a strong production resume who remains relevant due to track record. Insulation is lower due to age but consistent production keeps them valuable.

Short-term Winner: Can single-handedly win you a championship right now. Small tier reserved for elite producers who are past their peak age but still dominant. Own them if you're contending, move them before the cliff.

Short-term Production: A level down from Productive Vet. Still producing but significant questions around injury, insulation, or longevity. Useful for contenders looking for wins now but not a long-term hold.

Upside Shot: Young or cheap player with a real but unproven path to contribution. Lottery ticket with some basis — stuck behind a depth chart, early in development, or in a crowded room. Target as a rebuild or reload.

Serviceable: Can plug into your flex and have a decent week. Not someone you rely on week-to-week but useful depth. Even contending teams can win with serviceable assets if they have enough elite pieces above them.

Jag Developmental: Worth rostering due to age and potential but no current production. Stuck behind a crowded depth chart or early in development. Don't start them but don't cut them either.

Jag Insurance: Handcuff or emergency depth only. Only useful if the player above them on the depth chart goes down. No standalone dynasty value.

Replaceable: Minimal dynasty value. Basically cuttable in most leagues. Deep bench filler in very deep leagues only.'''

VALID_TIERS = {
    'Cornerstone', 'Foundational', 'Upside Premier', 'Mainstay', 'Productive Vet',
    'Short-term Winner', 'Short-term Production', 'Upside Shot', 'Serviceable',
    'Jag Developmental', 'Jag Insurance', 'Replaceable',
}

SYSTEM_PROMPT = f'''You are a dynasty fantasy football expert classifying players into tiers.

Tier definitions:
{TIER_DEFINITIONS}

Instructions:
- Use the current tier as a strong prior — only change it if you are highly confident the player belongs elsewhere.
- Consider KTC value, age, position, and production together — not any single factor in isolation.
- A high KTC value alone does not make someone a Cornerstone — they must also be young and insulated.
- A low KTC value alone does not make someone Replaceable — a young player with upside may be Jag Developmental or Upside Shot.
- A player aged 22 or younger with a KTC value of 7000 or higher should be classified as Cornerstone regardless of limited production history — elite prospect value at a young age earns Cornerstone status.
- Return ONLY a JSON array of objects with "player" and "tier" fields, no other text.

The JSON schema must be exactly:
[
  {{"player": "Player Name", "tier": "Tier Name"}}
]

Return ONLY the JSON array. No markdown. No explanation. No preamble.'''


def read_json(filename):
    with open(os.path.join(DATA_DIR, filename)) as f:
        return json.load(f)


def build_player_lines(player_universe, ktc_by_name):
    lines = []
    for p in player_universe:
        name = p['Player']
        ktc = ktc_by_name.get(name, p.get('KTC Value') or 0)
        ppg = p.get('Avg PPG') or 0
        seasons = p.get('Seasons') or 0
        lines.append(
            f'{name} | {p.get("Position", "")} | Age {p.get("Age", "?")} | '
            f'KTC {int(ktc):,} | Current Tier: {p.get("Tier", "Unknown")} | '
            f'Avg PPG: {ppg:.1f} | Seasons: {seasons:.0f}'
        )
    return lines


def main():
    print(f'Data directory: {DATA_DIR}')

    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        raise ValueError(
            'ANTHROPIC_API_KEY not set — add it to .env in the repo root or export it '
            'before running this script.'
        )
    client = anthropic.Anthropic(api_key=api_key)

    player_universe = read_json('playerUniverse.json')
    ktc_rankings = read_json('ktcRankings.json')
    ktc_by_name = {r['Player / Pick']: r['KTC Value'] for r in ktc_rankings}

    print(f'Loaded {len(player_universe)} rostered players, {len(ktc_rankings)} KTC entries')

    player_lines = build_player_lines(player_universe, ktc_by_name)
    players_text = '\n'.join(player_lines)

    user_message = (
        f'Here are all {len(player_universe)} rostered players in our dynasty league, '
        'with their current tier assignment as a prior:\n\n'
        f'{players_text}\n\n'
        'Classify every player listed above into exactly one tier. Return ONLY the JSON array.'
    )

    print(f'Prompt length: {len(user_message):,} characters')
    print('Calling Anthropic API...')

    message = client.messages.create(
        model=MODEL,
        max_tokens=8192,
        system=SYSTEM_PROMPT,
        messages=[{'role': 'user', 'content': user_message}],
    )

    response_text = message.content[0].text
    print(f'Response received ({len(response_text):,} chars) ✅')
    print(f'Input tokens: {message.usage.input_tokens}, Output tokens: {message.usage.output_tokens}')

    cleaned = response_text.strip()
    cleaned = re.sub(r'^```(?:json)?\n?', '', cleaned)
    cleaned = re.sub(r'\n?```$', '', cleaned)
    cleaned = cleaned.strip()

    classifications = json.loads(cleaned)
    print(f'Parsed {len(classifications)} classifications')

    current_tier_by_name = {p['Player']: p.get('Tier', 'Unknown') for p in player_universe}

    player_tiers = {}
    changes = []
    unknown_tiers = []

    for entry in classifications:
        name = entry.get('player')
        tier = entry.get('tier')
        if not name or not tier:
            continue
        if tier not in VALID_TIERS:
            unknown_tiers.append((name, tier))
        player_tiers[name] = tier

        old_tier = current_tier_by_name.get(name)
        if old_tier is not None and old_tier != tier:
            changes.append({'player': name, 'old_tier': old_tier, 'new_tier': tier})

    classified_names = set(player_tiers.keys())
    missing = [p['Player'] for p in player_universe if p['Player'] not in classified_names]

    output_path = os.path.join(DATA_DIR, 'playerTiers.json')
    with open(output_path, 'w') as f:
        json.dump(player_tiers, f, indent=2)
    print(f'Wrote {len(player_tiers)} entries to {output_path}')

    print('\n' + '=' * 70)
    print(f'TIER CHANGES ({len(changes)} of {len(player_universe)} players)')
    print('=' * 70)
    for c in sorted(changes, key=lambda c: c['player']):
        print(f'  {c["player"]}: {c["old_tier"]} -> {c["new_tier"]}')

    if unknown_tiers:
        print(f'\n⚠️  {len(unknown_tiers)} entries used a tier not in the defined list:')
        for name, tier in unknown_tiers:
            print(f'  {name}: "{tier}"')

    if missing:
        print(f'\n⚠️  {len(missing)} rostered players were NOT classified by the model:')
        for name in missing:
            print(f'  {name}')

    print(f'\nTotal changes: {len(changes)}')


if __name__ == '__main__':
    main()
