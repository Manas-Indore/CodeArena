const express = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');
const { getUserRatings } = require('../models/ratingModel');
const { difficultyForRating } = require('../services/difficultyService');

const router = express.Router();

const DEFAULT_RATING = 1200;

// A random published problem the user has NOT solved yet, optionally at one difficulty.
async function findUnsolved(userId, difficulty) {
  const values = [userId];
  let difficultyClause = '';
  if (difficulty) {
    values.push(difficulty);
    difficultyClause = `AND p.difficulty = $${values.length}`;
  }

  const result = await pool.query(
    `SELECT p.id, p.title, p.slug, p.difficulty
     FROM problems p
     WHERE p.is_published = true
       ${difficultyClause}
       AND NOT EXISTS (
         SELECT 1 FROM submissions s
         WHERE s.user_id = $1 AND s.problem_id = p.id AND s.verdict = 'accepted'
       )
     ORDER BY RANDOM()
     LIMIT 1`,
    values
  );
  return result.rows[0];
}

// GET /api/problems/recommended
router.get('/', authMiddleware, async (req, res) => {
  try {
    const ratings = await getUserRatings(req.userId);
    const highestRating = ratings.length
      ? Math.max(...ratings.map((r) => r.rating))
      : DEFAULT_RATING;
    const targetDifficulty = difficultyForRating(highestRating);

    let problem = await findUnsolved(req.userId, targetDifficulty);
    if (!problem) problem = await findUnsolved(req.userId, null);

    res.json({
      basedOn: { highestRating, targetDifficulty },
      problem: problem || null,
      message: problem ? undefined : "You've solved every published problem!",
    });
  } catch (err) {
    console.error('Recommended problem error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;