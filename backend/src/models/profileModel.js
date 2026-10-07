const pool = require('../config/db');

async function getPublicUserByUsername(username) {
  const result = await pool.query(
    `SELECT id, username, avatar_url, created_at FROM users WHERE username = $1`,
    [username]
  );
  return result.rows[0];
}

async function getPracticeStats(userId) {
  const result = await pool.query(
    `SELECT 
       COUNT(DISTINCT problem_id) FILTER (WHERE verdict = 'accepted') AS problems_solved,
       COUNT(*) AS total_submissions
     FROM submissions
     WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0];
}

async function getRecentMatches(userId, limit = 10) {
  const result = await pool.query(
    `SELECT m.id AS match_id, m.mode, m.ended_at, p.title AS problem_title,
            mp.result, mp.rating_before, mp.rating_after
     FROM match_participants mp
     JOIN matches m ON m.id = mp.match_id
     JOIN problems p ON p.id = m.problem_id
     WHERE mp.user_id = $1 AND m.status = 'completed'
     ORDER BY m.ended_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

async function getHeadToHead(userIdA, userIdB) {
  const result = await pool.query(
    `SELECT m.mode,
            COUNT(*) FILTER (WHERE mp_self.result = 'win') AS wins,
            COUNT(*) FILTER (WHERE mp_self.result = 'loss') AS losses,
            COUNT(*) FILTER (WHERE mp_self.result = 'draw') AS draws
     FROM matches m
     JOIN match_participants mp_self ON mp_self.match_id = m.id AND mp_self.user_id = $1
     JOIN match_participants mp_opp ON mp_opp.match_id = m.id AND mp_opp.user_id = $2
     WHERE m.status = 'completed'
     GROUP BY m.mode`,
    [userIdA, userIdB]
  );
  return result.rows;
}

module.exports = { getPublicUserByUsername, getPracticeStats, getRecentMatches, getHeadToHead };