const IORedis = require('ioredis');
const pool = require('../config/db');
const { createMatch, addParticipant, startMatch } = require('../models/matchModel');
const { getProblemById } = require('../models/problemModel');

const redis = new IORedis(process.env.REDIS_URL);

const RATING_WINDOW = 200;
const DEFAULT_RATING = 1200;
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

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

// Picks a random published problem, optionally filtered by difficulty.
async function createMatchForPair(mode, userIdA, userIdB, difficulty) {
  const values = [];
  let whereClause = 'WHERE is_published = true';
  if (difficulty && VALID_DIFFICULTIES.includes(difficulty)) {
    values.push(difficulty);
    whereClause += ` AND difficulty = $${values.length}`;
  }

  const problemResult = await pool.query(
    `SELECT id FROM problems ${whereClause} ORDER BY RANDOM() LIMIT 1`,
    values
  );
  if (!problemResult.rows[0]) {
    throw new Error('No published problems available for this difficulty');
  }

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
  removeFromQueueKey,
  createMatchForPair,
  getUserRating,
  queueKey,
  VALID_DIFFICULTIES,
};