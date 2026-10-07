const { getUserRatings, getLeaderboard } = require('../models/ratingModel');

// GET /api/ratings/me
async function getMyRatings(req, res) {
  try {
    const ratings = await getUserRatings(req.userId);
    res.json({ ratings });
  } catch (err) {
    console.error('Get my ratings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/ratings/leaderboard?mode=speed_coding
async function leaderboard(req, res) {
  const { mode } = req.query;
  if (!mode) {
    return res.status(400).json({ error: 'mode query param is required' });
  }

  try {
    const rows = await getLeaderboard(mode);
    res.json({ mode, leaderboard: rows });
  } catch (err) {
    console.error('Get leaderboard error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getMyRatings, leaderboard };