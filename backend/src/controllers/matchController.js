const { validationResult } = require('express-validator');
const pool = require('../config/db');
const { createMatch, listWaitingMatches } = require('../models/matchModel');

// Picks a problem id: an explicit slug wins; otherwise a random published
// problem, optionally filtered by difficulty.
async function pickProblemId({ problemSlug, difficulty }) {
  if (problemSlug) {
    const result = await pool.query(
      `SELECT id FROM problems WHERE slug = $1 AND is_published = true`,
      [problemSlug]
    );
    if (!result.rows[0]) {
      const err = new Error('Problem not found');
      err.status = 404;
      throw err;
    }
    return result.rows[0].id;
  }

  const values = [];
  let whereClause = 'WHERE is_published = true';
  if (difficulty) {
    values.push(difficulty);
    whereClause += ` AND difficulty = $${values.length}`;
  }

  const result = await pool.query(
    `SELECT id FROM problems ${whereClause} ORDER BY RANDOM() LIMIT 1`,
    values
  );
  if (!result.rows[0]) {
    const err = new Error('No published problems available for this selection');
    err.status = 400;
    throw err;
  }
  return result.rows[0].id;
}

// POST /api/matches/open-battles
async function createOpenBattle(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { problemSlug, maxPlayers, difficulty } = req.body;

  try {
    const problemId = await pickProblemId({ problemSlug, difficulty });

    const match = await createMatch({
      mode: 'open_battle',
      problemId,
      maxPlayers: maxPlayers || 2,
      minRating: null,
    });

    res.status(201).json({ match });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Create open battle error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/matches/open-battles
async function listOpenBattles(req, res) {
  try {
    const matches = await listWaitingMatches('open_battle');
    res.json({ matches });
  } catch (err) {
    console.error('List open battles error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/matches/group-battles
async function createGroupBattle(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { problemSlug, maxPlayers, minRating, difficulty } = req.body;

  try {
    const problemId = await pickProblemId({ problemSlug, difficulty });

    const match = await createMatch({
      mode: 'group_battle',
      problemId,
      maxPlayers: maxPlayers || 4,
      minRating: minRating ?? null,
    });

    res.status(201).json({ match });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Create group battle error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/matches/group-battles
async function listGroupBattles(req, res) {
  try {
    const matches = await listWaitingMatches('group_battle');
    res.json({ matches });
  } catch (err) {
    console.error('List group battles error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { createOpenBattle, listOpenBattles, createGroupBattle, listGroupBattles };