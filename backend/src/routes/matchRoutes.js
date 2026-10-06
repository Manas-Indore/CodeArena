const express = require('express');
const { body } = require('express-validator');
const {
  createOpenBattle,
  listOpenBattles,
  createGroupBattle,
  listGroupBattles,
} = require('../controllers/matchController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

const createOpenValidation = [
  body('maxPlayers').optional().isInt({ min: 2, max: 10 }).withMessage('maxPlayers must be between 2 and 10'),
  body('problemSlug').optional().isString(),
];

const createGroupValidation = [
  body('maxPlayers').optional().isInt({ min: 4, max: 10 }).withMessage('maxPlayers must be between 4 and 10'),
  body('minRating').optional().isInt({ min: 0 }).withMessage('minRating must be a non-negative integer'),
  body('problemSlug').optional().isString(),
];

router.post('/open-battles', authMiddleware, createOpenValidation, createOpenBattle);
router.get('/open-battles', authMiddleware, listOpenBattles);

router.post('/group-battles', authMiddleware, createGroupValidation, createGroupBattle);
router.get('/group-battles', authMiddleware, listGroupBattles);

module.exports = router;