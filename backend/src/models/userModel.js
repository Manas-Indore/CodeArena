const pool = require('../config/db');

// Create a new user, returns the created row (without password_hash)
async function createUser({ username, email, passwordHash }) {
  const query = `
    INSERT INTO users (username, email, password_hash)
    VALUES ($1, $2, $3)
    RETURNING id, username, email, avatar_url, is_admin, created_at
  `;
  const values = [username, email, passwordHash];
  const result = await pool.query(query, values);
  return result.rows[0];
}

// Find a user by email — includes password_hash (needed for login comparison)
async function findUserByEmail(email) {
  const query = `SELECT * FROM users WHERE email = $1`;
  const result = await pool.query(query, [email]);
  return result.rows[0];
}

// Find a user by username (used to check uniqueness on signup)
async function findUserByUsername(username) {
  const query = `SELECT * FROM users WHERE username = $1`;
  const result = await pool.query(query, [username]);
  return result.rows[0];
}

// Find a user by id — excludes password_hash (safe to return to client)
async function findUserById(id) {
  const query = `
    SELECT id, username, email, avatar_url, is_admin, created_at
    FROM users WHERE id = $1
  `;
  const result = await pool.query(query, [id]);
  return result.rows[0];
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserById,
};