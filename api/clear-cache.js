const KV_URL   = process.env.KV_REST_API_URL
const KV_TOKEN = process.env.KV_REST_API_TOKEN

module.exports = async (req, res) => {
  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'KV env vars not configured' })
  }

  const headers = {
    Authorization: `Bearer ${KV_TOKEN}`,
    'Content-Type': 'application/json',
  }

  // SCAN for all league_* keys (and the players cache)
  const scanRes = await fetch(`${KV_URL}/pipeline`, {
    method: 'POST',
    headers,
    body: JSON.stringify([['SCAN', '0', 'MATCH', 'league_*', 'COUNT', '1000']]),
  })
  const scanData = await scanRes.json()

  // Pipeline SCAN response: [{ result: [cursor, [key1, key2, ...]] }]
  const keys = (scanData[0]?.result?.[1]) || []

  if (keys.length === 0) {
    return res.status(200).json({ deleted: 0, message: 'No league_* keys found in cache' })
  }

  // DEL all matched keys in one pipeline command
  const delRes = await fetch(`${KV_URL}/pipeline`, {
    method: 'POST',
    headers,
    body: JSON.stringify([['DEL', ...keys]]),
  })
  const delData = await delRes.json()
  const deleted = delData[0]?.result ?? keys.length

  return res.status(200).json({ deleted, keys })
}
