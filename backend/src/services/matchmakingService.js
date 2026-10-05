const IORedis = require('ioredis');
const pool = require('../config/db');
const { createMatch, addParticipant, startMatch } = require('../models/matchModel');
const { getProblemById } = require('../models/problemModel');

const redis = new IORedis(process.env.REDIS_URL);

const RATING_WINDOW = 200; // pair players within +/- 200 rating points
const DEFAULT_RATING = 1200; // used until Day 10's Elo system populates real ratings

function queueKey(mode) {
  return `matchmaking:queue:${mode}`;
}

async function getUserRating(userId, mode) {
  const result = await pool.query(
    `SELECT rating FROM ratings WHERE user_id = $1 AND mode = $2`,
    [userId, mode]
  );
  return result.rows[0]?.rating ?? DEFAULT_RATING;
}

// Tries to pair `userId` with someone already waiting in this mode's queue.
// If no one suitable is waiting, adds `userId` to the queue instead.
// Returns { matched: true, opponentUserId } or { matched: false }.
async function findOrQueue(userId, mode) {
  const rating = await getUserRating(userId, mode);
  const key = queueKey(mode);

  const candidates = await redis.zrangebyscore(
    key,
    rating - RATING_WINDOW,
    rating + RATING_WINDOW,
    'WITHSCORES'
  );

  // candidates is flat: [userId1, score1, userId2, score2, ...]
  let opponentId = null;
  for (let i = 0; i < candidates.length; i += 2) {
    if (candidates[i] !== userId) {
      opponentId = candidates[i];
      break;
    }
  }

  if (opponentId) {
    // Atomically claim this opponent — ZREM returns 1 only if WE removed them.
    // If someone else grabbed them first (race), it returns 0 and we fall through to re-queue.
    const removed = await redis.zrem(key, opponentId);
    if (removed === 1) {
      return { matched: true, opponentUserId: opponentId };
    }
  }

  await redis.zadd(key, rating, userId);
  return { matched: false };
}

async function removeFromQueue(userId, mode) {
  await redis.zrem(queueKey(mode), userId);
}

async function removeFromAllQueues(userId) {
  await redis.zrem(queueKey('speed_coding'), userId);
  await redis.zrem(queueKey('debug_duel'), userId);
}

// Creates the actual match + both participants once a pair is found.
async function createMatchForPair(mode, userIdA, userIdB) {
  const problemResult = await pool.query(
    `SELECT id FROM problems WHERE is_published = true ORDER BY RANDOM() LIMIT 1`
  );
  if (!problemResult.rows[0]) throw new Error('No published problems available');

  const match = await createMatch({
    mode,
    problemId: problemResult.rows[0].id,
    maxPlayers: 2,
    minRating: null,
  });

  await addParticipant(match.id, userIdA);
  await addParticipant(match.id, userIdB);

  const started = await startMatch(match.id);
  const problem = await getProblemById(started.problem_id);

  return { match: started, problem };
}

module.exports = {
  findOrQueue,
  removeFromQueue,
  removeFromAllQueues,
  createMatchForPair,
  getUserRating,
};