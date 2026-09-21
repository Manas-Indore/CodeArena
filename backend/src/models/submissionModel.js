const pool = require('../config/db');

async function createSubmission({ userId, problemId, matchId, language, code }) {
  const result = await pool.query(
    `INSERT INTO submissions (user_id, problem_id, match_id, language, code, verdict)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING id, user_id, problem_id, match_id, language, verdict, created_at`,
    [userId, problemId, matchId || null, language, code]
  );
  return result.rows[0];
}

async function updateSubmissionResult(submissionId, { verdict, runtimeMs, memoryKb, testsPassed, testsTotal }) {
  const result = await pool.query(
    `UPDATE submissions
     SET verdict = $1, runtime_ms = $2, memory_kb = $3, tests_passed = $4, tests_total = $5
     WHERE id = $6
     RETURNING *`,
    [verdict, runtimeMs, memoryKb, testsPassed, testsTotal, submissionId]
  );
  return result.rows[0];
}

async function getSubmissionById(id) {
  const result = await pool.query(`SELECT * FROM submissions WHERE id = $1`, [id]);
  return result.rows[0];
}

async function listSubmissionsByUser(userId, { problemId, page = 1, limit = 20 }) {
  const values = [userId];
  let whereClause = 'WHERE user_id = $1';

  if (problemId) {
    values.push(problemId);
    whereClause += ` AND problem_id = $${values.length}`;
  }

  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await pool.query(
    `SELECT id, problem_id, language, verdict, runtime_ms, tests_passed, tests_total, created_at
     FROM submissions
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return result.rows;
}

module.exports = { createSubmission, updateSubmissionResult, getSubmissionById, listSubmissionsByUser };