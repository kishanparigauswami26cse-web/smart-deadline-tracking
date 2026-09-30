// Entry point: Express app + MongoDB connection + static frontend
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const authRoutes = require('./auth');

const app = express();
app.use(express.json());

app.use('/api/auth', require('./auth'));
app.use('/api/tasks', require('./tasks'));

// Serve the frontend from /client
// Serve frontend
app.use(express.static(__dirname));

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

const PORT = process.env.PORT || 5000;
console.log("MONGO URI:", process.env.MONGO_URI);
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/deadline-tracker')
  .then(() => app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`)))
  .catch((e) => {
  console.error('MongoDB connection failed:', e.message);
  process.exit(1);
});
