const { validationResult } = require('express-validator');
const {
  findUserByUsername,
  findExistingFriendship,
  sendFriendRequest,
  getFriendshipById,
  acceptFriendship,
  deleteFriendship,
  listFriends,
  listIncomingRequests,
  removeFriend,
  getActivityFeed,
} = require('../models/friendModel');

// POST /api/friends/request
async function request(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username } = req.body;

  try {
    const addressee = await findUserByUsername(username);
    if (!addressee) return res.status(404).json({ error: 'User not found' });
    if (addressee.id === req.userId) return res.status(400).json({ error: "You can't friend yourself" });

    const existing = await findExistingFriendship(req.userId, addressee.id);
    if (existing) {
      if (existing.status === 'accepted') return res.status(409).json({ error: 'Already friends' });
      if (existing.status === 'pending') return res.status(409).json({ error: 'Friend request already pending' });
    }

    const friendship = await sendFriendRequest(req.userId, addressee.id);
    res.status(201).json({ friendship });
  } catch (err) {
    console.error('Send friend request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/friends/:id/accept
async function accept(req, res) {
  const { id } = req.params;
  try {
    const friendship = await getFriendshipById(id);
    if (!friendship) return res.status(404).json({ error: 'Request not found' });
    if (friendship.addressee_id !== req.userId) {
      return res.status(403).json({ error: 'Not your request to accept' });
    }
    if (friendship.status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending' });
    }

    const updated = await acceptFriendship(id);
    res.json({ friendship: updated });
  } catch (err) {
    console.error('Accept friend request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/friends/:id/reject
async function reject(req, res) {
  const { id } = req.params;
  try {
    const friendship = await getFriendshipById(id);
    if (!friendship) return res.status(404).json({ error: 'Request not found' });
    if (friendship.addressee_id !== req.userId) {
      return res.status(403).json({ error: 'Not your request to reject' });
    }

    await deleteFriendship(id);
    res.json({ message: 'Request rejected' });
  } catch (err) {
    console.error('Reject friend request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/friends
async function list(req, res) {
  try {
    const friends = await listFriends(req.userId);
    res.json({ friends });
  } catch (err) {
    console.error('List friends error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/friends/requests
async function pendingRequests(req, res) {
  try {
    const requests = await listIncomingRequests(req.userId);
    res.json({ requests });
  } catch (err) {
    console.error('List pending requests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/friends/activity
async function activity(req, res) {
  try {
    const feed = await getActivityFeed(req.userId);
    res.json({ activity: feed });
  } catch (err) {
    console.error('Get activity feed error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// DELETE /api/friends/:userId
async function unfriend(req, res) {
  const { userId } = req.params;
  try {
    await removeFriend(req.userId, userId);
    res.json({ message: 'Friend removed' });
  } catch (err) {
    console.error('Remove friend error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { request, accept, reject, list, pendingRequests, activity, unfriend };