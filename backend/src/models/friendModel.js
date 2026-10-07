const pool = require('../config/db');

async function findUserByUsername(username) {
  const result = await pool.query(`SELECT id, username FROM users WHERE username = $1`, [username]);
  return result.rows[0];
}

async function findExistingFriendship(userIdA, userIdB) {
  const result = await pool.query(
    `SELECT * FROM friendships
     WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
    [userIdA, userIdB]
  );
  return result.rows[0];
}

async function sendFriendRequest(requesterId, addresseeId) {
  const result = await pool.query(
    `INSERT INTO friendships (requester_id, addressee_id, status)
     VALUES ($1, $2, 'pending')
     RETURNING *`,
    [requesterId, addresseeId]
  );
  return result.rows[0];
}

async function getFriendshipById(id) {
  const result = await pool.query(`SELECT * FROM friendships WHERE id = $1`, [id]);
  return result.rows[0];
}

async function acceptFriendship(id) {
  const result = await pool.query(
    `UPDATE friendships SET status = 'accepted', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
}

async function deleteFriendship(id) {
  await pool.query(`DELETE FROM friendships WHERE id = $1`, [id]);
}

async function listFriends(userId) {
  const result = await pool.query(
    `SELECT u.id AS user_id, u.username, f.updated_at AS friends_since
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
     WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1)
     ORDER BY f.updated_at DESC`,
    [userId]
  );
  return result.rows;
}

async function listIncomingRequests(userId) {
  const result = await pool.query(
    `SELECT f.id, u.id AS requester_id, u.username AS requester_username, f.created_at
     FROM friendships f
     JOIN users u ON u.id = f.requester_id
     WHERE f.addressee_id = $1 AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [userId]
  );
  return result.rows;
}

async function areFriends(userIdA, userIdB) {
  const result = await pool.query(
    `SELECT 1 FROM friendships
     WHERE status = 'accepted'
       AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
    [userIdA, userIdB]
  );
  return result.rowCount > 0;
}

async function removeFriend(userIdA, userIdB) {
  await pool.query(
    `DELETE FROM friendships
     WHERE status = 'accepted'
       AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
    [userIdA, userIdB]
  );
}

// Recent completed matches involving the user or any of their accepted friends
async function getActivityFeed(userId, limit = 20) {
  const result = await pool.query(
    `
    WITH my_network AS (
      SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS friend_id
      FROM friendships
      WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)
      UNION
      SELECT $1
    )
    SELECT m.id AS match_id, m.mode, m.ended_at, p.title AS problem_title,
           u.username, mp.result, mp.rating_before, mp.rating_after
    FROM match_participants mp
    JOIN matches m ON m.id = mp.match_id
    JOIN problems p ON p.id = m.problem_id
    JOIN users u ON u.id = mp.user_id
    WHERE mp.user_id IN (SELECT friend_id FROM my_network)
      AND m.status = 'completed'
    ORDER BY m.ended_at DESC
    LIMIT $2
    `,
    [userId, limit]
  );
  return result.rows;
}

module.exports = {
  findUserByUsername,
  findExistingFriendship,
  sendFriendRequest,
  getFriendshipById,
  acceptFriendship,
  deleteFriendship,
  listFriends,
  listIncomingRequests,
  areFriends,
  removeFriend,
  getActivityFeed,
};