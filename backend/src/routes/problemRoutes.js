const express = require('express');
const { body } = require('express-validator');
const { create, list, getOne } = require('../controllers/problemController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

const router = express.Router();

const createValidation = [
  body('title').trim().isLength({ min: 3, max: 150 }).withMessage('Title must be 3-150 characters'),
  body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('difficulty').isIn(['easy', 'medium', 'hard']).withMessage('Difficulty must be easy, medium, or hard'),
  body('testCases').isArray({ min: 1 }).withMessage('At least one test case is required'),
  body('testCases.*.input').notEmpty().withMessage('Test case input is required'),
  body('testCases.*.expectedOutput').notEmpty().withMessage('Test case expected output is required'),
];

// Order matters: specific routes before param routes isn't an issue here since
// list has no param, but keep create/list before :slug for clarity.
router.post('/', authMiddleware, adminMiddleware, createValidation, create);
router.get('/', list);
router.get('/:slug', getOne);

module.exports = router;