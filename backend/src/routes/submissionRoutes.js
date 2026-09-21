const express = require('express');
const { body } = require('express-validator');
const { submit, getOne, history } = require('../controllers/submissionController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

const submitValidation = [
  body('problemSlug').notEmpty().withMessage('problemSlug is required'),
  body('language').notEmpty().withMessage('language is required'),
  body('code').notEmpty().withMessage('code is required'),
];

router.post('/', authMiddleware, submitValidation, submit);
router.get('/history', authMiddleware, history);
router.get('/:id', authMiddleware, getOne);

module.exports = router;