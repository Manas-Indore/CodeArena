const express = require('express');
const { body } = require('express-validator');
const { createOpenBattle, listOpenBattles } = require('../controllers/matchController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

const createValidation = [
  body('maxPlayers').optional().isInt({ min: 2, max: 10 }).withMessage('maxPlayers must be between 2 and 10'),
  body('problemSlug').optional().isString(),
];

router.post('/open-battles', authMiddleware, createValidation, createOpenBattle);
router.get('/open-battles', authMiddleware, listOpenBattles);

module.exports = router;