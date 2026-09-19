const { validationResult } = require('express-validator');
const {
  createProblem,
  listProblems,
  getProblemBySlug,
} = require('../models/problemModel');

// POST /api/problems  (admin only)
async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    title,
    description,
    difficulty,
    timeLimitMs,
    memoryLimitMb,
    testCases,
  } = req.body;

  try {
    const problem = await createProblem({
      title,
      description,
      difficulty,
      timeLimitMs: timeLimitMs || 2000,
      memoryLimitMb: memoryLimitMb || 256,
      createdBy: req.userId,
      testCases,
    });

    res.status(201).json({ problem });
  } catch (err) {
    console.error('Create problem error:', err);
    if (err.code === '23505') {
      // unique constraint violation (duplicate slug/title)
      return res.status(409).json({ error: 'A problem with this title already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/problems
async function list(req, res) {
  const { difficulty, page, limit } = req.query;

  try {
    const problems = await listProblems({
      difficulty,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });

    res.json({ problems });
  } catch (err) {
    console.error('List problems error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/problems/:slug
async function getOne(req, res) {
  const { slug } = req.params;

  try {
    const problem = await getProblemBySlug(slug);

    if (!problem) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    res.json({ problem });
  } catch (err) {
    console.error('Get problem error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { create, list, getOne };