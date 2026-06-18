const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');

app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', productRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => app.listen(5000, () => console.log('Server running on :5000')));
