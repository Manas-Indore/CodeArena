const { validationResult } = require('express-validator');
const pool = require('../config/db');
const { createMatch, listWaitingMatches } = require('../models/matchModel');
const { getProblemById } = require('../models/problemModel');
const { getUserRating } = require('../services/matchmakingService');
const { randomProblemId, pickProblemIdByRating } = require('../services/difficultyService');

// Priority: explicit slug > explicit difficulty > rating-scaled (if ratingForAuto given) > random.
async function pickProblemId({ problemSlug, difficulty, ratingForAuto }) {
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

  let problemId;
  if (difficulty) {
    problemId = await randomProblemId(difficulty);
  } else if (ratingForAuto !== undefined && ratingForAuto !== null) {
    const result = await pickProblemIdByRating(ratingForAuto);
    problemId = result.problemId;
  } else {
    problemId = await randomProblemId(null);
  }

  if (!problemId) {
    const err = new Error('No published problems available for this selection');
    err.status = 400;
    throw err;
  }
  return problemId;
}

// Attaches the chosen problem's basic info so the creator can see what was picked.
async function withProblemInfo(match) {
  const problem = await getProblemById(match.problem_id);
  return {
    match,
    problem: problem
      ? { title: problem.title, slug: problem.slug, difficulty: problem.difficulty }
      : null,
  };
}

// POST /api/matches/open-battles   (casual — random unless slug/difficulty given)
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

    res.status(201).json(await withProblemInfo(match));
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
// No slug/difficulty -> scaled by minRating, or the creator's group_battle rating.
async function createGroupBattle(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { problemSlug, maxPlayers, minRating, difficulty } = req.body;

  try {
    const ratingForAuto = minRating ?? (await getUserRating(req.userId, 'group_battle'));
    const problemId = await pickProblemId({ problemSlug, difficulty, ratingForAuto });

    const match = await createMatch({
      mode: 'group_battle',
      problemId,
      maxPlayers: maxPlayers || 4,
      minRating: minRating ?? null,
    });

    res.status(201).json(await withProblemInfo(match));
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