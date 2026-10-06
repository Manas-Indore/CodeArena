const { validationResult } = require('express-validator');
const pool = require('../config/db');
const { createMatch, listWaitingMatches } = require('../models/matchModel');

// POST /api/matches/open-battles
async function createOpenBattle(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { problemSlug, maxPlayers } = req.body;

  try {
    let problemId;

    if (problemSlug) {
      const result = await pool.query(
        `SELECT id FROM problems WHERE slug = $1 AND is_published = true`,
        [problemSlug]
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'Problem not found' });
      problemId = result.rows[0].id;
    } else {
      const result = await pool.query(
        `SELECT id FROM problems WHERE is_published = true ORDER BY RANDOM() LIMIT 1`
      );
      if (!result.rows[0]) return res.status(400).json({ error: 'No published problems available' });
      problemId = result.rows[0].id;
    }

    const match = await createMatch({
      mode: 'open_battle',
      problemId,
      maxPlayers: maxPlayers || 2,
      minRating: null,
    });

    res.status(201).json({ match });
  } catch (err) {
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

  const { problemSlug, maxPlayers, minRating } = req.body;

  try {
    let problemId;

    if (problemSlug) {
      const result = await pool.query(
        `SELECT id FROM problems WHERE slug = $1 AND is_published = true`,
        [problemSlug]
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'Problem not found' });
      problemId = result.rows[0].id;
    } else {
      const result = await pool.query(
        `SELECT id FROM problems WHERE is_published = true ORDER BY RANDOM() LIMIT 1`
      );
      if (!result.rows[0]) return res.status(400).json({ error: 'No published problems available' });
      problemId = result.rows[0].id;
    }

    const match = await createMatch({
      mode: 'group_battle',
      problemId,
      maxPlayers: maxPlayers || 4,
      minRating: minRating ?? null,
    });

    res.status(201).json({ match });
  } catch (err) {
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