const pool = require('../config/db');

async function createMatch({ mode, problemId, maxPlayers, minRating }) {
  const result = await pool.query(
    `INSERT INTO matches (mode, status, problem_id, max_players, min_rating)
     VALUES ($1, 'waiting', $2, $3, $4)
     RETURNING id, mode, status, problem_id, max_players, min_rating, created_at`,
    [mode, problemId, maxPlayers, minRating || null]
  );
  return result.rows[0];
}

async function getMatchById(id) {
  const result = await pool.query(`SELECT * FROM matches WHERE id = $1`, [id]);
  return result.rows[0];
}

async function listWaitingMatches(mode) {
  const result = await pool.query(
    `SELECT m.id, m.mode, m.status, m.max_players, m.created_at,
            p.title AS problem_title, p.slug AS problem_slug,
            (SELECT COUNT(*) FROM match_participants mp WHERE mp.match_id = m.id)::int AS player_count
     FROM matches m
     JOIN problems p ON p.id = m.problem_id
     WHERE m.status = 'waiting' AND m.mode = $1
     ORDER BY m.created_at DESC`,
    [mode]
  );
  return result.rows;
}

async function addParticipant(matchId, userId) {
  const result = await pool.query(
    `INSERT INTO match_participants (match_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (match_id, user_id) DO NOTHING
     RETURNING id, match_id, user_id, result, joined_at`,
    [matchId, userId]
  );
  return result.rows[0];
}

async function countParticipants(matchId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM match_participants WHERE match_id = $1`,
    [matchId]
  );
  return result.rows[0].count;
}

async function listParticipants(matchId) {
  const result = await pool.query(
    `SELECT mp.user_id, u.username, mp.result
     FROM match_participants mp
     JOIN users u ON u.id = mp.user_id
     WHERE mp.match_id = $1`,
    [matchId]
  );
  return result.rows;
}

async function startMatch(matchId) {
  const result = await pool.query(
    `UPDATE matches SET status = 'in_progress', started_at = NOW() WHERE id = $1 RETURNING *`,
    [matchId]
  );
  return result.rows[0];
}

// Atomically completes a match — only the FIRST caller wins the race
// (WHERE status = 'in_progress' ensures a second simultaneous "accepted"
// submission can't also try to complete an already-completed match).
async function completeMatch(matchId, winnerUserId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const matchUpdate = await client.query(
      `UPDATE matches SET status = 'completed', ended_at = NOW()
       WHERE id = $1 AND status = 'in_progress'
       RETURNING *`,
      [matchId]
    );

    if (matchUpdate.rowCount === 0) {
      await client.query('ROLLBACK');
      return null; // someone else already completed this match
    }

    await client.query(
      `UPDATE match_participants SET result = 'win' WHERE match_id = $1 AND user_id = $2`,
      [matchId, winnerUserId]
    );

    await client.query(
      `UPDATE match_participants SET result = 'loss' WHERE match_id = $1 AND user_id != $2`,
      [matchId, winnerUserId]
    );

    await client.query('COMMIT');
    return matchUpdate.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function isParticipant(matchId, userId) {
  const result = await pool.query(
    `SELECT 1 FROM match_participants WHERE match_id = $1 AND user_id = $2`,
    [matchId, userId]
  );
  return result.rowCount > 0;
}

module.exports = {
  createMatch,
  getMatchById,
  listWaitingMatches,
  addParticipant,
  countParticipants,
  listParticipants,
  startMatch,
  completeMatch,
  isParticipant,
};