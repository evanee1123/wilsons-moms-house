// Vercel serverless function: GET/POST /api/user-data
// Persists a Sleeper-identified external-league user's Blueprint watchlist/goals
// to Upstash (Vercel KV) — the Sleeper-auth equivalent of Wilson's Firestore
// users/{uid}/goals + users/{uid}/watchlist subcollections.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

const DEFAULT_DATA = { watchlist: [], goals: [] };

async function kvGet(key) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(`${KV_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    if (!r.ok) return null;
    const body = await r.json();
    return body?.result ? JSON.parse(body.result) : null;
  } catch {
    return null;
  }
}

async function kvSet(key, value) {
  if (!KV_URL || !KV_TOKEN) return;
  await fetch(`${KV_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([['SET', key, JSON.stringify(value)]]),
  });
}

module.exports = async (req, res) => {
  const params = { ...req.query, ...(req.body || {}) };
  const { action, user_id: userId, league_id: leagueId, data } = params;

  if (!userId || !leagueId) {
    return res.status(400).json({ error: 'user_id and league_id are required' });
  }

  const key = `user_${userId}_league_${leagueId}`;

  if (action === 'set') {
    if (!data) return res.status(400).json({ error: 'data is required for action=set' });
    const payload = typeof data === 'string' ? JSON.parse(data) : data;
    await kvSet(key, { watchlist: payload.watchlist || [], goals: payload.goals || [] });
    return res.status(200).json({ ok: true });
  }

  // action=get (default)
  const stored = await kvGet(key);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(stored || DEFAULT_DATA);
};
