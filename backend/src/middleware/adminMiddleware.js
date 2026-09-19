const { findUserById } = require('../models/userModel');

// Must run AFTER authMiddleware (needs req.userId already set)
async function adminMiddleware(req, res, next) {
  try {
    const user = await findUserById(req.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (err) {
    console.error('Admin check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = adminMiddleware;