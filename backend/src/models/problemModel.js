const pool = require('../config/db');

// Simple slug generator: "Two Sum" -> "two-sum"
function slugify(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Create a problem + its test cases in a single transaction
async function createProblem({
  title,
  description,
  difficulty,
  timeLimitMs,
  memoryLimitMb,
  createdBy,
  testCases, // [{ input, expectedOutput, isSample }]
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const slug = slugify(title);

    const problemResult = await client.query(
      `INSERT INTO problems
         (title, slug, description, difficulty, time_limit_ms, memory_limit_mb, created_by, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       RETURNING id, title, slug, description, difficulty, time_limit_ms, memory_limit_mb, created_at`,
      [title, slug, description, difficulty, timeLimitMs, memoryLimitMb, createdBy]
    );

    const problem = problemResult.rows[0];

    const insertedTestCases = [];
    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const tcResult = await client.query(
        `INSERT INTO test_cases (problem_id, input, expected_output, is_sample, order_index)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, input, expected_output, is_sample, order_index`,
        [problem.id, tc.input, tc.expectedOutput, tc.isSample || false, i]
      );
      insertedTestCases.push(tcResult.rows[0]);
    }

    await client.query('COMMIT');

    return { ...problem, test_cases: insertedTestCases };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// List published problems, optionally filtered by difficulty, with pagination
async function listProblems({ difficulty, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const values = [];
  let whereClause = 'WHERE is_published = true';

  if (difficulty) {
    values.push(difficulty);
    whereClause += ` AND difficulty = $${values.length}`;
  }

  values.push(limit, offset);

  const query = `
    SELECT id, title, slug, difficulty, created_at
    FROM problems
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const result = await pool.query(query, values);
  return result.rows;
}

// Get a single problem by slug, with only SAMPLE test cases attached
async function getProblemBySlug(slug) {
  const problemResult = await pool.query(
    `SELECT id, title, slug, description, difficulty, time_limit_ms, memory_limit_mb, created_at
     FROM problems
     WHERE slug = $1 AND is_published = true`,
    [slug]
  );

  const problem = problemResult.rows[0];
  if (!problem) return null;

  const testCasesResult = await pool.query(
    `SELECT id, input, expected_output, order_index
     FROM test_cases
     WHERE problem_id = $1 AND is_sample = true
     ORDER BY order_index ASC`,
    [problem.id]
  );

  return { ...problem, sample_test_cases: testCasesResult.rows };
}

// Get ALL test cases (sample + hidden) for a problem — used internally by the judge, not exposed via API
async function getAllTestCasesByProblemId(problemId) {
  const result = await pool.query(
    `SELECT id, input, expected_output, is_sample, order_index
     FROM test_cases
     WHERE problem_id = $1
     ORDER BY order_index ASC`,
    [problemId]
  );
  return result.rows;
}

module.exports = {
  createProblem,
  listProblems,
  getProblemBySlug,
  getAllTestCasesByProblemId,
  slugify,
};