const pool = require('../config/db');

// Returns the user's rating row for this mode, creating one at the default
// (1200) if they've never played this mode before.
async function getOrCreateRating(userId, mode) {
  const existing = await pool.query(
    `SELECT * FROM ratings WHERE user_id = $1 AND mode = $2`,
    [userId, mode]
  );
  if (existing.rows[0]) return existing.rows[0];

  const inserted = await pool.query(
    `INSERT INTO ratings (user_id, mode, rating, games_played, wins, losses, draws)
     VALUES ($1, $2, 1200, 0, 0, 0, 0)
     ON CONFLICT (user_id, mode) DO NOTHING
     RETURNING *`,
    [userId, mode]
  );
  if (inserted.rows[0]) return inserted.rows[0];

  // Lost a race to another concurrent insert — just read what's there now
  const retry = await pool.query(
    `SELECT * FROM ratings WHERE user_id = $1 AND mode = $2`,
    [userId, mode]
  );
  return retry.rows[0];
}

async function updateRating(userId, mode, { newRating, result }) {
  const field = result === 'win' ? 'wins' : result === 'loss' ? 'losses' : 'draws';

  const query = `
    UPDATE ratings
    SET rating = $1, games_played = games_played + 1, ${field} = ${field} + 1, updated_at = NOW()
    WHERE user_id = $2 AND mode = $3
    RETURNING *
  `;
  const result2 = await pool.query(query, [newRating, userId, mode]);
  return result2.rows[0];
}

async function getUserRatings(userId) {
  const result = await pool.query(
    `SELECT mode, rating, games_played, wins, losses, draws FROM ratings WHERE user_id = $1 ORDER BY mode`,
    [userId]
  );
  return result.rows;
}

async function getLeaderboard(mode, limit = 50) {
  const result = await pool.query(
    `SELECT u.username, r.rating, r.games_played, r.wins, r.losses
     FROM ratings r
     JOIN users u ON u.id = r.user_id
     WHERE r.mode = $1
     ORDER BY r.rating DESC
     LIMIT $2`,
    [mode, limit]
  );
  return result.rows;
}

module.exports = { getOrCreateRating, updateRating, getUserRatings, getLeaderboard };