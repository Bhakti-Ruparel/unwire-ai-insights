const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

router.get('/users', requireAuth, async (req, res) => {
  const users = await User.find({}).select('-password');
  res.json(users);
});

router.get('/users/:id', requireAuth, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(user);
});

router.patch('/users/:id', requireAuth, async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(user);
});

router.delete('/users/:id', requireAuth, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
