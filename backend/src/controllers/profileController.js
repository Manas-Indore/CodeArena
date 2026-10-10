const {
  getPublicUserByUsername,
  getPracticeStats,
  getRecentMatches,
  getHeadToHead,
} = require('../models/profileModel');
const { getUserRatings } = require('../models/ratingModel');
const { findUserByUsername } = require('../models/userModel');
const { getStreakInfo } = require('../models/dailyModel');

// GET /api/users/:username/profile  (public — no auth required)
async function getProfile(req, res) {
  const { username } = req.params;

  try {
    const user = await getPublicUserByUsername(username);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [ratings, stats, recentMatches, streak] = await Promise.all([
      getUserRatings(user.id),
      getPracticeStats(user.id),
      getRecentMatches(user.id, 10),
      getStreakInfo(user.id),
    ]);

    res.json({
      user,
      ratings,
      practiceStats: {
        problemsSolved: parseInt(stats.problems_solved, 10) || 0,
        totalSubmissions: parseInt(stats.total_submissions, 10) || 0,
      },
      dailyStreak: {
        current: streak.current,
        longest: streak.longest,
        totalCompleted: streak.totalCompleted,
        completedToday: streak.completedToday,
        recentDates: streak.recentDates, // last 30 completed days, handy for a calendar later
      },
      recentMatches,
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/users/:username/head-to-head  (protected — compares req.userId vs this user)
async function headToHead(req, res) {
  const { username } = req.params;

  try {
    const targetUser = await findUserByUsername(username);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    if (targetUser.id === req.userId) {
      return res.status(400).json({ error: "Can't compare head-to-head with yourself" });
    }

    const records = await getHeadToHead(req.userId, targetUser.id);
    res.json({ opponent: targetUser.username, records });
  } catch (err) {
    console.error('Head-to-head error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getProfile, headToHead };