const express = require('express');
const { getProfile, headToHead } = require('../controllers/profileController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/:username/profile', getProfile); // public — anyone can view a profile
router.get('/:username/head-to-head', authMiddleware, headToHead); // must be logged in

module.exports = router;