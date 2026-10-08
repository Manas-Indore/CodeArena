const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const IORedis = require('ioredis');

const pool = require('../config/db');
const { MATCH_EVENTS_CHANNEL } = require('./redisPubSub');
const {
  createMatch,
  addParticipant,
  countParticipants,
  getMatchById,
  listParticipants,
  startMatch,
} = require('../models/matchModel');
const { getProblemById } = require('../models/problemModel');
const { areFriends } = require('../models/friendModel');
const {
  findOrQueue,
  removeFromQueueKey,
  createMatchForPair,
  getUserRating,
  queueKey,
  VALID_DIFFICULTIES,
} = require('../services/matchmakingService');

const MATCHMAKING_MODES = ['speed_coding', 'debug_duel'];
const CHALLENGE_MODES = ['speed_coding', 'debug_duel'];

function findSocketByUserId(io, userId) {
  for (const [, s] of io.sockets.sockets) {
    if (s.userId === userId) return s;
  }
  return null;
}

function setupSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token provided'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: user ${socket.userId}`);

    // ---------------- Open/Group Battle lobby ----------------

    socket.on('join_lobby', async ({ matchId }) => {
      try {
        const match = await getMatchById(matchId);
        if (!match) {
          return socket.emit('error_message', { error: 'Match not found' });
        }
        if (match.status !== 'waiting') {
          return socket.emit('error_message', { error: 'Match already started or finished' });
        }

        if (match.min_rating !== null) {
          const rating = await getUserRating(socket.userId, match.mode);
          if (rating < match.min_rating) {
            return socket.emit('error_message', {
              error: `Rating too low to join. Need at least ${match.min_rating} (yours: ${rating})`,
            });
          }
        }

        const currentCount = await countParticipants(matchId);
        if (currentCount >= match.max_players) {
          return socket.emit('error_message', { error: 'Match is full' });
        }

        await addParticipant(matchId, socket.userId);
        socket.join(`match:${matchId}`);
        socket.matchId = matchId;

        const participants = await listParticipants(matchId);
        io.to(`match:${matchId}`).emit('lobby_update', {
          matchId,
          players: participants,
          maxPlayers: match.max_players,
        });

        if (participants.length >= match.max_players) {
          const updatedMatch = await startMatch(matchId);
          const problem = await getProblemById(updatedMatch.problem_id);

          io.to(`match:${matchId}`).emit('match_started', {
            matchId,
            mode: updatedMatch.mode,
            problem: {
              title: problem.title,
              slug: problem.slug,
              description: problem.description,
              difficulty: problem.difficulty,
              timeLimitMs: problem.time_limit_ms,
            },
            startedAt: updatedMatch.started_at,
          });
        }
      } catch (err) {
        console.error('join_lobby error:', err);
        socket.emit('error_message', { error: 'Failed to join lobby' });
      }
    });

    // ---------------- 1v1 Matchmaking ----------------

    socket.on('find_match', async ({ mode, difficulty }) => {
      if (!MATCHMAKING_MODES.includes(mode)) {
        return socket.emit('error_message', { error: `Invalid mode. Must be one of: ${MATCHMAKING_MODES.join(', ')}` });
      }
      if (difficulty && !VALID_DIFFICULTIES.includes(difficulty)) {
        return socket.emit('error_message', { error: 'Invalid difficulty. Must be easy, medium, or hard' });
      }

      try {
        const result = await findOrQueue(socket.userId, mode, difficulty);

        if (!result.matched) {
          socket.matchmakingQueueKey = result.queueKey;
          socket.emit('queued', {
            mode,
            difficulty: difficulty || 'any',
            message: 'Searching for an opponent...',
          });
          return;
        }

        const { match, problem } = await createMatchForPair(mode, socket.userId, result.opponentUserId, difficulty);

        socket.join(`match:${match.id}`);
        socket.matchId = match.id;
        socket.matchmakingQueueKey = null;

        const opponentSocket = findSocketByUserId(io, result.opponentUserId);
        if (opponentSocket) {
          opponentSocket.join(`match:${match.id}`);
          opponentSocket.matchId = match.id;
          opponentSocket.matchmakingQueueKey = null;
        }

        io.to(`match:${match.id}`).emit('match_started', {
          matchId: match.id,
          mode: match.mode,
          problem: {
            title: problem.title,
            slug: problem.slug,
            description: problem.description,
            difficulty: problem.difficulty,
            timeLimitMs: problem.time_limit_ms,
          },
          startedAt: match.started_at,
        });
      } catch (err) {
        console.error('find_match error:', err);
        socket.emit('error_message', { error: err.message || 'Matchmaking failed' });
      }
    });

    socket.on('cancel_matchmaking', async ({ mode, difficulty }) => {
      try {
        await removeFromQueueKey(queueKey(mode, difficulty), socket.userId);
        socket.matchmakingQueueKey = null;
        socket.emit('matchmaking_cancelled', { mode, difficulty: difficulty || 'any' });
      } catch (err) {
        console.error('cancel_matchmaking error:', err);
      }
    });

    // ---------------- Challenge a Friend ----------------

    socket.on('challenge_friend', async ({ friendUserId, mode, difficulty }) => {
      try {
        if (!CHALLENGE_MODES.includes(mode)) {
          return socket.emit('error_message', { error: `Invalid challenge mode. Must be one of: ${CHALLENGE_MODES.join(', ')}` });
        }
        if (difficulty && !VALID_DIFFICULTIES.includes(difficulty)) {
          return socket.emit('error_message', { error: 'Invalid difficulty. Must be easy, medium, or hard' });
        }

        const friends = await areFriends(socket.userId, friendUserId);
        if (!friends) {
          return socket.emit('error_message', { error: 'You can only challenge friends' });
        }

        const values = [];
        let whereClause = 'WHERE is_published = true';
        if (difficulty) {
          values.push(difficulty);
          whereClause += ` AND difficulty = $${values.length}`;
        }

        const problemResult = await pool.query(
          `SELECT id FROM problems ${whereClause} ORDER BY RANDOM() LIMIT 1`,
          values
        );
        if (!problemResult.rows[0]) {
          return socket.emit('error_message', { error: 'No published problems available for this difficulty' });
        }

        const match = await createMatch({
          mode,
          problemId: problemResult.rows[0].id,
          maxPlayers: 2,
          minRating: null,
        });

        await addParticipant(match.id, socket.userId);
        socket.join(`match:${match.id}`);
        socket.matchId = match.id;

        const friendSocket = findSocketByUserId(io, friendUserId);
        if (!friendSocket) {
          return socket.emit('error_message', { error: 'Friend is not online right now' });
        }

        friendSocket.emit('challenge_received', {
          matchId: match.id,
          mode,
          difficulty: difficulty || 'any',
          fromUserId: socket.userId,
        });

        socket.emit('challenge_sent', {
          matchId: match.id,
          mode,
          difficulty: difficulty || 'any',
          toUserId: friendUserId,
        });
      } catch (err) {
        console.error('challenge_friend error:', err);
        socket.emit('error_message', { error: 'Failed to send challenge' });
      }
    });

    // ---------------- Disconnect cleanup ----------------

    socket.on('disconnect', async () => {
      console.log(`Socket disconnected: user ${socket.userId}`);
      try {
        if (socket.matchmakingQueueKey) {
          await removeFromQueueKey(socket.matchmakingQueueKey, socket.userId);
        }
      } catch (err) {
        console.error('Error cleaning up queue on disconnect:', err);
      }
    });
  });

  const subscriber = new IORedis(process.env.REDIS_URL);
  subscriber.subscribe(MATCH_EVENTS_CHANNEL);

  subscriber.on('message', (channel, message) => {
    if (channel !== MATCH_EVENTS_CHANNEL) return;
    try {
      const event = JSON.parse(message);
      io.to(`match:${event.matchId}`).emit(event.type, event.payload);
    } catch (err) {
      console.error('Failed to process match event:', err);
    }
  });

  return io;
}

module.exports = setupSocket;