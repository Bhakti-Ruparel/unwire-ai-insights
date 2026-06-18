const express = require('express');
const router = express.Router();
const { login, register, logout } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

// Public routes
router.post('/auth/login', login);
router.post('/auth/register', register);
router.post('/auth/logout', logout);

// Protected route example
router.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
