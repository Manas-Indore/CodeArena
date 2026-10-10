const pool = require('../config/db');
const { computeStreaks } = require('../utils/streak');

const TZ = process.env.DAILY_CHALLENGE_TZ || 'Asia/Kolkata';

// Today's date as 'YYYY-MM-DD' in the configured timezone
async function getTodayString() {
  const result = await pool.query(
    `SELECT to_char((NOW() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS today`,
    [TZ]
  );
  return result.rows[0].today;
}

async function getChallengeByDate(dateStr) {
  const result = await pool.query(
    `SELECT to_char(dc.challenge_date, 'YYYY-MM-DD') AS challenge_date,
            p.id AS problem_id, p.title, p.slug, p.difficulty, p.description,
            p.time_limit_ms, p.memory_limit_mb
     FROM daily_challenges dc
     JOIN problems p ON p.id = dc.problem_id
     WHERE dc.challenge_date = $1`,
    [dateStr]
  );
  return result.rows[0];
}

// Returns today's challenge, creating it on first request of the day.
// Prefers a problem that hasn't been a daily challenge in the last 5 days.
async function getOrCreateTodayChallenge() {
  const today = await getTodayString();

  const existing = await getChallengeByDate(today);
  if (existing) return existing;

  let pick = await pool.query(
    `SELECT id FROM problems
     WHERE is_published = true
       AND id NOT IN (SELECT problem_id FROM daily_challenges ORDER BY challenge_date DESC LIMIT 5)
     ORDER BY RANDOM() LIMIT 1`
  );
  if (!pick.rows[0]) {
    pick = await pool.query(
      `SELECT id FROM problems WHERE is_published = true ORDER BY RANDOM() LIMIT 1`
    );
  }
  if (!pick.rows[0]) return null;

  // ON CONFLICT handles two users hitting this at the exact same moment
  await pool.query(
    `INSERT INTO daily_challenges (challenge_date, problem_id)
     VALUES ($1, $2)
     ON CONFLICT (challenge_date) DO NOTHING`,
    [today, pick.rows[0].id]
  );

  return getChallengeByDate(today);
}

// Admin override. Refuses if anyone has already completed that day.
async function setChallenge(dateStr, problemId) {
  const date = dateStr || (await getTodayString());

  const completions = await pool.query(
    `SELECT 1 FROM daily_challenge_completions WHERE challenge_date = $1 LIMIT 1`,
    [date]
  );
  if (completions.rowCount > 0) return { conflict: true };

  await pool.query(
    `INSERT INTO daily_challenges (challenge_date, problem_id)
     VALUES ($1, $2)
     ON CONFLICT (challenge_date) DO UPDATE SET problem_id = EXCLUDED.problem_id`,
    [date, problemId]
  );
  return { date };
}

async function getCompletionDates(userId) {
  const result = await pool.query(
    `SELECT to_char(challenge_date, 'YYYY-MM-DD') AS d
     FROM daily_challenge_completions
     WHERE user_id = $1
     ORDER BY challenge_date DESC`,
    [userId]
  );
  return result.rows.map((r) => r.d);
}

async function getStreakInfo(userId) {
  const [today, dates] = await Promise.all([getTodayString(), getCompletionDates(userId)]);
  const streaks = computeStreaks(dates, today);
  return {
    ...streaks,
    totalCompleted: dates.length,
    recentDates: dates.slice(0, 30),
  };
}

// Called by the worker after an ACCEPTED verdict. If the problem was the daily
// challenge on the day the submission was made, records the completion.
// Returns the new row, or null if not eligible / already completed that day.
async function recordCompletionIfEligible(userId, problemId, submissionId) {
  const result = await pool.query(
    `INSERT INTO daily_challenge_completions (user_id, challenge_date, submission_id)
     SELECT $1::uuid, dc.challenge_date, $3::uuid
     FROM daily_challenges dc
     WHERE dc.problem_id = $2::uuid
       AND dc.challenge_date = (
         SELECT (created_at AT TIME ZONE $4::text)::date FROM submissions WHERE id = $3::uuid
       )
     ON CONFLICT (user_id, challenge_date) DO NOTHING
     RETURNING to_char(challenge_date, 'YYYY-MM-DD') AS challenge_date`,
    [userId, problemId, submissionId, TZ]
  );
  return result.rows[0] || null;
}

module.exports = {
  getTodayString,
  getOrCreateTodayChallenge,
  setChallenge,
  getStreakInfo,
  recordCompletionIfEligible,
};