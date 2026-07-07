// Fetch helpers for /api/user-data — the Sleeper-auth equivalent of blueprintService.js
// (Firestore) for external-league Blueprint watchlist/goals storage.

export async function fetchUserData(userId, leagueId) {
  const res = await fetch(`/api/user-data?action=get&user_id=${userId}&league_id=${leagueId}`);
  if (!res.ok) return { watchlist: [], goals: [] };
  return res.json();
}

export async function saveUserData(userId, leagueId, data) {
  await fetch('/api/user-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'set', user_id: userId, league_id: leagueId, data }),
  });
}

export function genId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
