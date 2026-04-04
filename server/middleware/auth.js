'use strict';

const jwt = require('jsonwebtoken');
const { getUserById } = require('../db');

const SECRET = process.env.JWT_SECRET || 'change-in-production-minimum-32-chars';

function signToken(userId) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: '30d' });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.', code: 'AUTH_REQUIRED' });
  }
  try {
    const payload = jwt.verify(header.slice(7), SECRET);
    const user = getUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'User not found.', code: 'USER_NOT_FOUND' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.', code: 'TOKEN_INVALID' });
  }
}

module.exports = { signToken, requireAuth };
