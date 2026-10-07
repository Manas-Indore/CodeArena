const express = require('express');
const { body } = require('express-validator');
const {
  request,
  accept,
  reject,
  list,
  pendingRequests,
  activity,
  unfriend,
} = require('../controllers/friendController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/request', authMiddleware, [body('username').notEmpty()], request);
router.post('/:id/accept', authMiddleware, accept);
router.post('/:id/reject', authMiddleware, reject);
router.get('/requests', authMiddleware, pendingRequests);
router.get('/activity', authMiddleware, activity);
router.get('/', authMiddleware, list);
router.delete('/:userId', authMiddleware, unfriend);

module.exports = router;