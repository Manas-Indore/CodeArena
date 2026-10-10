const IORedis = require('ioredis');
const pool = require('../config/db');
const { createMatch, addParticipant, startMatch } = require('../models/matchModel');
const { getProblemById } = require('../models/problemModel');
const { randomProblemId, pickProblemIdByRating } = require('./difficultyService');

const redis = new IORedis(process.env.REDIS_URL);

const RATING_WINDOW = 200;
const DEFAULT_RATING = 1200;
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

// No difficulty chosen = "auto" (scaled by rating), stored under the 'any' key.
function queueKey(mode, difficulty) {
  const diffPart = difficulty && VALID_DIFFICULTIES.includes(difficulty) ? difficulty : 'any';
  return `matchmaking:queue:${mode}:${diffPart}`;
}

async function getUserRating(userId, mode) {
  const result = await pool.query(
    `SELECT rating FROM ratings WHERE user_id = $1 AND mode = $2`,
    [userId, mode]
  );
  return result.rows[0]?.rating ?? DEFAULT_RATING;
}

// Tries to pair `userId` with someone already waiting in this mode+difficulty queue.
async function findOrQueue(userId, mode, difficulty) {
  const rating = await getUserRating(userId, mode);
  const key = queueKey(mode, difficulty);

  const candidates = await redis.zrangebyscore(
    key,
    rating - RATING_WINDOW,
    rating + RATING_WINDOW,
    'WITHSCORES'
  );

  let opponentId = null;
  for (let i = 0; i < candidates.length; i += 2) {
    if (candidates[i] !== userId) {
      opponentId = candidates[i];
      break;
    }
  }

  if (opponentId) {
    const removed = await redis.zrem(key, opponentId);
    if (removed === 1) {
      return { matched: true, opponentUserId: opponentId };
    }
  }

  await redis.zadd(key, rating, userId);
  return { matched: false, queueKey: key };
}

async function removeFromQueueKey(key, userId) {
  await redis.zrem(key, userId);
}

// Explicit difficulty -> use it. Otherwise scale by the pair's average rating.
async function createMatchForPair(mode, userIdA, userIdB, difficulty) {
  let problemId;

  if (difficulty && VALID_DIFFICULTIES.includes(difficulty)) {
    problemId = await randomProblemId(difficulty);
  } else {
    const [ratingA, ratingB] = await Promise.all([
      getUserRating(userIdA, mode),
      getUserRating(userIdB, mode),
    ]);
    const result = await pickProblemIdByRating((ratingA + ratingB) / 2);
    problemId = result.problemId;
  }

  if (!problemId) {
    throw new Error('No published problems available for this selection');
  }

  const match = await createMatch({
    mode,
    problemId,
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
  removeFromQueueKey,
  createMatchForPair,
  getUserRating,
  queueKey,
  VALID_DIFFICULTIES,
};