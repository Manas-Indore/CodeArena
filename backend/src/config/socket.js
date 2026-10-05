const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const IORedis = require('ioredis');

const { MATCH_EVENTS_CHANNEL } = require('./redisPubSub');
const {
  addParticipant,
  countParticipants,
  getMatchById,
  listParticipants,
  startMatch,
} = require('../models/matchModel');
const { getProblemById } = require('../models/problemModel');
const {
  findOrQueue,
  removeFromQueue,
  removeFromAllQueues,
  createMatchForPair,
} = require('../services/matchmakingService');

const MATCHMAKING_MODES = ['speed_coding', 'debug_duel'];

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

    // ---------------- Open Battle lobby (Day 8) ----------------

    socket.on('join_lobby', async ({ matchId }) => {
      try {
        const match = await getMatchById(matchId);
        if (!match) {
          return socket.emit('error_message', { error: 'Match not found' });
        }
        if (match.status !== 'waiting') {
          return socket.emit('error_message', { error: 'Match already started or finished' });
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

    // ---------------- 1v1 Matchmaking (Day 9) ----------------

    socket.on('find_match', async ({ mode }) => {
      if (!MATCHMAKING_MODES.includes(mode)) {
        return socket.emit('error_message', { error: `Invalid mode. Must be one of: ${MATCHMAKING_MODES.join(', ')}` });
      }

      try {
        const result = await findOrQueue(socket.userId, mode);

        if (!result.matched) {
          socket.matchmakingMode = mode;
          socket.emit('queued', { mode, message: 'Searching for an opponent...' });
          return;
        }

        // Paired! Create the match and put both sockets in the room.
        const { match, problem } = await createMatchForPair(mode, socket.userId, result.opponentUserId);

        socket.join(`match:${match.id}`);
        socket.matchId = match.id;
        socket.matchmakingMode = null;

        const opponentSocket = findSocketByUserId(io, result.opponentUserId);
        if (opponentSocket) {
          opponentSocket.join(`match:${match.id}`);
          opponentSocket.matchId = match.id;
          opponentSocket.matchmakingMode = null;
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
        socket.emit('error_message', { error: 'Matchmaking failed' });
      }
    });

    socket.on('cancel_matchmaking', async ({ mode }) => {
      try {
        await removeFromQueue(socket.userId, mode);
        socket.matchmakingMode = null;
        socket.emit('matchmaking_cancelled', { mode });
      } catch (err) {
        console.error('cancel_matchmaking error:', err);
      }
    });

    // ---------------- Disconnect cleanup ----------------

    socket.on('disconnect', async () => {
      console.log(`Socket disconnected: user ${socket.userId}`);
      try {
        await removeFromAllQueues(socket.userId);
      } catch (err) {
        console.error('Error cleaning up queues on disconnect:', err);
      }
    });
  });

  // Redis subscriber — worker.js publishes judging results here
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