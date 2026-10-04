const { validationResult } = require('express-validator');
const pool = require('../config/db');
const {
  createSubmission,
  getSubmissionById,
  listSubmissionsByUser,
} = require('../models/submissionModel');
const { getAllTestCasesByProblemId } = require('../models/problemModel');
const { LANGUAGE_CONFIG } = require('../services/judgeService');
const { submissionQueue } = require('../config/queue');

// POST /api/submissions
// Creates a pending submission, enqueues a judge job, returns immediately.
async function submit(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { problemSlug, language, code } = req.body;

  if (!LANGUAGE_CONFIG[language]) {
    return res.status(400).json({
      error: `Unsupported language: ${language}. Supported: ${Object.keys(LANGUAGE_CONFIG).join(', ')}`,
    });
  }

  try {
    const problemResult = await pool.query(
      `SELECT id FROM problems WHERE slug = $1 AND is_published = true`,
      [problemSlug]
    );
    const problem = problemResult.rows[0];
    if (!problem) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    const testCases = await getAllTestCasesByProblemId(problem.id);
    if (testCases.length === 0) {
      return res.status(400).json({ error: 'This problem has no test cases yet' });
    }

    const submission = await createSubmission({
      userId: req.userId,
      problemId: problem.id,
      matchId: null,
      language,
      code,
    });

    // Enqueue — worker.js picks this up, runs the judge, updates the DB
    await submissionQueue.add('judge', { submissionId: submission.id });

    res.status(202).json({
      submission: {
        id: submission.id,
        verdict: submission.verdict, // 'pending'
        createdAt: submission.created_at,
      },
      message: 'Submission queued. Poll GET /api/submissions/:id for the result.',
    });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/submissions/:id
async function getOne(req, res) {
  const { id } = req.params;
  try {
    const submission = await getSubmissionById(id);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    if (submission.user_id !== req.userId) {
      return res.status(403).json({ error: 'Not your submission' });
    }
    res.json({ submission });
  } catch (err) {
    console.error('Get submission error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/submissions/history
async function history(req, res) {
  const { problemId, page, limit } = req.query;
  try {
    const submissions = await listSubmissionsByUser(req.userId, {
      problemId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    res.json({ submissions });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { submit, getOne, history };