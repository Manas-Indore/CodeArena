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

function setupSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  // Every socket connection must present a valid JWT (sent via `auth.token` on connect)
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

        // Auto-start the match once the lobby is full
        if (participants.length >= match.max_players) {
          const updatedMatch = await startMatch(matchId);
          const problem = await getProblemById(updatedMatch.problem_id);

          io.to(`match:${matchId}`).emit('match_started', {
            matchId,
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

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: user ${socket.userId}`);
    });
  });

  // Subscribe to Redis — this is how worker.js (a separate process) gets its
  // judging results broadcast to the right Socket.IO room on this server.
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