const { validationResult } = require('express-validator');
const pool = require('../config/db');
const {
  createSubmission,
  updateSubmissionResult,
  getSubmissionById,
  listSubmissionsByUser,
} = require('../models/submissionModel');
const { getAllTestCasesByProblemId } = require('../models/problemModel');
const { runJavaSubmission } = require('../services/judgeService');

// POST /api/submissions
async function submit(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { problemSlug, language, code } = req.body;

  if (language !== 'java') {
    return res.status(400).json({ error: 'Only Java is supported right now' });
  }

  try {
    const problemResult = await pool.query(
      `SELECT id, time_limit_ms, memory_limit_mb FROM problems WHERE slug = $1 AND is_published = true`,
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

    const judgeResult = await runJavaSubmission({
      code,
      testCases,
      timeLimitMs: problem.time_limit_ms,
      memoryLimitMb: problem.memory_limit_mb,
    });

    const updated = await updateSubmissionResult(submission.id, {
      verdict: judgeResult.verdict,
      runtimeMs: judgeResult.runtimeMs,
      memoryKb: judgeResult.memoryKb,
      testsPassed: judgeResult.testsPassed,
      testsTotal: judgeResult.testsTotal,
    });

    res.status(201).json({
      submission: {
        id: updated.id,
        verdict: updated.verdict,
        testsPassed: updated.tests_passed,
        testsTotal: updated.tests_total,
        runtimeMs: updated.runtime_ms,
        createdAt: updated.created_at,
      },
      errorOutput: judgeResult.errorOutput || undefined,
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