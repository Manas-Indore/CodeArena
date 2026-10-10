const pool = require('../config/db');

// Tweak these two numbers to change how fast players climb in difficulty.
const MEDIUM_MIN_RATING = 1300;
const HARD_MIN_RATING = 1600;

function difficultyForRating(rating) {
  if (rating >= HARD_MIN_RATING) return 'hard';
  if (rating >= MEDIUM_MIN_RATING) return 'medium';
  return 'easy';
}

// Random published problem id, optionally filtered by difficulty. Null if none exist.
async function randomProblemId(difficulty) {
  const values = [];
  let where = 'WHERE is_published = true';
  if (difficulty) {
    values.push(difficulty);
    where += ` AND difficulty = $${values.length}`;
  }

  const result = await pool.query(
    `SELECT id FROM problems ${where} ORDER BY RANDOM() LIMIT 1`,
    values
  );
  return result.rows[0]?.id ?? null;
}

// Picks a problem whose difficulty fits the rating.
// Falls back to any published problem if that difficulty tier is empty.
async function pickProblemIdByRating(rating) {
  const difficulty = difficultyForRating(rating);

  const problemId = await randomProblemId(difficulty);
  if (problemId) return { problemId, difficulty };

  const fallbackId = await randomProblemId(null);
  return { problemId: fallbackId, difficulty: null };
}

module.exports = {
  difficultyForRating,
  randomProblemId,
  pickProblemIdByRating,
  MEDIUM_MIN_RATING,
  HARD_MIN_RATING,
};