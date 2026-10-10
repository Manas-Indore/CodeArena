const { validationResult } = require('express-validator');
const pool = require('../config/db');
const {
  getOrCreateTodayChallenge,
  setChallenge,
  getStreakInfo,
} = require('../models/dailyModel');

// GET /api/daily/today
async function today(req, res) {
  try {
    const challenge = await getOrCreateTodayChallenge();
    if (!challenge) {
      return res.status(404).json({ error: 'No published problems available for a daily challenge' });
    }

    const streak = await getStreakInfo(req.userId);

    res.json({
      date: challenge.challenge_date,
      problem: {
        title: challenge.title,
        slug: challenge.slug,
        difficulty: challenge.difficulty,
        description: challenge.description,
        timeLimitMs: challenge.time_limit_ms,
      },
      completedToday: streak.completedToday,
      streak: { current: streak.current, longest: streak.longest },
    });
  } catch (err) {
    console.error('Daily today error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/daily/streak
async function streak(req, res) {
  try {
    const info = await getStreakInfo(req.userId);
    res.json({ streak: info });
  } catch (err) {
    console.error('Daily streak error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/daily  (admin only) — set which problem is the daily challenge for a date
async function setDaily(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { problemSlug, date } = req.body;

  try {
    const problemResult = await pool.query(
      `SELECT id FROM problems WHERE slug = $1 AND is_published = true`,
      [problemSlug]
    );
    if (!problemResult.rows[0]) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    const result = await setChallenge(date, problemResult.rows[0].id);
    if (result.conflict) {
      return res.status(409).json({
        error: 'That day already has completions, so its challenge can no longer be changed',
      });
    }

    res.json({ date: result.date, problemSlug });
  } catch (err) {
    console.error('Set daily challenge error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { today, streak, setDaily };