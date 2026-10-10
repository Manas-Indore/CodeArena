require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');

const pool = require('./src/config/db');
require('./src/config/redis');

const authRoutes = require('./src/routes/authRoutes');
const problemRoutes = require('./src/routes/problemRoutes');
const recommendedRoutes = require('./src/routes/recommendedRoutes');
const submissionRoutes = require('./src/routes/submissionRoutes');
const matchRoutes = require('./src/routes/matchRoutes');
const ratingRoutes = require('./src/routes/ratingRoutes');
const friendRoutes = require('./src/routes/friendRoutes');
const profileRoutes = require('./src/routes/profileRoutes');
const dailyRoutes = require('./src/routes/dailyRoutes');

const setupSocket = require('./src/config/socket');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'codearena-backend' });
});

app.get('/api/health/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ dbTime: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/problems/recommended', recommendedRoutes); // must come before /api/problems
app.use('/api/problems', problemRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/users', profileRoutes);
app.use('/api/daily', dailyRoutes);

const httpServer = http.createServer(app);
setupSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Server (HTTP + WebSocket) running on port ${PORT}`);
});