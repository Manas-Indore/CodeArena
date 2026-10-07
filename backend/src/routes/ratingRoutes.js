const express = require('express');
const { getMyRatings, leaderboard } = require('../controllers/ratingController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/me', authMiddleware, getMyRatings);
router.get('/leaderboard', authMiddleware, leaderboard);

module.exports = router;