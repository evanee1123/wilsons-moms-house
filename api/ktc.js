const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  const dataDir = path.join(process.cwd(), 'public', 'data');
  const playersPath = path.join(dataDir, 'ktcRankings.json');
  const picksPath = path.join(dataDir, 'pickValues.json');

  let players, picks;
  try {
    players = JSON.parse(fs.readFileSync(playersPath, 'utf8'));
  } catch (err) {
    return res.status(500).json({ error: `Failed to read ktcRankings.json: ${err.message}` });
  }

  try {
    picks = JSON.parse(fs.readFileSync(picksPath, 'utf8'));
  } catch (err) {
    return res.status(500).json({ error: `Failed to read pickValues.json: ${err.message}` });
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  res.status(200).json({ players, picks });
};
