require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');

const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MONGODB_URI = String(process.env.MONGODB_URI || '').trim();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/', roleRoutes);
app.use('/', userRoutes);

app.use(function notFoundHandler(req, res) {
  return res.status(404).json({ message: 'Endpoint not found' });
});

app.use(function errorHandler(err, req, res, next) {
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }

  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((item) => item.message);
    return res.status(400).json({
      message: 'Validation failed',
      details,
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid request data' });
  }

  if (err.code === 11000) {
    const duplicateFields = Object.keys(err.keyPattern || err.keyValue || {});
    return res.status(409).json({
      message: 'Duplicate value violates a unique field',
      details: duplicateFields,
    });
  }

  if (err.name === 'MongoServerSelectionError') {
    return res.status(503).json({ message: 'Database connection is unavailable' });
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }
  return res.status(500).json({ message: 'Internal server error' });
});

async function startServer() {
  try {
    if (!MONGODB_URI) {
      throw new Error(
        'Missing MONGODB_URI. Configure .env (for example MongoDB Atlas URI) before starting server.'
      );
    }

    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
    });
    console.log('MongoDB connected');

    app.listen(PORT, function onListen() {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
