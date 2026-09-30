const jwt = require('jsonwebtoken');

// Verifies "Authorization: Bearer <token>" and sets req.userId
module.exports = (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Not logged in' });
  try {
    req.userId = jwt.verify(token, process.env.JWT_SECRET).id;
    next();
  } catch {
    res.status(401).json({ message: 'Session expired, please log in again' });
  }
};
