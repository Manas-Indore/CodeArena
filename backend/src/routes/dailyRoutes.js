const express = require('express');
const { body } = require('express-validator');
const { today, streak, setDaily } = require('../controllers/dailyController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

const router = express.Router();

const setDailyValidation = [
  body('problemSlug').notEmpty().withMessage('problemSlug is required'),
  body('date')
    .optional()
    .isISO8601({ strict: true })
    .withMessage('date must be a valid YYYY-MM-DD date'),
];

router.get('/today', authMiddleware, today);
router.get('/streak', authMiddleware, streak);
router.post('/', authMiddleware, adminMiddleware, setDailyValidation, setDaily);

module.exports = router;