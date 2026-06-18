const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

router.get('/products', async (req, res) => {
  const products = await Product.find({});
  res.json(products);
});

router.post('/products', requireAuth, async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json(product);
});

router.put('/products/:id', requireAuth, async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(product);
});

router.delete('/products/:id', requireAuth, async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
